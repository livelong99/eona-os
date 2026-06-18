"""Dashboard data API — implements the Kanban/memory/events/tools/goal endpoints.

Worker W-B fills: ``GET /v1/tasks`` (Kanban board → Task[]),
``GET /v1/memory`` (vault galaxy → MemoryGraph), ``GET /v1/events`` (global
SSE TaskEvent stream).  Shapes match ``dashboard/src/lib/types.ts``.

Worker B2 fills: ``POST /v1/tools/{tool_id}/launch`` (Workbench run-start) and
``POST /v1/goal`` (Goal Mode run-start with judge loop).  Both reuse the
adapter's existing run-start machinery (``_create_agent``, ``_set_run_status``,
``_make_run_event_callback``) via the module-level ``_start_run`` helper so
``api_server.py`` is never touched.

This module is intentionally isolated so these workers never edit the
api_server route block: ``ApiServerPlatform`` calls
``register_dashboard_routes(app, adapter)`` once at startup (pre-wired in
Phase 0).
"""
from __future__ import annotations

import asyncio
import glob
import json
import logging
import math
import os
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:  # pragma: no cover
    from aiohttp import web

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers: Kanban DB
# ---------------------------------------------------------------------------

def _connect_kanban():
    """Lazy import + connect to the kanban DB.  Same pattern as kanban_tools."""
    from hermes_cli import kanban_db as kb
    conn = kb.connect()
    return kb, conn


def _task_to_dict(t: Any) -> dict:
    """Map a kanban_db.Task to the dashboard Task shape.

    kanban_db stores timestamps as integer *seconds* (Unix epoch).
    The TS type expects ``updatedAt`` in *milliseconds*.
    """
    ts_s = t.completed_at or t.started_at or t.created_at or 0
    return {
        "id": t.id,
        "title": t.title,
        "status": t.status,
        # assignee is optional in the TS type; omit key when None
        **({"assignee": t.assignee} if t.assignee else {}),
        "updatedAt": ts_s * 1000,
    }


# ---------------------------------------------------------------------------
# Helpers: memory galaxy layout (mirrors mock.ts galaxy())
# ---------------------------------------------------------------------------

_FALLBACK_LABELS = [
    "architecture", "hermes", "kanban", "obsidian-memory",
    "claude-runtime", "security", "writer", "researcher",
]

_VAULT_GLOB_DEFAULT = os.path.join(
    os.path.expanduser(os.environ.get("HERMES_VAULT_PATH", "~/Documents/Obsidian/Vault")),
    "**", "*.md",
)


def _build_galaxy(labels: list[str]) -> dict:
    """Deterministic radial galaxy layout — mirrors mock.ts galaxy()."""
    n = len(labels)
    nodes = []
    for i, label in enumerate(labels):
        ring = i % 3
        r = 0.16 + ring * 0.17
        a = (i / n) * math.pi * 2 + ring * 0.6
        # Linear congruential jitter (same constants as mock.ts)
        jitter = ((i * 9301 + 49297) % 233280) / 233280 - 0.5
        nodes.append({
            "id": label,
            "label": label,
            "x": 0.5 + math.cos(a) * (r + jitter * 0.05),
            "y": 0.5 + math.sin(a) * (r + jitter * 0.05),
            "weight": 0.6 + ((i * 7) % 5) / 5,
        })
    edges = [
        {"from": nodes[i]["id"], "to": nodes[(i * 3 + 1) % n]["id"]}
        for i in range(1, n)
    ]
    # Hub anchors for the first two nodes (mirrors mock)
    if n >= 2:
        edges.append({"from": nodes[0]["id"], "to": nodes[1]["id"]})
    if n >= 3:
        edges.append({"from": nodes[0]["id"], "to": nodes[2]["id"]})
    return {"nodes": nodes, "edges": edges}


def _vault_labels(cap: int = 40) -> list[str]:
    """Return up to ``cap`` note stems from the Obsidian vault.

    Falls back to ``_FALLBACK_LABELS`` on any error so the endpoint stays
    live even when the vault path is wrong or unreadable.
    """
    try:
        paths = glob.glob(_VAULT_GLOB_DEFAULT, recursive=True)
        seen: set[str] = set()
        labels: list[str] = []
        for p in paths:
            stem = Path(p).stem
            # Skip hidden / system notes and exact duplicates
            if stem.startswith(".") or stem.startswith("_") or stem in seen:
                continue
            seen.add(stem)
            labels.append(stem)
            if len(labels) >= cap:
                break
        return labels if labels else _FALLBACK_LABELS
    except Exception:
        logger.debug("vault label scan failed; using fallback", exc_info=True)
        return _FALLBACK_LABELS


