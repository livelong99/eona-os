"""Tests for the Cognee graph reader + ``GET /v1/memory/cognee/graph`` route.

Covers the two contract guarantees Part 2 of ``cognee-dual-brain`` must hold:

1. **Fail-open** — Cognee unreachable / unauthenticated / dataset not yet
   ingested → an *empty* graph with every frozen-contract key
   (``nodes/links/softLinks/projects``) and a 200 response (never 500, never
   block the Memory screen).
2. **Shape parity** — a live-shaped Cognee ``GraphDTO`` maps into the *same* JSON
   shape the vault ``/v1/memory/graph`` returns, so ``MemorySphere`` is reused
   unchanged.

The reader talks to the live Cognee API through ``agent.cognee_client`` (login +
bearer + ``/api/v1`` paths), so these tests patch that shared client rather than
``urlopen`` directly.
"""
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from agent import cognee_client
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
def _stub_cognee(graph=None, *, dataset_id="ds-vault"):
    """Patch the shared ``cognee_client`` the graph reader uses:

    - ``resolve_dataset_id`` → ``dataset_id`` (``None`` = dataset not found).
    - ``request`` (the authed ``GET .../graph``) → ``graph`` (``None`` = the
      client failed fail-open: unreachable / unauthorized / non-200).
    """
    with patch.object(cognee_client, "resolve_dataset_id", return_value=dataset_id), \
         patch.object(cognee_client, "request", return_value=graph):
        yield


# ---------------------------------------------------------------------------
# Reader: fail-open
# ---------------------------------------------------------------------------

def test_graph_request_failure_yields_empty_graph_with_error():
    """Cognee unreachable / unauthorized → client returns None → empty + error."""
    with _stub_cognee(graph=None):
        graph = cognee_graph.build_graph(force=True)
    assert _GRAPH_KEYS <= set(graph)
    assert graph["nodes"] == []
    assert graph["links"] == []
    assert graph["softLinks"] == []
    assert graph["projects"] == []
    assert graph["error"]  # error string is surfaced


def test_dataset_not_found_is_fail_open():
    """Vault dataset not ingested yet → empty graph + error, still 200-able."""
    with _stub_cognee(dataset_id=None):
        graph = cognee_graph.build_graph(force=True)
    assert graph["nodes"] == [] and "error" in graph
    assert "not found" in graph["error"]


def test_malformed_payload_degrades_to_empty():
    with _stub_cognee(graph="not-a-graph"):
        graph = cognee_graph.build_graph(force=True)
    assert graph["nodes"] == [] and graph["links"] == []


# ---------------------------------------------------------------------------
# Reader: mapping / shape parity with the vault graph
# ---------------------------------------------------------------------------

# Live GraphDTO shape: nodes carry {id, label, type, properties:{...}} — entity
# attributes (description/sources) are NESTED under properties; edges are
# {source, target, label}.
_SAMPLE = {
    "nodes": [
        {"id": "e1", "label": "Ada Lovelace", "type": "Person",
         "properties": {"description": "First programmer.",
                        "sources": ["20_Areas/people.md"]}},
        {"id": "e2", "label": "Analytical Engine", "type": "Concept",
         "properties": {"description": "Mechanical general-purpose computer."}},
    ],
    "edges": [
        {"source": "e1", "target": "e2", "label": "designed"},
    ],
}


