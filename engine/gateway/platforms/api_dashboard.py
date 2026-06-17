"""Dashboard data API — implements the three Kanban/memory/events endpoints.

Worker W-B fills: ``GET /v1/tasks`` (Kanban board → Task[]),
``GET /v1/memory`` (vault galaxy → MemoryGraph), ``GET /v1/events`` (global
SSE TaskEvent stream).  Shapes match ``dashboard/src/lib/types.ts``.

This module is intentionally isolated so W-B never edits the api_server route
block: ``ApiServerPlatform`` calls ``register_dashboard_routes(app, adapter)``
once at startup (pre-wired in Phase 0).
"""
from __future__ import annotations

import asyncio
import glob
import json
import logging
import math
import os
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

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

    app.router.add_get("/v1/tasks", _tasks)
    app.router.add_get("/v1/memory", _memory)
    app.router.add_get("/v1/events", _events)
    logger.debug("dashboard data routes registered (/v1/tasks, /v1/memory, /v1/events)")