# ---------------------------------------------------------------------------
# Helpers: tool manifests (Launchpad) + approvals (Trust Rail)
# ---------------------------------------------------------------------------

# Fixed approval choice set — mirrors api_server's _approval_notify and the
# per-run POST /v1/runs/{run_id}/approval handler.
_APPROVAL_CHOICES = ["once", "session", "always", "deny"]


def _manifest_to_dict(m: Any) -> dict:
    """Map a tools.tool_manifest.ToolManifest to the dashboard ToolManifest shape
    (dashboard/src/lib/tools.ts). ``tool`` → ``id``; steps/inputs passed through.
    """
    return {
        "id": m.tool,
        "title": m.title,
        "skill": m.skill,
        "steps": [
            {
                "id": s.id,
                "title": s.title,
                "ref": s.ref,
                "hitl": s.hitl,
                "artifacts": list(s.artifacts or []),
                "ui": s.ui,
            }
            for s in (m.steps or [])
        ],
        **({"description": m.description} if m.description else {}),
        "inputs": list(m.inputs or []),
    }


# ---------------------------------------------------------------------------
# Run-start helper (B2) — reuses adapter machinery, no api_server.py edit
# ---------------------------------------------------------------------------

def _start_run(
    adapter: Any,
    run_id: str,
    user_message: str,
    session_id: str,
    *,
    goal_manager: Optional[Any] = None,
) -> None:
    """Register a new run on *adapter* and fire the background asyncio task.

    Replicates the minimal subset of ``_handle_create_run`` needed by the
    tool-launch and goal endpoints:

    - Allocates the per-run ``asyncio.Queue`` and registers it in the
      adapter's ``_run_streams`` / ``_run_streams_created`` / ``_run_approval_sessions``
      dicts (same keys ``_handle_run_events`` expects).
    - Sets initial run status via ``adapter._set_run_status``.
    - Emits a ``run.header`` event so the dashboard has a header chip
      immediately.
    - Creates an ``AIAgent`` via ``adapter._create_agent`` and schedules
      ``_run_and_close`` as an asyncio task.

    When *goal_manager* is provided the inner task runs a Ralph-style judge
    loop: after each ``agent.run_conversation`` call it calls
    ``gm.evaluate_after_turn(response)``; if ``should_continue`` it feeds the
    continuation prompt back in and emits a ``goal.verdict`` event each turn.

    **Callers must be inside an active asyncio event loop** (i.e., called from
    a coroutine or task — both ``_tool_launch`` and ``_goal`` are aiohttp
    handlers so this is always true).
    """
    loop = asyncio.get_running_loop()
    q: "asyncio.Queue[Optional[Dict[str, Any]]]" = asyncio.Queue()
    created_at = time.time()

    approval_session_key = session_id
    adapter._run_streams[run_id] = q
    adapter._run_streams_created[run_id] = created_at
    adapter._run_approval_sessions[run_id] = approval_session_key

    # Build text-delta callback so message.delta events flow to the queue.
    def _text_cb(delta: Optional[str]) -> None:
        if delta is None:
            return
        try:
            loop.call_soon_threadsafe(q.put_nowait, {
                "event": "message.delta",
                "run_id": run_id,
                "timestamp": time.time(),
                "delta": delta,
            })
        except Exception:
            pass

    adapter._set_run_status(
        run_id,
        "queued",
        created_at=created_at,
        session_id=session_id,
        model="",
    )

    # Emit run.header immediately (mirrors _handle_create_run).
    try:
        loop.call_soon_threadsafe(q.put_nowait, {
            "event": "run.header",
            "run_id": run_id,
            "timestamp": time.time(),
            "model": "",
            "tools": [],
            "mcp_servers": [],
        })
    except Exception:
        pass

    async def _run_and_close() -> None:
        try:
            adapter._set_run_status(run_id, "running")
            event_cb, on_event_cb = adapter._make_run_event_callback(run_id, loop)
            agent = adapter._create_agent(
                session_id=session_id,
                stream_delta_callback=_text_cb,
                tool_progress_callback=event_cb,
            )
            adapter._active_run_agents[run_id] = agent
            agent.run_event_callback = on_event_cb

            def _approval_notify(approval_data: Dict[str, Any]) -> None:
                event = dict(approval_data or {})
                event.update({
                    "event": "approval.request",
                    "run_id": run_id,
                    "timestamp": time.time(),
                    "choices": ["once", "session", "always", "deny"],
                })
                adapter._set_run_status(run_id, "waiting_for_approval",
                                        last_event="approval.request")
                try:
                    loop.call_soon_threadsafe(q.put_nowait, event)
                except Exception:
                    pass

            def _run_turn(prompt: str) -> Any:
                """Run one agent turn synchronously (called from executor)."""
                from gateway.session_context import clear_session_vars, set_session_vars
                from tools.approval import (
                    register_gateway_notify,
                    reset_current_session_key,
                    set_current_session_key,
                    unregister_gateway_notify,
                )
                approval_token = None
                session_tokens: List[Any] = []
                try:
                    approval_token = set_current_session_key(approval_session_key)
                    session_tokens = set_session_vars(
                        platform="api_server",
                        session_key=approval_session_key,
                    )
                    register_gateway_notify(approval_session_key, _approval_notify)
                    result = agent.run_conversation(
                        user_message=prompt,
                        conversation_history=[],
                        task_id=session_id,
                    )
                    return result
                finally:
                    try:
                        unregister_gateway_notify(approval_session_key)
                    finally:
                        if approval_token is not None:
                            try:
                                reset_current_session_key(approval_token)
                            except Exception:
                                pass
                        if session_tokens:
                            try:
                                clear_session_vars(session_tokens)
                            except Exception:
                                pass

            def _run_sync() -> Any:
                return _run_turn(user_message)

            if goal_manager is not None:
                # Goal mode: Ralph-style judge loop.
                result = await loop.run_in_executor(None, _run_sync)
                turns_used = 0

                while True:
                    turns_used += 1
                    final_response = (
                        result.get("final_response", "") if isinstance(result, dict) else ""
                    )
                    decision = goal_manager.evaluate_after_turn(
                        final_response, user_initiated=(turns_used == 1)
                    )

                    # Emit verdict event so client can track progress.
                    # Use q.put_nowait directly: _run_and_close is an asyncio
                    # coroutine already running in the event loop, so
                    # call_soon_threadsafe would defer to the next tick and
                    # arrive AFTER the run.completed put_nowait below.
                    try:
                        q.put_nowait({
                            "event": "goal.verdict",
                            "run_id": run_id,
                            "timestamp": time.time(),
                            "verdict": decision.get("verdict"),
                            "reason": decision.get("reason", ""),
                            "status": decision.get("status"),
                            "turns_used": turns_used,
                            "message": decision.get("message", ""),
                        })
                    except Exception:
                        pass

                    if not decision.get("should_continue"):
                        # Done, paused, or error — emit final run event.
                        verdict = decision.get("verdict")
                        if verdict == "done":
                            q.put_nowait({
                                "event": "run.completed",
                                "run_id": run_id,
                                "timestamp": time.time(),
                                "output": final_response,
                                "goal_status": "done",
                                "reason": decision.get("reason", ""),
                            })
                            adapter._set_run_status(
                                run_id, "completed",
                                output=final_response,
                                last_event="run.completed",
                            )
                        else:
                            q.put_nowait({
                                "event": "run.completed",
                                "run_id": run_id,
                                "timestamp": time.time(),
                                "output": final_response,
                                "goal_status": decision.get("status"),
                                "reason": decision.get("reason", ""),
                            })
                            adapter._set_run_status(
                                run_id, "completed",
                                last_event="run.completed",
                            )
                        break

                    continuation = decision.get("continuation_prompt", "")
                    if not continuation:
                        break

                    def _cont_turn(p: str = continuation) -> Any:
                        return _run_turn(p)

                    result = await loop.run_in_executor(None, _cont_turn)

            else:
                # Plain tool-launch run — single conversation turn.
                result, usage = await loop.run_in_executor(None, lambda: (
                    _run_sync(),
                    {
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "total_tokens": 0,
                    },
                ))
                # _run_sync returns (result, usage) shape from agent; flatten.
                if isinstance(result, tuple) and len(result) == 2:
                    result, usage = result

                if isinstance(result, dict) and result.get("failed"):
                    error_msg = result.get("error") or "agent run failed"
                    q.put_nowait({
                        "event": "run.failed",
                        "run_id": run_id,
                        "timestamp": time.time(),
                        "error": error_msg,
                    })
                    adapter._set_run_status(run_id, "failed", error=error_msg,
                                             last_event="run.failed")
                else:
                    final_response = (
                        result.get("final_response", "") if isinstance(result, dict) else ""
                    )
                    usage_out = usage if isinstance(usage, dict) else {}
                    q.put_nowait({
                        "event": "run.completed",
                        "run_id": run_id,
                        "timestamp": time.time(),
                        "output": final_response,
                        "usage": usage_out,
                    })
                    adapter._set_run_status(run_id, "completed",
                                             output=final_response, usage=usage_out,
                                             last_event="run.completed")

        except asyncio.CancelledError:
            adapter._set_run_status(run_id, "cancelled", last_event="run.cancelled")
            try:
                q.put_nowait({
                    "event": "run.cancelled",
                    "run_id": run_id,
                    "timestamp": time.time(),
                })
            except Exception:
                pass
            raise
        except Exception as exc:
            logger.exception("[api_dashboard] run %s failed", run_id)
            adapter._set_run_status(run_id, "failed", error=str(exc),
                                     last_event="run.failed")
            try:
                q.put_nowait({
                    "event": "run.failed",
                    "run_id": run_id,
                    "timestamp": time.time(),
                    "error": str(exc),
                })
            except Exception:
                pass
        finally:
            try:
                from tools.approval import unregister_gateway_notify
                unregister_gateway_notify(approval_session_key)
            except Exception:
                pass
            # Sentinel: signal SSE stream to close.
            try:
                q.put_nowait(None)
            except Exception:
                pass
            adapter._active_run_agents.pop(run_id, None)
            adapter._active_run_tasks.pop(run_id, None)
            adapter._run_approval_sessions.pop(run_id, None)

    task = asyncio.create_task(_run_and_close())
    adapter._active_run_tasks[run_id] = task
    try:
        adapter._background_tasks.add(task)
    except (TypeError, AttributeError):
        pass
    if hasattr(task, "add_done_callback"):
        try:
            task.add_done_callback(adapter._background_tasks.discard)
        except AttributeError:
            pass


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------

