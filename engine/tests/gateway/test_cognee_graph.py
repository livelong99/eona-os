"""Tests for the Cognee graph reader + ``GET /v1/memory/cognee/graph`` route.

Covers the two contract guarantees Part 2 of ``cognee-dual-brain`` must hold:

1. **Fail-open** — Cognee unreachable / not configured → an *empty* graph with
   every frozen-contract key (``nodes/links/softLinks/projects``) and a 200
   response (never 500, never block the Memory screen).
2. **Shape parity** — a stubbed Cognee payload maps into the *same* JSON shape
   the vault ``/v1/memory/graph`` returns, so ``MemorySphere`` is reused
   unchanged.
"""
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from gateway.config import PlatformConfig
from gateway.platforms import cognee_graph
from gateway.platforms.api_server import (
    APIServerAdapter,
    cors_middleware,
    security_headers_middleware,
)
from gateway.platforms.dashboard import memory_routes
from gateway.platforms.vault_graph import _build_graph_uncached

# The frozen contract keys MemorySphere consumes.
_GRAPH_KEYS = {"nodes", "links", "softLinks", "projects"}
# The node keys the vault graph emits (parity target).
_NODE_KEYS = {
    "id", "title", "folder", "project", "tags",
    "degree", "updated", "snippet", "pinned",
}


@pytest.fixture(autouse=True)
def _reset_cache():
    """Each test starts with a cold reader cache (it only caches successes)."""
    cognee_graph._CACHE["graph"] = None
    cognee_graph._CACHE["built_at"] = 0.0
    yield


@contextmanager
def _stub_urlopen(payload=None, *, raise_exc=None, status=200):
    """Patch ``urllib.request.urlopen`` used inside ``_fetch_cognee_graph``."""
    import json as _json

    if raise_exc is not None:
        with patch("urllib.request.urlopen", side_effect=raise_exc):
            yield
        return

    resp = MagicMock()
    resp.status = status
    resp.read.return_value = _json.dumps(payload).encode()
    resp.__enter__.return_value = resp
    resp.__exit__.return_value = False
    with patch("urllib.request.urlopen", return_value=resp):
        yield


# ---------------------------------------------------------------------------
# Reader: fail-open
# ---------------------------------------------------------------------------

def test_unreachable_cognee_yields_empty_graph_with_error():
    with _stub_urlopen(raise_exc=OSError("connection refused")):
        graph = cognee_graph.build_graph(force=True)
    assert _GRAPH_KEYS <= set(graph)
    assert graph["nodes"] == []
    assert graph["links"] == []
    assert graph["softLinks"] == []
    assert graph["projects"] == []
    assert graph["error"]  # error string is surfaced


def test_non_200_status_is_fail_open():
    with _stub_urlopen(payload={}, status=503):
        graph = cognee_graph.build_graph(force=True)
    assert graph["nodes"] == [] and "error" in graph


def test_malformed_payload_degrades_to_empty():
    with _stub_urlopen(payload="not-a-graph"):
        graph = cognee_graph.build_graph(force=True)
    assert graph["nodes"] == [] and graph["links"] == []


# ---------------------------------------------------------------------------
# Reader: mapping / shape parity with the vault graph
# ---------------------------------------------------------------------------

_SAMPLE = {
    "nodes": [
        {"id": "e1", "name": "Ada Lovelace", "type": "Person",
         "description": "First programmer.", "sources": ["20_Areas/people.md"]},
        {"id": "e2", "name": "Analytical Engine", "type": "Concept",
         "description": "Mechanical general-purpose computer."},
    ],
    "edges": [
        {"source_node_id": "e1", "target_node_id": "e2",
         "relationship_name": "designed"},
    ],
}


