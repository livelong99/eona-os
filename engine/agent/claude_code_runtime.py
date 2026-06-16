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

MVP: non-streaming (``--output-format json``). Streaming (``stream-json`` + an
event projector) is a follow-up; see references next to the codex projector.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Env passed through to the spawned hermes-tools MCP server so kanban tools can
# locate the board/task they belong to.
_KANBAN_ENV_KEYS = (
    "HERMES_KANBAN_TASK", "HERMES_KANBAN_WORKSPACE", "HERMES_KANBAN_RUN_ID",
    "HERMES_KANBAN_CLAIM_LOCK", "HERMES_KANBAN_DB", "HERMES_KANBAN_BOARD",
    "HERMES_HOME",
)


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

    def _build_cmd(self, user_input: str) -> List[str]:
        cmd = [
            self.claude_bin, "-p", user_input,
            "--output-format", "json",
            "--mcp-config", self._mcp_config(),
            "--allowedTools", self.allowed_tools,
            "--permission-mode", self.permission_mode,
        ]
        if self.session_id:
            cmd += ["--resume", self.session_id]
        return cmd

    def run_turn(self, *, user_input: str) -> ClaudeTurn:
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

    # The user message is already appended to `messages` by run_conversation().
    try:
        turn = agent._claude_session.run_turn(user_input=user_message)
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