def register_dashboard_routes(app: "Any", adapter: "Any") -> None:
    """Register the dashboard data routes on the api_server's aiohttp app.

    Pre-wired in Phase 0; handlers below replace the Phase-0 stubs.
    Idempotent-safe (aiohttp raises on duplicate route; api_server wraps
    this call in try/except so a double-registration won't break startup).
    """
    from aiohttp import web  # local import to match api_server's lazy pattern

    # ------------------------------------------------------------------
    # GET /v1/tasks — Kanban board → Task[]
    # ------------------------------------------------------------------
    async def _tasks(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            kb, conn = _connect_kanban()
            try:
                rows = kb.list_tasks(conn, include_archived=False, limit=200)
                tasks = [_task_to_dict(t) for t in rows]
            finally:
                conn.close()
            return web.json_response({"tasks": tasks})
        except ImportError:
            logger.debug("/v1/tasks: hermes_cli not available")
            return web.json_response({"tasks": [], "error": "kanban_db unavailable"})
        except Exception as exc:
            logger.exception("/v1/tasks failed")
            return web.json_response({"tasks": [], "error": str(exc)})

    # ------------------------------------------------------------------
    # GET /v1/memory — vault note titles → MemoryGraph
    # ------------------------------------------------------------------
    async def _memory(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            labels = _vault_labels(cap=40)
            graph = _build_galaxy(labels)
            return web.json_response({"graph": graph})
        except Exception as exc:
            logger.exception("/v1/memory failed; returning fallback galaxy")
            fallback = _build_galaxy(_FALLBACK_LABELS)
            return web.json_response({"graph": fallback, "error": str(exc)})

    # ------------------------------------------------------------------
    # GET /v1/events — global SSE TaskEvent stream (5-second poll loop)
    # ------------------------------------------------------------------
    async def _events(request: "web.Request") -> "web.StreamResponse":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        resp = web.StreamResponse(
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )
        await resp.prepare(request)

        # Track last-seen status per task so we only emit on changes.
        seen_status: dict[str, str] = {}

        async def _poll_and_emit() -> None:
            try:
                kb, conn = _connect_kanban()
                try:
                    rows = kb.list_tasks(conn, include_archived=False, limit=200)
                finally:
                    conn.close()
            except Exception:
                logger.debug("/v1/events poll failed", exc_info=True)
                return

            now_ms = int(time.time() * 1000)
            for t in rows:
                prev = seen_status.get(t.id)
                if prev != t.status:
                    seen_status[t.id] = t.status
                    if prev is not None:
                        # Only emit on actual transitions (skip the first scan)
                        event: dict = {
                            "id": f"ev-{now_ms}-{t.id}",
                            "taskId": t.id,
                            "kind": "status_changed",
                            "message": f"{t.title} → {t.status}",
                            "ts": now_ms,
                        }
                        payload = ("data: " + json.dumps(event) + "\n\n").encode()
                        await resp.write(payload)

        try:
            while True:
                # Keepalive comment so proxies and browsers don't time out
                try:
                    await resp.write(b": keepalive\n\n")
                except (ConnectionResetError, asyncio.CancelledError):
                    break

                await _poll_and_emit()

                try:
                    await asyncio.sleep(5)
                except asyncio.CancelledError:
                    break
        except (ConnectionResetError, asyncio.CancelledError):
            pass  # client disconnected — clean exit
        finally:
            return resp  # noqa: B012 — aiohttp requires returning the prepared response

    # ------------------------------------------------------------------
    # GET /v1/tools — agent-tool manifests → ToolManifest[] (Launchpad)
    # ------------------------------------------------------------------
    async def _tools(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
            tools = [_manifest_to_dict(m) for m in manifests]
            return web.json_response({"tools": tools})
        except Exception as exc:
            logger.exception("/v1/tools failed")
            return web.json_response({"tools": [], "error": str(exc)})

    # ------------------------------------------------------------------
    # GET /v1/approvals — pending approvals across active runs (Trust Rail)
    # Aggregates the per-run approval queues (tools.approval) keyed by the
    # run→session map the api_server maintains. Resolve via the existing
    # POST /v1/runs/{run_id}/approval endpoint.
    # ------------------------------------------------------------------
    async def _approvals(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from tools.approval import pending_for_session
        except Exception:
            return web.json_response({"approvals": []})

        sessions = dict(getattr(adapter, "_run_approval_sessions", {}) or {})
        now_ms = int(time.time() * 1000)
        out: list[dict] = []
        for run_id, session_key in sessions.items():
            try:
                pend = pending_for_session(session_key)
            except Exception:
                logger.debug("pending_for_session failed for %s", run_id, exc_info=True)
                continue
            for i, data in enumerate(pend):
                text = (
                    data.get("description")
                    or data.get("command")
                    or "Approval requested"
                )
                out.append({
                    "id": f"{run_id}:{i}",
                    "runId": run_id,
                    "text": text,
                    "choices": list(data.get("choices") or _APPROVAL_CHOICES),
                    "ts": now_ms,
                })
        return web.json_response({"approvals": out})

    # ------------------------------------------------------------------
    # POST /v1/tools/{tool_id}/launch — start a run bound to a tool's skill
    # for the Workbench (Wave 3 / B2). Loads the manifest by id via
    # discover_manifests(), builds a skill-invocation prompt from the
    # tool's launch.skill + caller-supplied inputs, starts a run on the
    # adapter (reusing _start_run), and returns {run_id}.  The client
    # streams progress via GET /v1/runs/{run_id}/events.
    # ------------------------------------------------------------------
    async def _tool_launch(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]

        # Validate tool_id — no path traversal characters.
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        # Load manifests and look up by tool field (= id in the TS type).
        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
        except Exception as exc:
            logger.exception("/v1/tools/%s/launch: discover_manifests failed", tool_id)
            return web.json_response(
                {"error": "manifest_error", "detail": str(exc)},
                status=500,
            )

        manifest_map = {m.tool: m for m in manifests}
        manifest = manifest_map.get(tool_id)
        if manifest is None:
            return web.json_response(
                {"error": "tool_not_found", "detail": f"No tool manifest for id={tool_id!r}"},
                status=404,
            )

        # Parse optional inputs body — accept missing / non-JSON body gracefully.
        inputs: Dict[str, Any] = {}
        try:
            body = await request.json()
            if isinstance(body, dict):
                raw_inputs = body.get("inputs")
                if isinstance(raw_inputs, dict):
                    inputs = raw_inputs
        except Exception:
            pass  # empty or non-JSON body → inputs stays {}

        # Build user_message: invoke the skill, passing inputs as context.
        skill = manifest.skill
        if inputs:
            try:
                inputs_text = json.dumps(inputs, ensure_ascii=False)
            except Exception:
                inputs_text = str(inputs)
            user_message = f"/{skill}\n\nInputs: {inputs_text}"
        else:
            user_message = f"/{skill}"

        run_id = f"run_{uuid.uuid4().hex}"
        # Per-tool session: tools share continuity within a session key based on
        # the tool slug so successive launches of the same tool resume context.
        session_id = f"tool-{tool_id}-{uuid.uuid4().hex[:8]}"

        _start_run(adapter, run_id, user_message, session_id)

        logger.debug(
            "tool launch: tool_id=%s run_id=%s session_id=%s skill=%s",
            tool_id, run_id, session_id, skill,
        )
        return web.json_response({"run_id": run_id}, status=202)

    # ------------------------------------------------------------------
    # POST /v1/goal — start a goal-mode run (objective + judge loop) for
    # the Goal Mode surface (Wave 3 / B2).  Validates the body, sets up a
    # GoalManager for the session, starts a run that drives the Ralph-style
    # judge loop, and returns {run_id, session_id}.  Judge verdicts arrive
    # as goal.verdict events on GET /v1/runs/{run_id}/events.
    # ------------------------------------------------------------------
    async def _goal(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"error": "invalid_json", "detail": "request body must be JSON"},
                status=400,
            )

        if not isinstance(body, dict):
            return web.json_response(
                {"error": "invalid_body", "detail": "request body must be a JSON object"},
                status=400,
            )

        objective = body.get("objective") or body.get("goal") or ""
        if not isinstance(objective, str) or not objective.strip():
            return web.json_response(
                {"error": "missing_objective",
                 "detail": "'objective' must be a non-empty string"},
                status=400,
            )
        objective = objective.strip()

        raw_max_turns = body.get("max_turns")
        max_turns: Optional[int] = None
        if raw_max_turns is not None:
            try:
                max_turns = int(raw_max_turns)
                if max_turns < 1:
                    return web.json_response(
                        {"error": "invalid_max_turns",
                         "detail": "'max_turns' must be a positive integer"},
                        status=400,
                    )
            except (TypeError, ValueError):
                return web.json_response(
                    {"error": "invalid_max_turns",
                     "detail": "'max_turns' must be an integer"},
                    status=400,
                )

        # Allow caller to resume into an existing session.
        session_id = (body.get("session_id") or "").strip() or f"goal-{uuid.uuid4().hex[:8]}"

        # Initialise GoalManager and persist the goal state.
        try:
            from hermes_cli.goals import GoalManager
            gm = GoalManager(session_id)
            gm.set(objective, max_turns=max_turns)
        except Exception as exc:
            logger.exception("/v1/goal: GoalManager init failed")
            return web.json_response(
                {"error": "goal_init_error", "detail": str(exc)},
                status=500,
            )

        run_id = f"run_{uuid.uuid4().hex}"
        _start_run(adapter, run_id, objective, session_id, goal_manager=gm)

        logger.debug(
            "goal run: run_id=%s session_id=%s max_turns=%s objective=%.80s",
            run_id, session_id, max_turns, objective,
        )
        return web.json_response(
            {"run_id": run_id, "session_id": session_id},
            status=202,
        )

    app.router.add_get("/v1/tasks", _tasks)
    app.router.add_get("/v1/memory", _memory)
    app.router.add_get("/v1/events", _events)
    app.router.add_get("/v1/tools", _tools)
    app.router.add_get("/v1/approvals", _approvals)
    app.router.add_post("/v1/tools/{tool_id}/launch", _tool_launch)
    app.router.add_post("/v1/goal", _goal)
    logger.debug(
        "dashboard data routes registered (/v1/tasks, /v1/memory, /v1/events, "
        "/v1/tools, /v1/approvals, /v1/tools/{id}/launch, /v1/goal)"
    )
