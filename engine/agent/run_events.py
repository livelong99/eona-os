"""RunEvent — the canonical typed event the dashboard cockpit, the tools
Workbench, and the Trust Rail all consume.

CONTRACT (Phase 0). This module defines the *shape* and the *kinds* only.
Worker W-A implements the producer side (projecting Claude Code stream-json
``tool_use`` / ``tool_result`` / system / sub-agent events into these kinds and
emitting them through the api_server run-event callback). Do not change the
kind names or the field set without updating the TS mirror in
``dashboard/src/lib/types.ts`` — the two MUST stay in lockstep.

The kinds intentionally align with (and extend) the run-event SSE the api_server
already emits (``message.delta``, ``tool.started``, ``tool.completed``,
``reasoning.available``, ``approval.request/responded``, ``run.completed/failed/
cancelled``); W-A adds the sub-agent / diff / terminal / header kinds.
"""
from __future__ import annotations

from typing import Any, Dict, Literal, Optional, TypedDict

# --- Canonical kinds ---------------------------------------------------------
RunEventKind = Literal[
    "run.header",          # model, tools, mcp servers (system/init)
    "message.delta",       # streaming assistant text
    "reasoning.available", # thinking/reasoning text
    "tool.started",        # a tool_use began
    "tool.completed",      # its tool_result arrived
    "diff",                # an Edit/Write file change (path + patch)
    "terminal",            # Bash stdout/stderr chunk
    "subagent.started",    # is_subagent turn began (child span)
    "subagent.completed",  # child span ended
    "approval.request",    # gate: irreversible/sensitive action awaits approval
    "approval.responded",
    "run.completed",
    "run.failed",
    "run.cancelled",
]

# Producers MUST emit only these kinds. Mirror of TS `RUN_EVENT_KINDS`.
RUN_EVENT_KINDS: frozenset[str] = frozenset(
    [
        "run.header", "message.delta", "reasoning.available",
        "tool.started", "tool.completed", "diff", "terminal",
        "subagent.started", "subagent.completed",
        "approval.request", "approval.responded",
        "run.completed", "run.failed", "run.cancelled",
    ]
)


class RunEvent(TypedDict, total=False):
    """One event on a run's SSE stream. Serialized as ``data: <json>\\n\\n``.

    Required on every event: ``event`` (the kind), ``run_id``, ``timestamp``.
    The remaining fields are kind-specific (see comments). Consumers must
    tolerate unknown/extra fields and unknown kinds (render generically, never
    crash) — see the defensive-parse note in W-A's contract.
    """
    event: RunEventKind     # the kind (named `event` to match existing SSE)
    run_id: str
    timestamp: float        # unix seconds

    # message.delta / reasoning.available / terminal
    text: str
    # tool.started / tool.completed
    tool: str
    preview: str            # human-readable label
    duration: float         # tool.completed: seconds
    error: bool             # tool.completed: failed?
    # diff
    path: str
    patch: str              # unified diff for an Edit/Write
    # subagent.started / subagent.completed
    span_id: str
    parent_tool_use_id: Optional[str]
    subagent_type: str
    # run.header
    model: str
    tools: list             # available tool names
    mcp_servers: list
    # approval.request
    choices: list           # e.g. ["once","session","always","deny"]
    # approval.responded
    choice: str
    # run.completed / run.failed
    output: str
    usage: Dict[str, Any]
    # run.failed
    # (uses `error` as a str message here; tool.completed uses `error` as bool)


def make_event(kind: RunEventKind, run_id: str, *, timestamp: float, **fields: Any) -> RunEvent:
    """Construct a RunEvent, asserting the kind is canonical (fail-fast in dev)."""
    if kind not in RUN_EVENT_KINDS:
        raise ValueError(f"unknown RunEvent kind: {kind!r}")
    ev: RunEvent = {"event": kind, "run_id": run_id, "timestamp": timestamp}  # type: ignore[assignment]
    ev.update(fields)  # type: ignore[typeddict-item]
    return ev
