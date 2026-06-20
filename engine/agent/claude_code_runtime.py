"""Claude Code runtime for Hermes.

Mirrors ``agent/codex_runtime.py`` but hands each turn to the **real `claude`
CLI** (`claude -p`) instead of the Codex app-server. This is the legitimate,
on-subscription path: the official binary uses your Claude plan (first-party),
so there is no third-party "extra usage" metering. Hermes' own tools are exposed
to Claude Code over stdio MCP via ``agent/transports/hermes_tools_mcp_server.py``
(the same server the Codex runtime uses), so kanban workers, memory, search, etc.
keep working inside a Claude turn.

Invoked from ``run_conversation()`` when ``agent.api_mode == "claude_code"``.
Returns the same dict shape as the chat_completions / codex paths.

Streaming path (``stream-json`` + RunEvent projector):
  ``_run_turn_streaming`` consumes the full ``--output-format stream-json`` output
  and projects every event into canonical ``RunEvent`` dicts (see
  ``engine/agent/run_events.py``), forwarding them via the ``on_event`` callback.
  Unknown event types produce a generic trace chip — they never crash. The
  ``on_delta`` callback is preserved for backwards-compatible text streaming.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from agent.run_events import RUN_EVENT_KINDS, make_event

logger = logging.getLogger(__name__)

# Env passed through to the spawned hermes-tools MCP server so kanban tools can
# locate the board/task they belong to.
_KANBAN_ENV_KEYS = (
    "HERMES_KANBAN_TASK", "HERMES_KANBAN_WORKSPACE", "HERMES_KANBAN_RUN_ID",
    "HERMES_KANBAN_CLAIM_LOCK", "HERMES_KANBAN_DB", "HERMES_KANBAN_BOARD",
    "HERMES_HOME",
)

# Tools whose tool_use input carries file-edit semantics: path + old/new string.
_DIFF_TOOLS = frozenset({"Edit", "Write", "MultiEdit"})
# Max length for a generic trace chip preview to avoid flooding the SSE queue.
_TRACE_PREVIEW_MAX = 120


@dataclass
class ClaudeTurn:
    """Result of one `claude -p` turn, shaped for run_claude_code_turn()."""
    final_text: str = ""
    projected_messages: List[Dict[str, Any]] = field(default_factory=list)
    tool_iterations: int = 1
    interrupted: bool = False
    error: Optional[str] = None
    session_id: Optional[str] = None
    usage: Dict[str, Any] = field(default_factory=dict)


def _safe_call(cb: Optional[Callable], *args: Any, label: str = "callback") -> None:
    """Call cb(*args), swallowing any exception so the stream loop never crashes."""
    if cb is None:
        return
    try:
        cb(*args)
    except Exception:
        logger.debug("%s raised", label, exc_info=True)


def _make_patch(tool_input: Dict[str, Any]) -> str:
    """Build a pseudo unified-diff patch from an Edit/Write tool_use input.

    Uses ``old_string`` / ``new_string`` for Edit, and treats a Write as
    replacing the entire file (old = "", new = content).  Returns an empty
    string when neither field is present so callers can still emit the diff
    event with just a path.
    """
    try:
        path = tool_input.get("path") or tool_input.get("file_path") or "unknown"
        old = tool_input.get("old_string", "") or ""
        new = tool_input.get("new_string", "") or tool_input.get("content", "") or ""
        if not old and not new:
            return ""
        old_lines = old.splitlines(keepends=True)
        new_lines = new.splitlines(keepends=True)
        # Minimal unified-diff header; no line-number offsets (dashboard only needs
        # the +/- lines for syntax-highlighted display, not git-apply precision).
        header = f"--- a/{path}\n+++ b/{path}\n@@ ... @@\n"
        body = "".join(f"-{l}" for l in old_lines) + "".join(f"+{l}" for l in new_lines)
        return header + body
    except Exception:
        logger.debug("_make_patch raised", exc_info=True)
        return ""


class _StreamProjector:
    """Stateful projector that turns raw stream-json objects into RunEvents.

    Lives for one ``_run_turn_streaming`` call.  All state (pending tool_use
    blocks, reasoning accumulator, subagent flag) is isolated per-turn.
    """

    def __init__(self, run_id: str, on_event: Callable) -> None:
        self._run_id = run_id
        self._on_event = on_event
        # tool_use_id → {name, input_acc, start_ts}
        self._pending_tools: Dict[str, Dict[str, Any]] = {}
        # tool_use_id of the current streaming block (partial input accumulation)
        self._active_block_id: Optional[str] = None
        self._active_block_name: Optional[str] = None
        self._active_input_acc: str = ""
        # reasoning/thinking accumulator
        self._reasoning_acc: str = ""
        # subagent identity seen in this turn
        self._is_subagent: bool = False
        self._parent_tool_use_id: Optional[str] = None
        self._subagent_type: Optional[str] = None
        self._subagent_started: bool = False

    def _emit(self, kind: str, **fields: Any) -> None:
        """Emit a RunEvent; unknown kinds fall back to a generic trace chip."""
        if kind not in RUN_EVENT_KINDS:
            # Unknown kind: downgrade to tool.started trace chip (never crash).
            logger.debug("_StreamProjector: unknown kind %r, downgrading to trace", kind)
            fields = {"tool": "trace", "preview": fields.get("preview", kind)[:_TRACE_PREVIEW_MAX]}
            kind = "tool.started"
        ev = make_event(kind, self._run_id, timestamp=time.time(), **fields)  # type: ignore[arg-type]
        _safe_call(self._on_event, ev, label="on_event")

    # ------------------------------------------------------------------ #
    # Top-level stream-json object dispatch                                #
    # ------------------------------------------------------------------ #

    def handle(self, o: Dict[str, Any]) -> None:
        """Process one parsed stream-json line object."""
        # ST-5: detect subagent identity from any top-level object.
        self._detect_subagent(o)

        t = o.get("type")
        try:
            if t == "system":
                self._handle_system(o)
            elif t == "stream_event":
                self._handle_stream_event(o.get("event", {}) or {})
            elif t == "result":
                self._handle_result(o)
            else:
                # ST-7: unknown top-level type → generic trace chip.
                if t is not None:
                    self._emit_trace(o, label=f"unknown:{t}")
        except Exception:
            # Defensive: never let projector bugs crash the stream loop.
            logger.debug("_StreamProjector.handle raised for type=%r", t, exc_info=True)

    # ------------------------------------------------------------------ #
    # ST-5: subagent identity                                             #
    # ------------------------------------------------------------------ #

    def _detect_subagent(self, o: Dict[str, Any]) -> None:
        if not o.get("is_subagent"):
            return
        self._is_subagent = True
        self._parent_tool_use_id = o.get("parent_tool_use_id")
        self._subagent_type = o.get("subagent_type") or ""
        if not self._subagent_started:
            self._subagent_started = True
            # Use subagent_type as span_id fallback until session_id is known.
            self._emit(
                "subagent.started",
                span_id=self._subagent_type or "subagent",
                parent_tool_use_id=self._parent_tool_use_id,
                subagent_type=self._subagent_type,
            )

    # ------------------------------------------------------------------ #
    # ST-2: system/init → run.header                                      #
    # ------------------------------------------------------------------ #

    def _handle_system(self, o: Dict[str, Any]) -> None:
        subtype = o.get("subtype") or o.get("event_type") or ""
        if subtype == "init":
            tools: List[str] = []
            mcp_servers: List[str] = []
            try:
                tools = [t.get("name", "") for t in (o.get("tools") or []) if isinstance(t, dict)]
                mcp_servers = list(o.get("mcp_servers") or [])
            except Exception:
                pass
            self._emit(
                "run.header",
                model=str(o.get("model") or ""),
                tools=tools,
                mcp_servers=mcp_servers,
            )
        else:
            # Other system events (api_retry, etc.) → trace chip.
            self._emit_trace(o, label=f"system:{subtype}")

    # ------------------------------------------------------------------ #
    # stream_event dispatch                                                #
    # ------------------------------------------------------------------ #

    def _handle_stream_event(self, ev: Dict[str, Any]) -> None:
        ev_type = ev.get("type") or ""
        if ev_type == "content_block_start":
            self._handle_block_start(ev)
        elif ev_type == "content_block_delta":
            self._handle_block_delta(ev)
        elif ev_type == "content_block_stop":
            self._handle_block_stop(ev)
        elif ev_type == "message_start":
            pass  # no RunEvent for message envelope open
        elif ev_type == "message_delta":
            pass  # stop_reason etc.; not projected
        elif ev_type == "message_stop":
            pass  # no RunEvent for message envelope close
        # Any other stream event → trace chip.
        elif ev_type:
            self._emit_trace(ev, label=f"stream:{ev_type}")

    # ------------------------------------------------------------------ #
    # ST-3: tool_use block accumulation → tool.started                    #
    # ------------------------------------------------------------------ #

    def _handle_block_start(self, ev: Dict[str, Any]) -> None:
        block = ev.get("content_block") or {}
        btype = block.get("type") or ""
        if btype == "tool_use":
            bid = block.get("id") or ""
            bname = block.get("name") or ""
            self._active_block_id = bid
            self._active_block_name = bname
            self._active_input_acc = ""
            # Record start timestamp so tool.completed can report duration.
            self._pending_tools[bid] = {
                "name": bname,
                "input_acc": "",
                "start_ts": time.time(),
            }
        elif btype == "thinking":
            # Thinking block start: reset accumulator.
            self._reasoning_acc = ""

    def _handle_block_delta(self, ev: Dict[str, Any]) -> None:
        delta = ev.get("delta") or {}
        dtype = delta.get("type") or ""

        if dtype == "text_delta":
            # Handled by the outer loop via on_delta; nothing extra here.
            pass

        elif dtype == "input_json_delta":
            # ST-3: accumulate tool_use input JSON fragment.
            if self._active_block_id and self._active_block_id in self._pending_tools:
                fragment = delta.get("partial_json") or ""
                self._pending_tools[self._active_block_id]["input_acc"] += fragment

        elif dtype == "thinking_delta":
            # ST-6: accumulate reasoning/thinking text.
            self._reasoning_acc += delta.get("thinking") or ""

        elif dtype == "signature_delta":
            pass  # thinking block signature; not projected

        # Any other delta type → trace chip.
        elif dtype:
            self._emit_trace(delta, label=f"delta:{dtype}")

    def _handle_block_stop(self, ev: Dict[str, Any]) -> None:
        # Finalise whatever block was open.
        bid = self._active_block_id
        bname = self._active_block_name

        # ST-6: flush reasoning if we were accumulating thinking.
        if self._reasoning_acc:
            self._emit("reasoning.available", text=self._reasoning_acc)
            self._reasoning_acc = ""

        if bid and bid in self._pending_tools:
            entry = self._pending_tools[bid]
            name = entry.get("name") or bname or ""
            raw_input = entry.get("input_acc") or ""

            # Parse the accumulated input JSON (defensive).
            tool_input: Dict[str, Any] = {}
            try:
                tool_input = json.loads(raw_input) if raw_input.strip() else {}
            except json.JSONDecodeError:
                pass
            entry["tool_input"] = tool_input

            # Build a human-readable preview.
            preview = _tool_preview(name, tool_input)
            self._emit("tool.started", tool=name, preview=preview)

        self._active_block_id = None
        self._active_block_name = None
        self._active_input_acc = ""

    # ------------------------------------------------------------------ #
    # ST-4: tool_result → tool.completed + diff/terminal                  #
    # ------------------------------------------------------------------ #

    def _handle_result(self, o: Dict[str, Any]) -> None:
        """Top-level ``result`` object: turn end. Also handles tool_result
        blocks embedded in assistant/user message arrays when present."""
        # tool_result blocks appear inside the messages list, not as a
        # separate top-level type in stream-json — but the ``result``
        # object itself signals turn end and contains the session_id/usage.
        # We flush any un-completed tool tracking here with a synthetic
        # tool.completed so the dashboard trace never has hanging starts.
        for bid, entry in list(self._pending_tools.items()):
            if "tool_input" not in entry:
                # Block stop never arrived — flush defensively.
                self._pending_tools.pop(bid, None)
                continue
            self._finalize_tool(bid, entry, is_error=False, result_content="")

        # ST-5: subagent.completed on turn end.
        if self._is_subagent and self._subagent_started:
            self._emit(
                "subagent.completed",
                span_id=self._subagent_type or "subagent",
                parent_tool_use_id=self._parent_tool_use_id,
                subagent_type=self._subagent_type or "",
            )

    def handle_tool_result_block(self, block: Dict[str, Any]) -> None:
        """Called when a ``tool_result`` content block is encountered inside
        a user-turn message in the stream.  This is the canonical completion
        signal for a tool_use block.
        """
        bid = block.get("tool_use_id") or ""
        is_error = bool(block.get("is_error"))
        content = block.get("content") or ""
        if isinstance(content, list):
            # Flatten text blocks.
            content = "".join(
                c.get("text", "") for c in content if isinstance(c, dict)
            )
        entry = self._pending_tools.pop(bid, None)
        if entry is None:
            return
        self._finalize_tool(bid, entry, is_error=is_error, result_content=str(content))

    def _finalize_tool(
        self,
        bid: str,
        entry: Dict[str, Any],
        *,
        is_error: bool,
        result_content: str,
    ) -> None:
        """Emit tool.completed + (diff | terminal) for one completed tool call."""
        name = entry.get("name") or ""
        start_ts = entry.get("start_ts") or time.time()
        duration = round(time.time() - start_ts, 3)
        tool_input: Dict[str, Any] = entry.get("tool_input") or {}

        self._emit(
            "tool.completed",
            tool=name,
            duration=duration,
            error=is_error,
            preview=_tool_preview(name, tool_input),
        )

        if name in _DIFF_TOOLS:
            # ST-4: emit diff event with pseudo unified patch.
            path = (
                tool_input.get("path")
                or tool_input.get("file_path")
                or ""
            )
            patch = _make_patch(tool_input)
            if path:
                self._emit("diff", path=path, patch=patch)

        elif name == "Bash":
            # ST-4: emit terminal event with the command output.
            if result_content:
                self._emit("terminal", text=result_content)

    # ------------------------------------------------------------------ #
    # ST-7: generic trace chip for unknown events                          #
    # ------------------------------------------------------------------ #

    def _emit_trace(self, obj: Any, *, label: str = "trace") -> None:
        try:
            preview = str(obj)[:_TRACE_PREVIEW_MAX]
        except Exception:
            preview = label
        self._emit("tool.started", tool="trace", preview=preview)


def _tool_preview(name: str, tool_input: Dict[str, Any]) -> str:
    """Generate a short human-readable preview for a tool call."""
    try:
        if name in _DIFF_TOOLS:
            path = tool_input.get("path") or tool_input.get("file_path") or ""
            return f"{name} {path}" if path else name
        if name == "Bash":
            cmd = tool_input.get("command") or ""
            return f"$ {cmd[:80]}" if cmd else "Bash"
        if name in ("Read", "Grep", "Glob"):
            target = (
                tool_input.get("file_path")
                or tool_input.get("pattern")
                or tool_input.get("path")
                or ""
            )
            return f"{name} {target[:60]}" if target else name
        # Generic: first string value found.
        for v in tool_input.values():
            if isinstance(v, str) and v:
                return f"{name}: {v[:60]}"
        return name
    except Exception:
        return name


class ClaudeCodeSession:
    """Drives the real `claude` CLI for a single AIAgent, across turns.

    Conversation continuity is preserved via Claude Code's own `--resume
    <session_id>` (captured from the first turn's JSON result).
    """

    def __init__(self, *, cwd: Optional[str] = None,
                 engine_root: Optional[str] = None) -> None:
        self.cwd = cwd or os.getcwd()
        # Repo root so `python -m agent.transports.hermes_tools_mcp_server` resolves.
        self.engine_root = engine_root or os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))
        )
        self.session_id: Optional[str] = None
        self._mcp_config_path: Optional[str] = None
        # When set (per-request), forwarded to the CLI as --append-system-prompt.
        # This is the ONLY hook that reliably imposes a caller persona/style
        # (e.g. the dashboard's voice "Jarvis" prompt); a request system message
        # alone is overridden by Claude Code's own identity.
        self.append_system_prompt: Optional[str] = None
        # When set (per-request), forwarded to the CLI as --model. The claude_code
        # path otherwise never passes --model, so None here = unchanged behaviour
        # (the CLI uses its default model). The Labs tool builder/refine endpoints
        # set this to "claude-opus-4-8" for authoring accuracy.
        self.model_override: Optional[str] = None
        self.claude_bin = os.environ.get("CLAUDE_BIN", "claude")
        # Allow the hermes-tools MCP server; Claude brings its own native tools.
        self.allowed_tools = os.environ.get(
            "CLAUDE_RUNTIME_ALLOWED_TOOLS", "mcp__hermes-tools"
        )
        self.permission_mode = os.environ.get(
            "CLAUDE_RUNTIME_PERMISSION_MODE", "acceptEdits"
        )
        self.timeout = int(os.environ.get("CLAUDE_RUNTIME_TIMEOUT", "600"))

    def _mcp_config(self) -> str:
        if self._mcp_config_path and os.path.exists(self._mcp_config_path):
            return self._mcp_config_path
        env = {k: os.environ[k] for k in _KANBAN_ENV_KEYS if k in os.environ}
        cfg = {
            "mcpServers": {
                "hermes-tools": {
                    "command": os.environ.get("HERMES_PYTHON", "python3"),
                    "args": ["-m", "agent.transports.hermes_tools_mcp_server"],
                    "env": {"PYTHONPATH": self.engine_root, **env},
                }
            }
        }
        fd, path = tempfile.mkstemp(prefix="claude-mcp-", suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(cfg, f)
        self._mcp_config_path = path
        return path

    def _build_cmd(self, user_input: str, *, stream: bool = False) -> List[str]:
        cmd = [self.claude_bin, "-p", user_input]
        if stream:
            cmd += ["--output-format", "stream-json",
                    "--include-partial-messages", "--verbose"]
        else:
            cmd += ["--output-format", "json"]
        cmd += [
            "--mcp-config", self._mcp_config(),
            "--allowedTools", self.allowed_tools,
            "--permission-mode", self.permission_mode,
        ]
        if self.append_system_prompt:
            cmd += ["--append-system-prompt", self.append_system_prompt]
        if self.model_override:
            cmd += ["--model", self.model_override]
        if self.session_id:
            cmd += ["--resume", self.session_id]
        return cmd

    # ST-1: on_event added alongside on_delta.
    def run_turn(self, *, user_input: str, on_delta=None, on_event=None) -> ClaudeTurn:
        """Run one turn.

        ``on_delta(text)`` is called per text_delta (backwards-compat streaming).
        ``on_event(run_event_dict)`` is called per projected RunEvent — the richer
        signal the dashboard Glass Cockpit and Trust Rail consume.
        """
        # Streaming path: use when either callback is wired up.
        if on_delta is not None or on_event is not None:
            return self._run_turn_streaming(
                user_input=user_input, on_delta=on_delta, on_event=on_event
            )
        cmd = self._build_cmd(user_input)
        try:
            proc = subprocess.run(
                cmd, cwd=self.engine_root, capture_output=True, text=True,
                timeout=self.timeout,
            )
        except FileNotFoundError:
            return ClaudeTurn(error=f"`{self.claude_bin}` not found on PATH",
                              interrupted=True)
        except subprocess.TimeoutExpired:
            return ClaudeTurn(error=f"claude -p timed out after {self.timeout}s",
                              interrupted=True)

        if proc.returncode != 0:
            return ClaudeTurn(
                error=f"claude exited {proc.returncode}: {proc.stderr.strip()[:500]}",
                interrupted=True,
            )

        try:
            data = json.loads(proc.stdout)
        except json.JSONDecodeError:
            # Fall back to raw text if not JSON (e.g., a plain string result).
            text = proc.stdout.strip()
            return ClaudeTurn(final_text=text,
                              projected_messages=[{"role": "assistant", "content": text}])

        if data.get("is_error"):
            return ClaudeTurn(error=str(data.get("result") or "claude reported is_error"),
                              interrupted=True)

        final_text = data.get("result", "") or ""
        self.session_id = data.get("session_id") or self.session_id
        return ClaudeTurn(
            final_text=final_text,
            projected_messages=[{"role": "assistant", "content": final_text}],
            tool_iterations=int(data.get("num_turns", 1) or 1),
            session_id=self.session_id,
            usage=data.get("usage", {}) or {},
        )

    def _run_turn_streaming(
        self,
        *,
        user_input: str,
        on_delta: Optional[Callable],
        on_event: Optional[Callable],
    ) -> ClaudeTurn:
        """Stream ``claude -p --output-format stream-json``.

        Calls ``on_delta(text)`` per text_delta for backwards-compatible live
        text streaming.  Calls ``on_event(RunEvent)`` per projected RunEvent for
        the full Glass Cockpit trace (tool_use, tool_result, diff, terminal,
        subagent spans, run.header, reasoning).

        A ``_StreamProjector`` handles all RunEvent construction; this method
        only drives the line-by-line stdio loop and assembles the ClaudeTurn.
        """
        # Require a run_id for RunEvents; use a sentinel when on_event is absent.
        run_id = getattr(on_event, "_run_id", None) or "local"
        projector = _StreamProjector(run_id=run_id, on_event=on_event) if on_event else None

        cmd = self._build_cmd(user_input, stream=True)
        try:
            proc = subprocess.Popen(
                cmd, cwd=self.engine_root, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, bufsize=1,
            )
        except FileNotFoundError:
            return ClaudeTurn(error=f"`{self.claude_bin}` not found on PATH", interrupted=True)

        final_text = ""
        session_id: Optional[str] = None
        err: Optional[str] = None
        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    o = json.loads(line)
                except json.JSONDecodeError:
                    continue

                t = o.get("type")

                # --- text_delta: call on_delta for backwards-compat streaming ---
                if t == "stream_event":
                    ev = o.get("event", {}) or {}
                    if ev.get("type") == "content_block_delta":
                        d = ev.get("delta", {}) or {}
                        if d.get("type") == "text_delta" and d.get("text"):
                            _safe_call(on_delta, d["text"], label="on_delta")

                # --- tool_result blocks in user-turn messages ---
                if t == "stream_event":
                    ev = o.get("event", {}) or {}
                    if ev.get("type") == "content_block_start" and projector:
                        block = ev.get("content_block") or {}
                        if block.get("type") == "tool_result":
                            projector.handle_tool_result_block(block)

                # --- result: turn end, capture session_id/usage ---
                if t == "result":
                    final_text = o.get("result", "") or final_text
                    session_id = o.get("session_id") or session_id
                    if o.get("is_error"):
                        err = str(o.get("result") or "claude reported is_error")

                # --- project everything into RunEvents ---
                if projector is not None:
                    projector.handle(o)

            proc.wait(timeout=self.timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            err = f"claude -p timed out after {self.timeout}s"
        if err is None and proc.returncode not in (0, None) and not final_text:
            stderr = (proc.stderr.read() if proc.stderr else "")[:500]
            err = f"claude exited {proc.returncode}: {stderr.strip()}"

        self.session_id = session_id or self.session_id
        return ClaudeTurn(
            final_text=final_text,
            projected_messages=[{"role": "assistant", "content": final_text}],
            session_id=self.session_id,
            error=err,
            interrupted=err is not None,
        )

    def close(self) -> None:
        if self._mcp_config_path and os.path.exists(self._mcp_config_path):
            try:
                os.unlink(self._mcp_config_path)
            except OSError:
                pass
        self._mcp_config_path = None


def run_claude_code_turn(
    agent,
    *,
    user_message: str,
    original_user_message: Any,
    messages: List[Dict[str, Any]],
    effective_task_id: str,
    should_review_memory: bool = False,
) -> Dict[str, Any]:
    """Claude Code runtime path. Hands the whole turn to the real `claude` CLI
    and projects its result back into Hermes' messages. Returns the same dict
    shape as the chat_completions / codex paths.
    """
    # Lazy session, one per AIAgent instance (reused across turns).
    if getattr(agent, "_claude_session", None) is None:
        cwd = getattr(agent, "session_cwd", None) or os.getcwd()
        agent._claude_session = ClaudeCodeSession(cwd=cwd)

    # Per-request persona/style → CLI --append-system-prompt. Set by the API
    # server from the request's system message (the dashboard voice path uses it
    # for the "Jarvis" prompt). None for normal agent turns → no behaviour change.
    agent._claude_session.append_system_prompt = getattr(
        agent, "_append_system_prompt", None
    )

    # Per-request model override → CLI --model. Set by the API server for the
    # Labs tool builder/refine endpoints (Opus 4.8 for authoring accuracy).
    # None for normal agent turns → no behaviour change.
    agent._claude_session.model_override = getattr(
        agent, "_model_override", None
    )

    # The user message is already appended to `messages` by run_conversation().
    # Pass both stream callbacks so deltas and rich RunEvents flow to the dashboard SSE.
    on_delta = getattr(agent, "stream_delta_callback", None)
    # ST-1: also wire the run_event_callback (set by api_server._make_run_event_callback).
    on_event = getattr(agent, "run_event_callback", None)
    try:
        turn = agent._claude_session.run_turn(
            user_input=user_message, on_delta=on_delta, on_event=on_event
        )
    except Exception as exc:  # noqa: BLE001 — crash → drop session, report partial
        logger.exception("claude_code turn failed")
        try:
            agent._claude_session.close()
        except Exception:
            pass
        agent._claude_session = None
        return {
            "final_response": f"Claude Code turn failed: {exc}.",
            "messages": messages,
            "api_calls": 0,
            "completed": False,
            "partial": True,
            "error": str(exc),
        }

    if turn.projected_messages:
        messages.extend(turn.projected_messages)

    agent._iters_since_skill = (
        getattr(agent, "_iters_since_skill", 0) + turn.tool_iterations
    )

    # External memory sync (skip on error/interrupt), mirroring the codex path.
    if not turn.interrupted and turn.error is None:
        try:
            agent._sync_external_memory_for_turn(
                original_user_message=original_user_message,
                final_response=turn.final_text,
                interrupted=False,
            )
        except Exception:
            logger.debug("external memory sync raised", exc_info=True)

    return {
        "final_response": turn.final_text,
        "messages": messages,
        "api_calls": 1,
        "completed": not turn.interrupted and turn.error is None,
        "partial": turn.interrupted or turn.error is not None,
        "error": turn.error,
        "claude_session_id": turn.session_id,
    }
