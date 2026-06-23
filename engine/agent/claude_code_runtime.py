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

import glob as _glob
import json
import logging
import os
import subprocess
import tempfile
import threading
import time
import uuid
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
# The sub-agent spawn tool. Named "Agent" in current Claude Code CLIs (2.1.x);
# "Task" in older ones. Both are handled so each spawned specialist gets a lane.
_SUBAGENT_TOOLS = frozenset({"Agent", "Task"})
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
    # The model the CLI actually ran (e.g. "claude-sonnet-4-6"), recovered from
    # the result's ``modelUsage`` keys or the stream ``system/init`` event. Lets
    # usage be attributed to the real model rather than the configured default.
    model: Optional[str] = None
    # CLI-reported API-equivalent cost for the turn (``total_cost_usd``).
    cost_usd: Optional[float] = None


def _dominant_model(model_usage: Any) -> Optional[str]:
    """Pick the model id with the most tokens from the CLI's ``modelUsage`` map.

    The ``claude`` CLI result carries ``modelUsage`` keyed by full model id, each
    value an object with input/output token counts. Returns the busiest model's
    id, or ``None`` when the map is absent/empty.
    """
    if not isinstance(model_usage, dict) or not model_usage:
        return None
    def _toks(v: Any) -> int:
        if not isinstance(v, dict):
            return 0
        out = 0
        for k in ("inputTokens", "outputTokens", "input_tokens", "output_tokens"):
            try:
                out += int(v.get(k) or 0)
            except (TypeError, ValueError):
                pass
        return out
    try:
        return max(model_usage.items(), key=lambda kv: _toks(kv[1]))[0]
    except ValueError:
        return None