def test_sample_payload_maps_to_vault_graph_shape():
    with _stub_cognee(graph=_SAMPLE):
        graph = cognee_graph.build_graph(force=True)

    assert set(graph) >= _GRAPH_KEYS
    assert graph["softLinks"] == []
    assert len(graph["nodes"]) == 2
    assert len(graph["links"]) == 1

    # Every node carries the full vault node contract (renderer parity).
    for node in graph["nodes"]:
        assert _NODE_KEYS <= set(node)

    n1 = next(n for n in graph["nodes"] if n["id"] == "e1")
    assert n1["title"] == "Ada Lovelace"      # from top-level label
    assert n1["project"] == "Person"          # type → cluster
    assert n1["tags"] == ["Person"]
    assert n1["degree"] == 1                   # one relationship
    assert n1["snippet"] == "First programmer."  # from nested properties.description
    # Extras for the detail card ride along on the node. Sources are OBJECTS
    # ({path?, title?, snippet}) — the shape the frontend CogneeSource expects;
    # a bare string source string would render as an empty box.
    assert n1["sources"] == [{"path": "20_Areas/people.md", "snippet": ""}]
    assert n1["relations"] == [{"target": "Analytical Engine", "label": "designed"}]

    link = graph["links"][0]
    assert link["source"] == "e1" and link["target"] == "e2"
    assert link["label"] == "designed"

    # Projects mirror the vault {id,label,color} cluster shape.
    assert {p["id"] for p in graph["projects"]} == {"Person", "Concept"}
    for proj in graph["projects"]:
        assert set(proj) == {"id", "label", "color"}


def test_properties_are_flattened_for_node_attrs():
    """Entity attrs nested under GraphNodeDTO.properties are read correctly."""
    payload = {
        "nodes": [{"id": "e1", "label": "Babbage", "type": "Person",
                   "properties": {"name": "Charles Babbage",
                                  "description": "Built the engine."}}],
        "edges": [],
    }
    with _stub_cognee(graph=payload):
        graph = cognee_graph.build_graph(force=True)
    n = graph["nodes"][0]
    # properties.name wins for the title; properties.description → snippet.
    assert n["title"] == "Charles Babbage"
    assert n["snippet"] == "Built the engine."
    assert n["project"] == "Person"  # top-level type still read


def test_sources_emit_objects_not_strings():
    """Cognee sources map to {path?, title?, snippet} objects (frontend
    CogneeSource), whether the payload carries bare strings or dicts."""
    payload = {
        "nodes": [{
            "id": "e1", "label": "Ada", "type": "Person",
            "properties": {"sources": [
                "20_Areas/people.md",  # bare string → {path, snippet:""}
                {"path": "10_Projects/x/index.md", "title": "X Project",
                 "snippet": "Ada worked on X."},  # dict → all three fields
            ]},
        }],
        "edges": [],
    }
    with _stub_cognee(graph=payload):
        graph = cognee_graph.build_graph(force=True)
    sources = graph["nodes"][0]["sources"]
    assert sources == [
        {"path": "20_Areas/people.md", "snippet": ""},
        {"path": "10_Projects/x/index.md", "title": "X Project", "snippet": "Ada worked on X."},
    ]
    # Every source is an object with a present (string) snippet — never a bare str.
    for s in sources:
        assert isinstance(s, dict) and isinstance(s["snippet"], str)


def test_dangling_edge_is_dropped_and_degree_unaffected():
    """An edge to a node we didn't ingest is dropped before degree/relations,
    mirroring vault_graph's referential-integrity guard."""
    payload = {
        "nodes": [
            {"id": "e1", "label": "Ada", "type": "Person"},
            {"id": "e2", "label": "Engine", "type": "Concept"},
        ],
        "edges": [
            {"source": "e1", "target": "e2", "label": "designed"},
            # Dangling: e9 was never ingested → this edge must be ignored.
            {"source": "e1", "target": "e9", "label": "phantom"},
        ],
    }
    with _stub_cognee(graph=payload):
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
    with _stub_cognee(graph=_SAMPLE):
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
        with _stub_cognee(graph=None):
            resp = await client.get("/v1/memory/cognee/graph")
        assert resp.status == 200
        body = await resp.json()
    assert _GRAPH_KEYS <= set(body)
    assert body["nodes"] == [] and body["links"] == []


@pytest.mark.asyncio
async def test_route_returns_mapped_graph_when_cognee_stubbed():
    app = _make_app()
    async with TestClient(TestServer(app)) as client:
        with _stub_cognee(graph=_SAMPLE):
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
