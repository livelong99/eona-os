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

# Labs "UI Agent Builder": the builder/refine agents run on Opus 4.8 (authoring
# accuracy), not the default runtime model. Forwarded to the claude_code CLI as
# --model via the per-request _model_override hook.
_TOOL_BUILDER_MODEL = "claude-opus-4-8"

# Persona for the deterministic-scaffold ENRICH agent (build endpoint). It is
# fed the draft + the on-disk scaffold paths and told to enrich, not re-ask.
_TOOL_BUILDER_ENRICH_PERSONA = (
    "You are the Hermes Tool Builder, an expert agent-skill author. A tool has "
    "ALREADY been scaffolded on disk from the user's form draft: a valid "
    "tool.yaml, a SKILL.md, and references/ step stubs. Your job is to ENRICH "
    "the scaffold, not to re-interrogate the user or re-ask questions. "
    "Improve SKILL.md (sharpen the identity, capabilities, and workflow) and "
    "flesh out each references/<step>.md with concrete, actionable guidance "
    "derived from the draft's goals and steps. Do NOT modify the tool.yaml "
    "`tool`, `launch.skill`, or the steps[] ids/refs — they are load-bearing. "
    "Keep edits confined to the scaffolded skill directory. Be concise and "
    "concrete; write the kind of skill a fresh agent could execute cold."
)