def test_sample_payload_maps_to_vault_graph_shape():
    with _stub_urlopen(payload=_SAMPLE):
        graph = cognee_graph.build_graph(force=True)

    assert set(graph) >= _GRAPH_KEYS
    assert graph["softLinks"] == []
    assert len(graph["nodes"]) == 2
    assert len(graph["links"]) == 1

    # Every node carries the full vault node contract (renderer parity).
    for node in graph["nodes"]:
        assert _NODE_KEYS <= set(node)

    n1 = next(n for n in graph["nodes"] if n["id"] == "e1")
    assert n1["title"] == "Ada Lovelace"
    assert n1["project"] == "Person"          # type → cluster
    assert n1["tags"] == ["Person"]
    assert n1["degree"] == 1                   # one relationship
    assert n1["snippet"] == "First programmer."
    # Extras for the detail card ride along on the node.
    assert n1["sources"] == ["20_Areas/people.md"]
    assert n1["relations"] == [{"target": "Analytical Engine", "label": "designed"}]

    link = graph["links"][0]
    assert link["source"] == "e1" and link["target"] == "e2"
    assert link["label"] == "designed"

    # Projects mirror the vault {id,label,color} cluster shape.
    assert {p["id"] for p in graph["projects"]} == {"Person", "Concept"}
    for proj in graph["projects"]:
        assert set(proj) == {"id", "label", "color"}


def test_dangling_edge_is_dropped_and_degree_unaffected():
    """An edge to a node we didn't ingest is dropped before degree/relations,
    mirroring vault_graph's referential-integrity guard."""
    payload = {
        "nodes": [
            {"id": "e1", "name": "Ada", "type": "Person"},
            {"id": "e2", "name": "Engine", "type": "Concept"},
        ],
        "edges": [
            {"source_node_id": "e1", "target_node_id": "e2", "relationship_name": "designed"},
            # Dangling: e9 was never ingested → this edge must be ignored.
            {"source_node_id": "e1", "target_node_id": "e9", "relationship_name": "phantom"},
        ],
    }
    with _stub_urlopen(payload=payload):
        graph = cognee_graph.build_graph(force=True)

    assert len(graph["links"]) == 1                       # phantom edge dropped
    assert graph["links"][0]["target"] == "e2"
    n1 = next(n for n in graph["nodes"] if n["id"] == "e1")
    assert n1["degree"] == 1                              # not inflated by the phantom
    assert n1["relations"] == [{"target": "Engine", "label": "designed"}]


def test_node_contract_matches_vault_node_keys_exactly():
    """The mapped node's contract keys are a superset of the vault node's, so
    MemorySphere (which reads the vault keys) needs no change."""
    vault = _build_graph_uncached()
    vault_node_keys = set(vault["nodes"][0]) if vault["nodes"] else _NODE_KEYS
    with _stub_urlopen(payload=_SAMPLE):
        graph = cognee_graph.build_graph(force=True)
    assert vault_node_keys <= set(graph["nodes"][0])


# ---------------------------------------------------------------------------
# Route: GET /v1/memory/cognee/graph
# ---------------------------------------------------------------------------

def _make_app() -> web.Application:
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={}))
    adapter._background_tasks = set()
    mws = [mw for mw in (cors_middleware, security_headers_middleware) if mw is not None]
    app = web.Application(middlewares=mws)
    app["api_server_adapter"] = adapter
    memory_routes.register(app, adapter)
    return app


@pytest.mark.asyncio
async def test_route_returns_empty_graph_200_when_cognee_absent():
    app = _make_app()
    async with TestClient(TestServer(app)) as client:
        with _stub_urlopen(raise_exc=OSError("connection refused")):
            resp = await client.get("/v1/memory/cognee/graph")
        assert resp.status == 200
        body = await resp.json()
    assert _GRAPH_KEYS <= set(body)
    assert body["nodes"] == [] and body["links"] == []


@pytest.mark.asyncio
async def test_route_returns_mapped_graph_when_cognee_stubbed():
    app = _make_app()
    async with TestClient(TestServer(app)) as client:
        with _stub_urlopen(payload=_SAMPLE):
            resp = await client.get("/v1/memory/cognee/graph")
        assert resp.status == 200
        body = await resp.json()
    assert len(body["nodes"]) == 2
    assert _NODE_KEYS <= set(body["nodes"][0])


@pytest.mark.asyncio
async def test_route_is_fail_open_on_reader_exception():
    """Even if the reader itself raises, the route returns 200 empty, not 500."""
    app = _make_app()
    async with TestClient(TestServer(app)) as client:
        with patch.object(cognee_graph, "build_graph", side_effect=RuntimeError("boom")):
            resp = await client.get("/v1/memory/cognee/graph")
        assert resp.status == 200
        body = await resp.json()
    assert body["nodes"] == [] and body["error"]
