"""Tests for ``GET /v1/memory/search`` Cognee source reporting (task 2.3).

The handler must report ``source: "cognee"`` when the Cognee lane produced the
hits, surface Cognee entities that don't map to a vault node (rather than
dropping them), and keep the existing ``brain``/``filesystem`` hints intact.
"""
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from agent.brain import BrainFact, BrainResult
from gateway.config import PlatformConfig
from gateway.platforms.api_server import (
    APIServerAdapter,
    cors_middleware,
    security_headers_middleware,
)
from gateway.platforms.dashboard import memory_routes

# Minimal vault graph: one resolvable note.
_GRAPH = {
    "nodes": [{
        "id": "20_Areas/ada.md", "title": "Ada Note", "folder": "Areas",
        "project": None, "snippet": "about ada",
    }],
    "links": [], "softLinks": [], "projects": [],
}


def _make_app() -> web.Application:
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={}))
    adapter._background_tasks = set()
    mws = [mw for mw in (cors_middleware, security_headers_middleware) if mw is not None]
    app = web.Application(middlewares=mws)
    app["api_server_adapter"] = adapter
    memory_routes.register(app, adapter)
    return app


@contextmanager
def _stub_brain(facts):
    with patch("gateway.platforms.vault_graph.build_graph", return_value=_GRAPH), \
         patch("agent.brain.Brain.retrieve", return_value=BrainResult(similar=facts)):
        yield


async def _search(facts, query="ada"):
    app = _make_app()
    async with TestClient(TestServer(app)) as client:
        with _stub_brain(facts):
            resp = await client.get(f"/v1/memory/search?q={query}")
        assert resp.status == 200
        return await resp.json()


@pytest.mark.asyncio
async def test_vault_only_hits_report_brain():
    """A non-Cognee fact that resolves to a vault node → source: brain (unchanged)."""
    facts = [BrainFact(content="ada body", score=0.9, provenance="vault",
                       source="20_Areas/ada.md")]
    body = await _search(facts)
    assert body["source"] == "brain"
    assert body["results"][0]["id"] == "20_Areas/ada.md"


@pytest.mark.asyncio
async def test_cognee_entity_without_vault_node_is_surfaced_as_cognee():
    """A Cognee fact whose source is an entity (no vault node) is surfaced, not
    dropped, and flips the source chip to cognee."""
    facts = [BrainFact(content="Ada designed it", score=0.8, provenance="vault",
                       source="Ada Lovelace",
                       metadata={"cognee_entity": "Ada Lovelace", "relations": []})]
    body = await _search(facts)
    assert body["source"] == "cognee"
    assert len(body["results"]) == 1
    r = body["results"][0]
    assert r["id"] == "cognee:Ada Lovelace"
    assert r["title"] == "Ada Lovelace"
    assert r["snippet"] == "Ada designed it"


@pytest.mark.asyncio
async def test_cognee_fact_resolving_to_vault_node_still_flags_cognee():
    """A Cognee-lane hit that DOES map to a vault node renders as that node but
    the lane is still reported honestly as cognee."""
    facts = [BrainFact(content="ada body", score=0.7, provenance="vault",
                       source="20_Areas/ada.md",
                       metadata={"cognee_entity": "Ada"})]
    body = await _search(facts)
    assert body["source"] == "cognee"
    assert body["results"][0]["id"] == "20_Areas/ada.md"


@pytest.mark.asyncio
async def test_empty_query_unchanged_filesystem():
    """The no-query short-circuit is untouched by the 2.3 change."""
    body = await _search([], query="")
    assert body["source"] == "filesystem"
    assert body["results"] == []