# Persona for the refine endpoint — critiques/improves the draft conversationally.
_TOOL_BUILDER_REFINE_PERSONA = (
    "You are the Hermes Tool Builder, an expert agent-skill author and critic. "
    "The user is refining a tool draft (BuilderState: name, tagline, category, "
    "skill, goals, steps, inputs, outputs, uiNotes) before publishing it. "
    "Critique and improve the draft: prune redundancy, tighten goals into crisp "
    "outcomes, sequence the workflow steps, and make inputs/outputs precise. "
    "Respond conversationally with specific, actionable suggestions the user can "
    "apply. Be direct and concise."
)


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
    model_override: Optional[str] = None,
    append_system_prompt: Optional[str] = None,
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
                ephemeral_system_prompt=append_system_prompt,
            )
            adapter._active_run_agents[run_id] = agent
            agent.run_event_callback = on_event_cb
            # Per-request claude_code hooks (Labs builder/refine): a persona via
            # --append-system-prompt and Opus 4.8 via --model. Both default to
            # None elsewhere → unchanged behaviour for normal tool launches.
            if append_system_prompt:
                agent._append_system_prompt = append_system_prompt
            if model_override:
                agent._model_override = model_override

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
    # GET /v1/memory/graph — full vault graph (nodes + [[wikilink]] edges)
    # Cached in-process (mtime/TTL) so the ~3,500-file scan isn't per-request.
    # ------------------------------------------------------------------
    async def _memory_graph(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from gateway.platforms import vault_graph
            loop = asyncio.get_running_loop()
            graph = await loop.run_in_executor(None, vault_graph.build_graph)
            return web.json_response(graph)
        except Exception as exc:
            logger.exception("/v1/memory/graph failed")
            return web.json_response(
                {"nodes": [], "links": [], "projects": [], "error": str(exc)},
                status=500,
            )

    # ------------------------------------------------------------------
    # GET /v1/memory/note?path=<id> — note detail (content + links/backlinks).
    # Path is validated to stay within the vault root (traversal → 400).
    # ------------------------------------------------------------------
    async def _memory_note(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        rel_path = request.query.get("path", "")
        if not rel_path:
            return web.json_response(
                {"error": "missing_path", "detail": "'path' query param required"},
                status=400,
            )
        try:
            from gateway.platforms import vault_graph
            loop = asyncio.get_running_loop()
            note = await loop.run_in_executor(None, vault_graph.read_note, rel_path)
        except Exception as exc:
            logger.exception("/v1/memory/note failed for %r", rel_path)
            return web.json_response({"error": "read_error", "detail": str(exc)}, status=500)
        if note is None:
            return web.json_response(
                {"error": "invalid_path",
                 "detail": "path not found or outside the vault"},
                status=400,
            )
        return web.json_response(note)

    # ------------------------------------------------------------------
    # GET /v1/memory/search?q=&k= — Brain semantic search with a filesystem
    # full-text fallback. ``source`` reports which lane produced the results.
    # ------------------------------------------------------------------
    async def _memory_search(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        query = (request.query.get("q") or "").strip()
        try:
            k = int(request.query.get("k", "10"))
        except (TypeError, ValueError):
            k = 10
        k = max(1, min(k, 50))
        if not query:
            return web.json_response({"results": [], "source": "filesystem"})

        loop = asyncio.get_running_loop()

        # Lane 1: Brain semantic retrieval. Defensive — a missing/unindexed
        # Brain (Qdrant unreachable, HERMES_BRAIN_INJECT off) must never 500.
        brain_results: list[dict] = []
        try:
            from gateway.platforms import vault_graph

            def _brain_query() -> list[dict]:
                from agent.brain import Brain
                brain = Brain(vault_dir=vault_graph.VAULT_ROOT)
                result = brain.retrieve(query, k=k)

                graph = vault_graph.build_graph()
                meta = {n["id"]: n for n in graph["nodes"]}
                stem_index: dict[str, str] = {}
                for n in graph["nodes"]:
                    stem_index.setdefault(Path(n["id"]).stem.lower(), n["id"])

                def _resolve(src: str) -> Optional[str]:
                    """Map a Brain fact source (abs path / rel path / stem) → node id."""
                    if not src:
                        return None
                    try:
                        cand = Path(src)
                        if cand.is_absolute():
                            nid = cand.resolve().relative_to(vault_graph.VAULT_ROOT).as_posix()
                            return nid if nid in meta else None
                    except Exception:
                        pass
                    rel = src.lstrip("/")
                    if rel in meta:
                        return rel
                    return stem_index.get(Path(src).stem.lower())

                out: list[dict] = []
                seen_ids: set[str] = set()
                for fact in result.similar:
                    nid = _resolve(fact.source or "")
                    if nid is None or nid not in meta or nid in seen_ids:
                        continue
                    seen_ids.add(nid)
                    m = meta[nid]
                    out.append({
                        "id": nid,
                        "title": m["title"],
                        "folder": m["folder"],
                        "project": m["project"],
                        "score": float(fact.score),
                        "snippet": (fact.content or m.get("snippet") or "")[:220],
                    })
                    if len(out) >= k:
                        break
                return out

            brain_results = await loop.run_in_executor(None, _brain_query)
        except Exception:
            logger.debug("/v1/memory/search: Brain lane failed (non-fatal)", exc_info=True)
            brain_results = []

        if brain_results:
            return web.json_response({"results": brain_results, "source": "brain"})

        # Lane 2: filesystem full-text fallback.
        try:
            from gateway.platforms import vault_graph
            results = await loop.run_in_executor(None, vault_graph.fts_search, query, k)
            return web.json_response({"results": results, "source": "filesystem"})
        except Exception as exc:
            logger.exception("/v1/memory/search filesystem fallback failed")
            return web.json_response(
                {"results": [], "source": "filesystem", "error": str(exc)},
                status=500,
            )

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

    # ------------------------------------------------------------------
    # POST /v1/tools/build — Labs "UI Agent Builder" publish.
    # Body: {draft: BuilderState}. (1) deterministically scaffold a valid
    # tool.yaml + SKILL.md + references/ (guarantees a runnable tool even if
    # the agent step fails); (2) spawn an Opus-4.8 ENRICH agent (builder
    # persona) to enrich the scaffold, streamed as a run. Returns 202
    # {tool_id, run_id}.
    # ------------------------------------------------------------------
    async def _tool_build(request: "web.Request") -> "web.Response":
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

        draft = body.get("draft")
        if not isinstance(draft, dict):
            return web.json_response(
                {"error": "missing_draft", "detail": "'draft' (BuilderState) is required"},
                status=400,
            )

        # (1) Deterministic scaffold — fail at boundary on invalid draft / schema.
        try:
            from gateway.platforms.tool_builder import scaffold_tool
            loop = asyncio.get_running_loop()
            slug, skill_dir = await loop.run_in_executor(None, scaffold_tool, draft)
        except ValueError as exc:
            return web.json_response(
                {"error": "invalid_draft", "detail": str(exc)}, status=400
            )
        except Exception as exc:
            logger.exception("/v1/tools/build: scaffold failed")
            return web.json_response(
                {"error": "scaffold_error", "detail": str(exc)}, status=500
            )

        # (2) Spawn the Opus-4.8 ENRICH agent. Feed it the draft + scaffold paths;
        # the persona tells it to enrich, not re-ask. Non-determinism here never
        # blocks the build — the scaffold above already produced a runnable tool.
        try:
            draft_json = json.dumps(draft, ensure_ascii=False)
        except Exception:
            draft_json = str(draft)
        enrich_message = (
            f"A new tool '{slug}' has been scaffolded at: {skill_dir}\n\n"
            f"Form draft (BuilderState):\n{draft_json}\n\n"
            "Enrich the scaffold now: improve SKILL.md and flesh out each "
            "references/<step>.md from the draft's goals and steps. Use your "
            "file tools to read the current scaffold and edit it in place. "
            "Do not change tool.yaml's tool/launch.skill/steps ids."
        )

        run_id = f"run_{uuid.uuid4().hex}"
        session_id = f"toolbuild-{slug}-{uuid.uuid4().hex[:8]}"
        _start_run(
            adapter, run_id, enrich_message, session_id,
            model_override=_TOOL_BUILDER_MODEL,
            append_system_prompt=_TOOL_BUILDER_ENRICH_PERSONA,
        )

        logger.debug(
            "tool build: tool_id=%s run_id=%s dir=%s", slug, run_id, skill_dir
        )
        return web.json_response({"tool_id": slug, "run_id": run_id}, status=202)

    # ------------------------------------------------------------------
    # POST /v1/tools/refine — stream an Opus-4.8 tool-builder agent
    # critiquing/improving a draft. Body: {draft, messages:[{role,content}]}.
    # Returns an OpenAI-style SSE stream (data: {choices:[{delta:{content}}]})
    # ending with data:[DONE]. Reuses the chat SSE path + the _model_override
    # and _append_system_prompt hooks.
    # ------------------------------------------------------------------
    async def _tool_refine(request: "web.Request") -> "web.StreamResponse":
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

        draft = body.get("draft")
        if not isinstance(draft, dict):
            return web.json_response(
                {"error": "missing_draft", "detail": "'draft' (BuilderState) is required"},
                status=400,
            )
        raw_messages = body.get("messages")
        chat_messages: List[Dict[str, str]] = []
        if isinstance(raw_messages, list):
            for m in raw_messages:
                if not isinstance(m, dict):
                    continue
                role = m.get("role")
                content = m.get("content")
                if role in {"user", "assistant"} and isinstance(content, str):
                    chat_messages.append({"role": role, "content": content})

        # Build the agent's user prompt: the draft as context + the latest user
        # turn. History (prior assistant/user turns) is folded into the prompt so
        # the single-turn claude_code path sees the full refinement thread.
        try:
            draft_json = json.dumps(draft, ensure_ascii=False)
        except Exception:
            draft_json = str(draft)

        history_text = ""
        last_user = ""
        if chat_messages:
            # Last user message is the active request; everything before is context.
            for m in reversed(chat_messages):
                if m["role"] == "user":
                    last_user = m["content"]
                    break
            prior = chat_messages[:-1] if chat_messages[-1]["role"] == "user" else chat_messages
            if prior:
                history_text = "\n".join(
                    f"{m['role'].upper()}: {m['content']}" for m in prior
                )
        if not last_user:
            last_user = "Critique this draft and suggest concrete improvements."

        prompt_parts = [f"Tool draft (BuilderState):\n{draft_json}"]
        if history_text:
            prompt_parts.append(f"Conversation so far:\n{history_text}")
        prompt_parts.append(f"User: {last_user}")
        user_message = "\n\n".join(prompt_parts)

        # Stream via the same SSE shape as chat-completions. We run the agent in a
        # background thread (run_conversation is sync) and drain its delta queue.
        import queue as _q

        completion_id = f"refine-{uuid.uuid4().hex[:24]}"
        created = int(time.time())
        session_id = f"toolrefine-{uuid.uuid4().hex[:8]}"
        stream_q: "_q.Queue" = _q.Queue()
        loop = asyncio.get_running_loop()

        def _on_delta(delta: Optional[str]) -> None:
            if delta is not None:
                stream_q.put(delta)

        def _run_refine() -> None:
            try:
                agent = adapter._create_agent(
                    session_id=session_id,
                    stream_delta_callback=_on_delta,
                    ephemeral_system_prompt=_TOOL_BUILDER_REFINE_PERSONA,
                )
                agent._append_system_prompt = _TOOL_BUILDER_REFINE_PERSONA
                agent._model_override = _TOOL_BUILDER_MODEL
                agent.run_conversation(
                    user_message=user_message,
                    conversation_history=[],
                    task_id=session_id,
                )
            except Exception as exc:
                logger.exception("/v1/tools/refine agent run failed")
                stream_q.put(f"\n[refine error: {exc}]")
            finally:
                stream_q.put(None)

        agent_task = loop.run_in_executor(None, _run_refine)

        sse_headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
        response = web.StreamResponse(status=200, headers=sse_headers)
        await response.prepare(request)

        def _chunk(content: str) -> bytes:
            payload = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
            }
            return f"data: {json.dumps(payload)}\n\n".encode()

        try:
            while True:
                try:
                    item = await loop.run_in_executor(
                        None, lambda: stream_q.get(timeout=0.5)
                    )
                except _q.Empty:
                    if agent_task.done():
                        # Drain remaining items then stop.
                        while True:
                            try:
                                item = stream_q.get_nowait()
                            except _q.Empty:
                                item = None
                            if item is None:
                                break
                            await response.write(_chunk(item))
                        break
                    await response.write(b": keepalive\n\n")
                    continue
                if item is None:
                    break
                await response.write(_chunk(item))

            done = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }
            await response.write(f"data: {json.dumps(done)}\n\n".encode())
            await response.write(b"data: [DONE]\n\n")
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
            logger.info("/v1/tools/refine SSE client disconnected (%s)", completion_id)
        finally:
            try:
                await agent_task
            except Exception:
                pass
        return response

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id} — single full manifest for the detail view.
    # Filters discover_manifests() by id. 404 if missing.
    # ------------------------------------------------------------------
    async def _tool_get(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )
        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
        except Exception as exc:
            logger.exception("/v1/tools/%s: discover_manifests failed", tool_id)
            return web.json_response(
                {"error": "manifest_error", "detail": str(exc)}, status=500
            )

        manifest = next((m for m in manifests if m.tool == tool_id), None)
        if manifest is None:
            return web.json_response(
                {"error": "tool_not_found", "detail": f"No tool for id={tool_id!r}"},
                status=404,
            )
        return web.json_response(_manifest_to_dict(manifest))

    # ------------------------------------------------------------------
    # DELETE /v1/tools/{tool_id} — remove a user-built tool. Only a dir under
    # the writable tool root (/opt/data/skills) may be deleted; built-ins
    # under the read-only /opt/skills are refused with 403.
    # ------------------------------------------------------------------
    async def _tool_delete(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
        except Exception as exc:
            logger.exception("/v1/tools/%s DELETE: discover_manifests failed", tool_id)
            return web.json_response(
                {"error": "manifest_error", "detail": str(exc)}, status=500
            )

        manifest = next((m for m in manifests if m.tool == tool_id), None)
        if manifest is None or not manifest.source_path:
            return web.json_response(
                {"error": "tool_not_found", "detail": f"No tool for id={tool_id!r}"},
                status=404,
            )

        # The tool's skill dir is the parent of its tool.yaml.
        skill_dir = Path(manifest.source_path).parent

        # Confine deletion to the writable tool root; refuse read-only built-ins.
        from gateway.platforms.tool_builder import is_within_writable_root
        resolved = is_within_writable_root(skill_dir)
        if resolved is None:
            return web.json_response(
                {"error": "forbidden",
                 "detail": "Only user-built tools (under the writable tool root) "
                           "can be deleted; built-in tools are read-only."},
                status=403,
            )

        try:
            import shutil
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, lambda: shutil.rmtree(resolved))
        except Exception as exc:
            logger.exception("/v1/tools/%s DELETE: rmtree failed", tool_id)
            return web.json_response(
                {"error": "delete_error", "detail": str(exc)}, status=500
            )

        logger.info("deleted user-built tool %s at %s", tool_id, resolved)
        return web.json_response({"deleted": True})

    app.router.add_get("/v1/tasks", _tasks)
    app.router.add_get("/v1/memory", _memory)
    app.router.add_get("/v1/memory/graph", _memory_graph)
    app.router.add_get("/v1/memory/note", _memory_note)
    app.router.add_get("/v1/memory/search", _memory_search)
    app.router.add_get("/v1/events", _events)
    app.router.add_get("/v1/tools", _tools)
    app.router.add_get("/v1/approvals", _approvals)
    # Labs "UI Agent Builder" — static build/refine paths registered BEFORE the
    # parameterized {tool_id} routes so "build"/"refine" never match as an id.
    app.router.add_post("/v1/tools/build", _tool_build)
    app.router.add_post("/v1/tools/refine", _tool_refine)
    app.router.add_post("/v1/tools/{tool_id}/launch", _tool_launch)
    app.router.add_get("/v1/tools/{tool_id}", _tool_get)
    app.router.add_delete("/v1/tools/{tool_id}", _tool_delete)
    app.router.add_post("/v1/goal", _goal)
    logger.debug(
        "dashboard data routes registered (/v1/tasks, /v1/memory, /v1/events, "
        "/v1/tools, /v1/approvals, /v1/tools/build, /v1/tools/refine, "
        "/v1/tools/{id}, /v1/tools/{id}/launch, /v1/goal)"
    )
