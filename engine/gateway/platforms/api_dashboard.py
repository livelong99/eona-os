"""Dashboard data API — CONTRACT (Phase 0). Stub handlers only.

Worker W-B implements the bodies: ``GET /v1/tasks`` (the Kanban board → Task[]),
``GET /v1/memory`` (the vault graph → MemoryGraph), and ``GET /v1/events`` (a
global SSE event stream → TaskEvent), replacing the dashboard's MOCK_* in
``dashboard/src/lib/hermes.ts``. Shapes MUST match the TS types in
``dashboard/src/lib/types.ts`` (Task, TaskStatus, MemoryGraph, TaskEvent).

This lives in its own module so W-B never edits the api_server route block:
``ApiServerPlatform`` calls ``register_dashboard_routes(self._app, self)`` once
(pre-wired in Phase 0). Handlers receive the adapter for ``_check_auth`` etc.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from aiohttp import web

logger = logging.getLogger(__name__)


def register_dashboard_routes(app: "Any", adapter: "Any") -> None:
    """Register the dashboard data routes on the api_server's aiohttp app.

    Pre-wired in Phase 0; W-B fills the handlers below. Idempotent-safe.
    """
    from aiohttp import web  # local import to match api_server's lazy pattern

    async def _tasks(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        # W-B: read the Kanban board (~/.hermes/kanban.db via kanban_tools) and
        # return {"tasks": Task[]} matching dashboard types.ts.
        return web.json_response({"tasks": [], "todo": "W-B: implement /v1/tasks"}, status=501)

    async def _memory(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        # W-B: build a MemoryGraph {nodes, edges} from Qdrant / Obsidian MCP.
        return web.json_response({"graph": {"nodes": [], "edges": []}, "todo": "W-B: implement /v1/memory"}, status=501)

    async def _events(request: "web.Request") -> "web.StreamResponse":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        # W-B: a global SSE event bus emitting TaskEvent (data: <json>\n\n),
        # replacing the dashboard subscribeEvents() mock ticker.
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
        await resp.prepare(request)
        await resp.write(b': W-B: implement /v1/events global stream\n\n')
        return resp

    app.router.add_get("/v1/tasks", _tasks)
    app.router.add_get("/v1/memory", _memory)
    app.router.add_get("/v1/events", _events)
    logger.debug("dashboard data routes registered (/v1/tasks, /v1/memory, /v1/events)")
