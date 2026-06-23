"""Board routes — Kanban tasks, the global SSE event stream, and approvals.

Extracted verbatim from ``api_dashboard.py``. The kanban connector,
task-shape mapper, and approval-choice set are referenced through the
``api_dashboard`` module object so behaviour is unchanged.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import TYPE_CHECKING

from gateway.platforms import api_dashboard as _ad

if TYPE_CHECKING:  # pragma: no cover
    from aiohttp import web

logger = logging.getLogger(__name__)


def register(app: "Any", adapter: "Any") -> None:  # type: ignore[name-defined]
    """Register the Kanban/events/approvals routes on the aiohttp app."""
    from aiohttp import web  # local import to match api_server's lazy pattern

    # ------------------------------------------------------------------
    # GET /v1/tasks — Kanban board → Task[]
    # ------------------------------------------------------------------
    async def _tasks(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            kb, conn = _ad._connect_kanban()
            try:
                rows = kb.list_tasks(conn, include_archived=False, limit=200)
                tasks = [_ad._task_to_dict(t) for t in rows]
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
                kb, conn = _ad._connect_kanban()
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
                    "choices": list(data.get("choices") or _ad._APPROVAL_CHOICES),
                    "ts": now_ms,
                })
        return web.json_response({"approvals": out})

    app.router.add_get("/v1/tasks", _tasks)
    app.router.add_get("/v1/events", _events)
    app.router.add_get("/v1/approvals", _approvals)
