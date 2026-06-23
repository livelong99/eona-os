"""Memory galaxy routes — vault graph, note detail, and semantic search.

Extracted verbatim from ``api_dashboard.py``. Shared helpers
(``_vault_labels``, ``_build_galaxy``, ``_FALLBACK_LABELS``) are referenced
through the ``api_dashboard`` module object so behaviour is unchanged.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from gateway.platforms import api_dashboard as _ad

if TYPE_CHECKING:  # pragma: no cover
    from aiohttp import web

logger = logging.getLogger(__name__)


def register(app: "Any", adapter: "Any") -> None:  # type: ignore[name-defined]
    """Register the memory-galaxy data routes on the api_server's aiohttp app."""
    from aiohttp import web  # local import to match api_server's lazy pattern

    # ------------------------------------------------------------------
    # GET /v1/memory — vault note titles → MemoryGraph
    # ------------------------------------------------------------------
    async def _memory(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            labels = _ad._vault_labels(cap=40)
            graph = _ad._build_galaxy(labels)
            return web.json_response({"graph": graph})
        except Exception as exc:
            logger.exception("/v1/memory failed; returning fallback galaxy")
            fallback = _ad._build_galaxy(_ad._FALLBACK_LABELS)
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

    app.router.add_get("/v1/memory", _memory)
    app.router.add_get("/v1/memory/graph", _memory_graph)
    app.router.add_get("/v1/memory/note", _memory_note)
    app.router.add_get("/v1/memory/search", _memory_search)