def _coerce_usage_int(value: Any) -> int:
    """Best-effort int coercion for CLI-reported token counts."""
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _record_claude_code_usage(agent: Any, turn: "ClaudeTurn") -> None:
    """Persist a claude_code turn's usage / cost / real model to the session row.

    Parity with ``_record_codex_app_server_usage``: claude_code is a first-party
    subscription runtime, so the CLI's ``total_cost_usd`` is recorded as an
    **estimated** API-equivalent figure (billing mode ``subscription_included``),
    never as a charged amount. The session row was created with the configured
    placeholder model, and ``update_token_counts`` only backfills ``model`` when
    NULL — so the real CLI model is written explicitly via ``update_session_model``.

    Fully best-effort: any failure is logged and swallowed so the turn path is
    never affected.
    """
    db = getattr(agent, "_session_db", None)
    sid = getattr(agent, "session_id", None)
    if not db or not sid:
        return

    try:
        if not getattr(agent, "_session_db_created", True):
            agent._ensure_db_session()
    except Exception:
        logger.debug("claude_code: ensure_db_session failed", exc_info=True)

    usage = turn.usage if isinstance(turn.usage, dict) else {}
    input_tokens = _coerce_usage_int(usage.get("input_tokens"))
    output_tokens = _coerce_usage_int(usage.get("output_tokens"))
    cache_read = _coerce_usage_int(usage.get("cache_read_input_tokens"))
    cache_write = _coerce_usage_int(usage.get("cache_creation_input_tokens"))
    real_model = turn.model or None

    # Attribute usage to the model the CLI actually ran (overwrites the placeholder).
    if real_model:
        try:
            db.update_session_model(sid, real_model)
        except Exception:
            logger.debug("claude_code: update_session_model failed", exc_info=True)

    # Mirror the session-level accumulators the other runtimes maintain.
    try:
        agent.session_input_tokens = getattr(agent, "session_input_tokens", 0) + input_tokens
        agent.session_output_tokens = getattr(agent, "session_output_tokens", 0) + output_tokens
        agent.session_cache_read_tokens = getattr(agent, "session_cache_read_tokens", 0) + cache_read
        agent.session_cache_write_tokens = getattr(agent, "session_cache_write_tokens", 0) + cache_write
    except Exception:
        logger.debug("claude_code: session accumulator update failed", exc_info=True)

    est_cost = float(turn.cost_usd) if isinstance(turn.cost_usd, (int, float)) else None
    try:
        db.update_token_counts(
            sid,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            estimated_cost_usd=est_cost,
            cost_status="estimated" if est_cost is not None else None,
            cost_source="claude_cli" if est_cost is not None else None,
            billing_mode="subscription_included",
            model=real_model or getattr(agent, "model", None),
            api_call_count=1,
        )
    except Exception:
        logger.debug("claude_code: update_token_counts failed", exc_info=True)


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

    def __init__(self, run_id: str, on_event: Callable, suppress_exec: bool = False) -> None:
        self._run_id = run_id
        self._on_event = on_event
        # When the transcript tailer is the source of the execution log (swarm
        # runs), suppress the projector's exec events so the PM lane isn't doubled
        # — only run.header (lifecycle) passes through. The text token stream
        # (on_delta) is unaffected, so the PM response stays live.
        self._suppress_exec = suppress_exec
        # tool_use_id → {name, input_acc, start_ts}
        self._pending_tools: Dict[str, Dict[str, Any]] = {}
        # tool_use_id of the current streaming block (partial input accumulation)
        self._active_block_id: Optional[str] = None
        self._active_block_name: Optional[str] = None
        self._active_input_acc: str = ""
        # reasoning/thinking accumulator
        self._reasoning_acc: str = ""
        # Per-subagent span tracking. A single turn can fan out to MANY parallel
        # sub-agents (e.g. the brainstorm PM spawns four specialists at once), so
        # spans are keyed by the spawning Task's tool_use id (``parent_tool_use_id``)
        # rather than a single sticky flag. ``_open_spans`` maps that id →
        # subagent_type for every span currently open this turn.
        self._open_spans: Dict[str, str] = {}
        # parent_tool_use_id of the object currently being handled (None = main
        # agent). Captured in ``handle`` so ``_emit`` can stamp every event with
        # the agent lane it belongs to.
        self._cur_parent: Optional[str] = None

    def _emit(self, kind: str, **fields: Any) -> None:
        """Emit a RunEvent; unknown kinds fall back to a generic trace chip.

        Every event is stamped with the agent lane it belongs to: when the
        object currently being handled originates from a sub-agent, inject its
        ``parent_tool_use_id`` (and a matching ``span_id``) so the dashboard can
        route the event to that specialist's lane. Main-agent events carry no
        parent and render in the orchestrator (PM) lane. Explicit values passed
        by the caller always win.
        """
        if kind not in RUN_EVENT_KINDS:
            # Unknown kind: downgrade to tool.started trace chip (never crash).
            logger.debug("_StreamProjector: unknown kind %r, downgrading to trace", kind)
            fields = {"tool": "trace", "preview": fields.get("preview", kind)[:_TRACE_PREVIEW_MAX]}
            kind = "tool.started"
        if self._suppress_exec and kind != "run.header":
            return  # transcript tailer owns the execution log for this run
        if self._cur_parent and "parent_tool_use_id" not in fields:
            fields["parent_tool_use_id"] = self._cur_parent
            fields.setdefault("span_id", self._cur_parent)
        ev = make_event(kind, self._run_id, timestamp=time.time(), **fields)  # type: ignore[arg-type]
        _safe_call(self._on_event, ev, label="on_event")

    # ------------------------------------------------------------------ #
    # Top-level stream-json object dispatch                                #
    # ------------------------------------------------------------------ #

    def handle(self, o: Dict[str, Any]) -> None:
        """Process one parsed stream-json line object."""
        # ST-5: detect subagent identity from any top-level object. Capture the
        # lane (parent_tool_use_id) for the whole duration of handling this
        # object so every _emit during dispatch is stamped with it.
        self._cur_parent = o.get("parent_tool_use_id")
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
        # One span per spawning Task (parent_tool_use_id). Emit subagent.started
        # the first time each distinct lane is seen so parallel specialists each
        # get their own span. span_id == parent_tool_use_id keeps lanes unique
        # even when several share a subagent_type (e.g. "general-purpose").
        parent = o.get("parent_tool_use_id") or "subagent"
        if parent in self._open_spans:
            return
        subagent_type = o.get("subagent_type") or ""
        self._open_spans[parent] = subagent_type
        self._emit(
            "subagent.started",
            span_id=parent,
            parent_tool_use_id=parent,
            subagent_type=subagent_type,
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
                # Lane (agent) that started this tool, so its completion is
                # attributed correctly even though the tool_result arrives later
                # in a different object's handling context.
                "parent": self._cur_parent,
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

            # Build a human-readable preview. ``tid`` lets the dashboard map a
            # Task tool_use to the sub-agent span it spawns (the span's
            # parent_tool_use_id equals this id), so the specialist's lane can
            # be labelled from the Task's description.
            preview = _tool_preview(name, tool_input)
            self._emit("tool.started", tool=name, preview=preview, tid=bid)

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

        # ST-5: flush any sub-agent spans still open at turn end (defensive — a
        # span normally closes when its Task tool_result arrives).
        self._cur_parent = None
        for parent, subagent_type in list(self._open_spans.items()):
            self._close_span(parent)

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
        # Attribute the completion to the lane that started the tool (the
        # tool_result object itself has no reliable parent context here).
        self._cur_parent = (entry or {}).get("parent")
        if entry is not None:
            self._finalize_tool(bid, entry, is_error=is_error, result_content=str(content))
        # A Task tool_result closes its sub-agent span (its tool_use id is the
        # parent_tool_use_id every event from that specialist carried).
        if bid in self._open_spans:
            self._close_span(bid)
        self._cur_parent = None

    def _close_span(self, parent: str) -> None:
        """Emit subagent.completed for one open span and forget it."""
        subagent_type = self._open_spans.pop(parent, "")
        self._emit(
            "subagent.completed",
            span_id=parent,
            parent_tool_use_id=parent,
            subagent_type=subagent_type or "",
        )

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
        # Attribute every event from this completion to the lane that started it.
        self._cur_parent = entry.get("parent")

        extra: Dict[str, Any] = {}
        # For a sub-agent spawn completion, carry the sub-agent's final report so
        # the dashboard can show each specialist's output in its lane even when the
        # CLI does not stream the sub-agent's inner events to the parent process.
        # The spawn tool is named "Agent" in current CLIs ("Task" historically).
        if name in _SUBAGENT_TOOLS and result_content:
            extra["result"] = result_content[:8000]
        self._emit(
            "tool.completed",
            tool=name,
            duration=duration,
            error=is_error,
            preview=_tool_preview(name, tool_input),
            tid=bid,
            **extra,
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
        if name in _SUBAGENT_TOOLS:
            # Label the lane from the spawn. Include the subagent_type (the custom
            # agent slug, e.g. "frontend-dev") so the dashboard can infer the role
            # and merge the spawn lane with the sub-agent's transcript lane.
            sub = str(tool_input.get("subagent_type") or "").strip()
            desc = str(tool_input.get("description") or "").strip()
            if sub and desc:
                return f"{sub}: {desc}"[:80]
            return (sub or desc or name)[:80]
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


def _claude_config_dir() -> str:
    """Where the `claude` CLI writes its session/transcript files."""
    return os.path.expanduser(
        os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join("~", ".claude")
    )


class _SubagentTailer:
    """Tails Claude Code transcript JSONLs and projects each agent's inner work
    (thinking, text, tool calls) into the run's event stream as lane events.

    The `claude` CLI does NOT stream a sub-agent's internals to the parent
    process; for the PM (main agent) the stdout stream is a *projection*. The
    canonical record is the transcript Claude writes per completed block:
      - main agent: ``{config}/projects/*/{session}.jsonl``
      - each sub-agent: ``{config}/projects/*/{session}/subagents/agent-*.jsonl``
    A known ``--session-id`` makes both locatable. We tail them as the faithful,
    unified source of the execution log.

    Lane routing: sub-agent events are tagged ``subagent=True`` + ``lane_label``
    (so the dashboard groups them with the matching Agent spawn); main-agent
    events carry no lane tag → the PM lane. Main-agent *text* is skipped here
    because the token-level stream already provides it live (the stream and the
    transcript would otherwise double it); sub-agents have no stream, so their
    text IS emitted. Fully defensive — never raises into the turn.
    """

    def __init__(self, *, session_id: str, on_event: Callable, run_id: str,
                 include_main: bool = False, include_main_text: bool = False) -> None:
        self._session_id = session_id
        self._on_event = on_event
        self._run_id = run_id
        self._include_main = include_main
        # Live tailing skips main-agent text (the token stream already provides it).
        # A one-shot replay (no token stream) sets this True so the PM response
        # text is included when rebuilding the log on refresh.
        self._include_main_text = include_main_text
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._offsets: Dict[str, int] = {}     # file → byte offset already read
        self._labels: Dict[str, str] = {}       # file → lane label (1st user msg)
        self._tools: Dict[str, Dict[str, str]] = {}  # file → {tool_use_id: name}

    def start(self) -> None:
        # Snapshot existing files as already-read so we only surface THIS turn's
        # appends — the main transcript (and, on a resume turn, prior sub-agent
        # files) persist across turns and must not be replayed.
        for path in self._files():
            try:
                self._offsets[path] = os.path.getsize(path)
            except OSError:
                self._offsets[path] = 0
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        try:
            self._poll()  # final drain so the last lines aren't lost
        except Exception:
            logger.debug("transcript tailer final drain failed", exc_info=True)
        if self._thread is not None:
            self._thread.join(timeout=2.0)

    # -- internals ------------------------------------------------------------

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._poll()
            except Exception:
                logger.debug("transcript tailer poll failed", exc_info=True)
            self._stop.wait(0.4)

    def _files(self) -> List[str]:
        base = os.path.join(_claude_config_dir(), "projects", "*")
        files = _glob.glob(os.path.join(base, self._session_id, "subagents", "agent-*.jsonl"))
        if self._include_main:
            files += _glob.glob(os.path.join(base, f"{self._session_id}.jsonl"))
        return files

    @staticmethod
    def _is_main(path: str) -> bool:
        return (os.sep + "subagents" + os.sep) not in path

    def _poll(self) -> None:
        for path in self._files():
            self._read(path)

    def _read(self, path: str) -> None:
        off = self._offsets.get(path, 0)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                fh.seek(off)
                data = fh.read()
                self._offsets[path] = fh.tell()
        except OSError:
            return
        if not data:
            return
        file_id = os.path.basename(path)[:-6]  # strip ".jsonl"
        is_main = self._is_main(path)
        for line in data.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            self._project(path, file_id, obj, is_main)

    def _project(self, path: str, file_id: str, obj: Dict[str, Any], is_main: bool) -> None:
        # Lane tag: main agent → PM lane (untagged); sub-agent → its own lane.
        if is_main:
            lane: Dict[str, Any] = {}
        else:
            if file_id not in self._labels:
                lbl = self._label_from(obj)
                if lbl:
                    self._labels[file_id] = lbl
            lane = {"subagent": True, "lane_id": file_id,
                    "lane_label": self._labels.get(file_id, "")}

        t = obj.get("type")
        content = (obj.get("message") or {}).get("content")
        if not isinstance(content, list):
            return
        if t == "assistant":
            for block in content:
                if not isinstance(block, dict):
                    continue
                bt = block.get("type")
                if bt == "thinking" and block.get("thinking"):
                    self._emit("reasoning.available", lane, text=block["thinking"])
                elif bt == "text" and block.get("text") and (not is_main or self._include_main_text):
                    # Main-agent text comes from the live token stream already (live
                    # tailing skips it); a one-shot replay includes it.
                    self._emit("message.delta", lane, delta=block["text"])
                elif bt == "tool_use":
                    name = block.get("name") or ""
                    self._tools.setdefault(path, {})[block.get("id") or ""] = name
                    self._emit("tool.started", lane, tool=name, tid=block.get("id") or "",
                               preview=_tool_preview(name, block.get("input") or {}))
        elif t == "user":
            for block in content:
                if not isinstance(block, dict) or block.get("type") != "tool_result":
                    continue
                tuid = block.get("tool_use_id") or ""
                name = self._tools.get(path, {}).get(tuid, "")
                fields: Dict[str, Any] = {"tool": name, "tid": tuid, "error": bool(block.get("is_error"))}
                if name in _SUBAGENT_TOOLS:
                    fields["result"] = _flatten_result(block.get("content"))[:8000]
                self._emit("tool.completed", lane, **fields)

    @staticmethod
    def _label_from(obj: Dict[str, Any]) -> str:
        """A sub-agent's brief (its first user message) — names its metric, so
        the dashboard can group its lane with the matching Agent spawn."""
        if obj.get("type") != "user":
            return ""
        content = (obj.get("message") or {}).get("content")
        if isinstance(content, str):
            return content[:200]
        if isinstance(content, list):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "text" and b.get("text"):
                    return str(b["text"])[:200]
        return ""

    def _emit(self, kind: str, lane: Dict[str, Any], **fields: Any) -> None:
        ev = make_event(kind, self._run_id, timestamp=time.time(), **lane, **fields)
        _safe_call(self._on_event, ev, label="transcript_tail")


def _flatten_result(content: Any) -> str:
    """Flatten a tool_result's content (str or list of text blocks) to text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b.get("text", "") for b in content if isinstance(b, dict)
        )
    return ""


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
        # Live sub-agent transcript tailing (swarm tools). When enabled we pin a
        # known --session-id so the per-sub-agent transcript dir is locatable, and
        # tail those files to surface each specialist's inner work live.
        self.subagent_tail: bool = False
        self._preset_session_id: Optional[str] = None
        # Working directory for the `claude -p` subprocess. Defaults to engine_root
        # (so the hermes-tools MCP resolves); workspace runs set this to the
        # workspace folder so BMAD skills, git, and builds operate on the project.
        self.run_cwd: Optional[str] = None
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
        # Extra workspace roots forwarded as --add-dir (per-request). Tool-launch
        # runs (Labs) need filesystem latitude beyond cwd — read skill refs under
        # /opt/skills, uploaded docs + skill symlinks under /opt/data, and write
        # artifacts to the /vault Brands mount. Empty = unchanged (voice/chat).
        self.extra_dirs: List[str] = []
        self.claude_bin = os.environ.get("CLAUDE_BIN", "claude")
        # Allow the hermes-tools MCP server; Claude brings its own native tools.
        # Tool-launch runs widen this per-request (see run_claude_code_turn) so the
        # launched skill can use Read/Bash/Write without per-call permission prompts.
        self.allowed_tools = os.environ.get(
            "CLAUDE_RUNTIME_ALLOWED_TOOLS", "mcp__hermes-tools"
        )
        self.permission_mode = os.environ.get(
            "CLAUDE_RUNTIME_PERMISSION_MODE", "acceptEdits"
        )
        self.timeout = int(os.environ.get("CLAUDE_RUNTIME_TIMEOUT", "600"))
        # Extra MCP servers merged into --mcp-config per request. Set by the
        # dashboard for swarm tools (e.g. claude-flow/Ruflo). Empty = unchanged.
        self.extra_mcp_servers: Dict[str, Any] = {}

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
        # Merge any per-request extra servers (e.g. claude-flow for swarm tools).
        for name, spec in (self.extra_mcp_servers or {}).items():
            if name and isinstance(spec, dict):
                cfg["mcpServers"][name] = spec
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
        for extra_dir in self.extra_dirs:
            if extra_dir:
                cmd += ["--add-dir", extra_dir]
        if self.append_system_prompt:
            cmd += ["--append-system-prompt", self.append_system_prompt]
        if self.model_override:
            cmd += ["--model", self.model_override]
        if self.session_id:
            cmd += ["--resume", self.session_id]
        elif self._preset_session_id:
            # Fresh session with a known id (swarm tailing): create it under our id
            # so the sub-agent transcript dir is locatable while the turn runs.
            cmd += ["--session-id", self._preset_session_id]
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
                cmd, cwd=(self.run_cwd or self.engine_root), capture_output=True, text=True,
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
        _cost = data.get("total_cost_usd")
        return ClaudeTurn(
            final_text=final_text,
            projected_messages=[{"role": "assistant", "content": final_text}],
            tool_iterations=int(data.get("num_turns", 1) or 1),
            session_id=self.session_id,
            usage=data.get("usage", {}) or {},
            model=_dominant_model(data.get("modelUsage")) or (data.get("model") or None),
            cost_usd=float(_cost) if isinstance(_cost, (int, float)) else None,
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
        # Swarm runs source the execution log from transcripts (faithful + unified
        # PM/sub-agent), so the stdout projector is suppressed to lifecycle only.
        projector = (
            _StreamProjector(run_id=run_id, on_event=on_event, suppress_exec=self.subagent_tail)
            if on_event else None
        )

        cmd = self._build_cmd(user_input, stream=True)
        try:
            proc = subprocess.Popen(
                cmd, cwd=(self.run_cwd or self.engine_root), stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, bufsize=1,
            )
        except FileNotFoundError:
            return ClaudeTurn(error=f"`{self.claude_bin}` not found on PATH", interrupted=True)

        # Live sub-agent transcript tailing (swarm tools): surface each spawned
        # specialist's inner work, which the CLI does not stream to this process.
        tail_sid = self.session_id or self._preset_session_id
        tailer: Optional[_SubagentTailer] = None
        if self.subagent_tail and on_event is not None and tail_sid:
            tailer = _SubagentTailer(
                session_id=tail_sid, on_event=on_event, run_id=run_id, include_main=True,
            )
            tailer.start()

        final_text = ""
        session_id: Optional[str] = None
        err: Optional[str] = None
        usage: Dict[str, Any] = {}
        cost_usd: Optional[float] = None
        model_used: Optional[str] = None
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

                # --- tool_result blocks streamed as content_block_start ---
                if t == "stream_event":
                    ev = o.get("event", {}) or {}
                    if ev.get("type") == "content_block_start" and projector:
                        block = ev.get("content_block") or {}
                        if block.get("type") == "tool_result":
                            projector.handle_tool_result_block(block)

                # --- tool_result blocks delivered as a full `user` message ---
                # Tool results (incl. a Task/Agent sub-agent's final report) are
                # injected as a complete user message, NOT token-streamed, so they
                # never appear as content_block_start above. Pull them out here so
                # the tool completes with its result content (the sub-agent's
                # report, surfaced in its dashboard lane).
                if t == "user" and projector:
                    msg = o.get("message", {}) or {}
                    for block in (msg.get("content") or []):
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            projector.handle_tool_result_block(block)

                # --- system/init: the CLI announces the model it will run ---
                if t in ("system", "init") and o.get("model") and not model_used:
                    model_used = str(o.get("model"))

                # --- result: turn end, capture session_id/usage/cost/model ---
                if t == "result":
                    final_text = o.get("result", "") or final_text
                    session_id = o.get("session_id") or session_id
                    if o.get("usage"):
                        usage = o.get("usage") or usage
                    _c = o.get("total_cost_usd")
                    if isinstance(_c, (int, float)):
                        cost_usd = float(_c)
                    model_used = _dominant_model(o.get("modelUsage")) or model_used
                    if o.get("is_error"):
                        err = str(o.get("result") or "claude reported is_error")

                # --- project everything into RunEvents ---
                if projector is not None:
                    projector.handle(o)

            proc.wait(timeout=self.timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            err = f"claude -p timed out after {self.timeout}s"
        finally:
            if tailer is not None:
                tailer.stop()
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
            usage=usage,
            model=model_used,
            cost_usd=cost_usd,
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

    # Per-request workspace roots → CLI --add-dir. Set by the dashboard tool-launch
    # path (_start_run) so a launched skill can read its references/uploads and
    # write artifacts outside cwd. Empty list for voice/chat → no behaviour change.
    agent._claude_session.extra_dirs = list(getattr(agent, "_extra_dirs", None) or [])

    # Per-request allow-list widening → CLI --allowedTools. Tool-launch runs need
    # native Read/Bash/Write without per-call prompts; voice/chat keep the curated
    # mcp__hermes-tools default (None here → leave the env-derived default intact).
    _allowed_override = getattr(agent, "_allowed_tools_override", None)
    if _allowed_override:
        agent._claude_session.allowed_tools = _allowed_override

    # Per-request extra MCP servers → merged into --mcp-config. Set by the
    # dashboard for swarm tools (the brainstorm PM gets the claude-flow/Ruflo
    # server on top of hermes-tools). Empty for voice/chat → unchanged.
    agent._claude_session.extra_mcp_servers = dict(
        getattr(agent, "_extra_mcp_servers", None) or {}
    )

    # Live sub-agent transcript tailing (swarm tools). Pin a known --session-id on
    # a fresh session so the per-sub-agent transcript dir is locatable while the
    # turn runs; resumed turns already have a session id to tail.
    sess = agent._claude_session
    sess.subagent_tail = bool(getattr(agent, "_subagent_tail", False))
    # Per-request working directory (workspace runs operate on the project folder).
    sess.run_cwd = getattr(agent, "_run_cwd", None) or sess.run_cwd
    if sess.subagent_tail and not sess.session_id and not sess._preset_session_id:
        sess._preset_session_id = str(uuid.uuid4())

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

    # Record the turn's token usage, CLI-reported cost, and the real model into
    # the session row so dashboard usage tracking reflects claude_code activity
    # (parity with the codex/direct-LLM runtimes). Best-effort — never raises.
    _record_claude_code_usage(agent, turn)

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
