"""Cognee graph — read Cognee's knowledge graph and map it onto the frozen
MemoryGraph contract so the dashboard's ``MemorySphere`` 3D renderer is reused
**unchanged**.

Backs ``GET /v1/memory/cognee/graph`` (wired in
``dashboard.memory_routes.register``). The contract mirrored here is the one
``vault_graph._build_graph_uncached`` produces: ``{nodes, links, softLinks,
projects}`` with the node shape from ``vault_graph.py:291-301``.

Invariants (see ``openspec/changes/cognee-dual-brain/design.md``):

- The **vault is the source of truth**; Cognee is a derived, rebuildable index
  over the read-only vault. This reader never writes to Cognee.
- **Fail-open.** Service down / unreachable / not-configured / not-yet-ingested
  / malformed all degrade to an **empty graph** (full contract keys) — never
  raise, never block the Memory screen. A thin ``urllib`` HTTP client; no SDK
  dependency is added to ``engine/pyproject.toml`` (mirrors
  ``agent.brain._cognee_recall``).
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

# Reuse the vault palette so Cognee clusters read with the same colour idiom.
from gateway.platforms.vault_graph import _PROJECT_COLORS

logger = logging.getLogger(__name__)

# Cognee REST base — same default + override as agent.brain (``COGNEE_URL``).
_COGNEE_URL = os.environ.get("COGNEE_URL", "http://127.0.0.1:8765").rstrip("/")
_TIMEOUT = 10  # seconds; mirrors brain.py's fail-open network calls

# Cache idiom mirrors ``vault_graph.build_graph`` so the Cognee read isn't
# per-request. Only *successful* builds are cached; a failed (error) build is
# returned uncached so a transient outage recovers on the next request.
_CACHE_LOCK = threading.Lock()
_CACHE: Dict[str, Any] = {"graph": None, "built_at": 0.0}
_CACHE_TTL = 60.0  # seconds


def _empty_graph() -> Dict[str, Any]:
    """The frozen contract with every list empty (the fail-open payload)."""
    return {"nodes": [], "links": [], "softLinks": [], "projects": []}


# ---------------------------------------------------------------------------
# Cognee REST read (fail-open)
# ---------------------------------------------------------------------------

def _fetch_cognee_graph() -> Tuple[List[Any], List[Any], Optional[str]]:
    """GET Cognee's graph over REST.

    Returns ``(nodes, edges, error)``. On any failure ``nodes``/``edges`` are
    empty and ``error`` is a short string; on success ``error`` is ``None``.
    Never raises.
    """
    import urllib.request

    url = f"{_COGNEE_URL}/graph"
    req = urllib.request.Request(url, headers={"accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:  # noqa: S310 (trusted local URL)
            if getattr(resp, "status", 200) != 200:
                return [], [], f"cognee returned status {getattr(resp, 'status', '?')}"
            payload = json.loads(resp.read().decode())
    except Exception as exc:  # unreachable / timeout / malformed → fail-open
        logger.debug("Cognee graph fetch failed (non-fatal): %s", exc)
        return [], [], str(exc)

    nodes, edges = _split_payload(payload)
    return nodes, edges, None


def _split_payload(payload: Any) -> Tuple[List[Any], List[Any]]:
    """Pull ``(nodes, edges)`` out of Cognee's response, tolerating shapes.

    Accepts ``{nodes, edges|links|relationships}``, a bare ``[nodes, edges]``
    pair, or anything else (→ empty). Cognee's REST surface is young and moves;
    a shape we don't recognise degrades to empty rather than raising.
    """
    if isinstance(payload, dict):
        nodes = payload.get("nodes") or payload.get("entities") or []
        edges = (
            payload.get("edges")
            or payload.get("links")
            or payload.get("relationships")
            or payload.get("relations")
            or []
        )
    elif isinstance(payload, (list, tuple)) and len(payload) >= 2:
        nodes, edges = payload[0], payload[1]
    else:
        nodes, edges = [], []
    nodes = nodes if isinstance(nodes, list) else []
    edges = edges if isinstance(edges, list) else []
    return nodes, edges


# ---------------------------------------------------------------------------
# Cognee → frozen graph contract mapping
# ---------------------------------------------------------------------------

def _stable_id(value: Any) -> Optional[str]:
    """Coerce a node reference (id / uuid / name / nested dict) to a string id."""
    if value is None:
        return None
    if isinstance(value, dict):
        return _node_id(value)
    text = str(value).strip()
    return text or None


def _node_id(node: Dict[str, Any]) -> Optional[str]:
    for key in ("id", "node_id", "uuid", "name"):
        val = node.get(key)
        if val:
            return str(val).strip()
    return None


def _node_title(node: Dict[str, Any], node_id: str) -> str:
    for key in ("name", "label", "title", "text"):
        val = node.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return node_id


def _node_type(node: Dict[str, Any]) -> Optional[str]:
    for key in ("type", "node_type", "entity_type", "label"):
        val = node.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return None


def _node_description(node: Dict[str, Any]) -> str:
    for key in ("description", "text", "summary", "content"):
        val = node.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return ""


def _node_sources(node: Dict[str, Any]) -> List[str]:
    srcs = node.get("sources")
    if not isinstance(srcs, list):
        one = node.get("source_path") or node.get("source")
        srcs = [one] if one else []
    return [str(s).strip() for s in srcs if s and str(s).strip()]


def _edge_fields(edge: Any) -> Tuple[Optional[str], Optional[str], str]:
    """Return ``(source_id, target_id, label)`` from a Cognee edge, tolerant of
    dict and tuple/list shapes. ``(None, None, "")`` for an unusable edge."""
    if isinstance(edge, dict):
        src = edge.get("source") or edge.get("source_node_id") or edge.get("from")
        tgt = edge.get("target") or edge.get("target_node_id") or edge.get("to")
        label = (
            edge.get("label")
            or edge.get("relationship_name")
            or edge.get("relationship")
            or edge.get("relation")
            or edge.get("kind")
            or ""
        )
        return _stable_id(src), _stable_id(tgt), str(label).strip()
    if isinstance(edge, (list, tuple)) and len(edge) >= 2:
        label = ""
        if len(edge) >= 3 and isinstance(edge[2], str):
            label = edge[2]
        elif len(edge) >= 4 and isinstance(edge[3], dict):
            label = edge[3].get("relationship_name") or edge[3].get("label") or ""
        return _stable_id(edge[0]), _stable_id(edge[1]), str(label).strip()
    return None, None, ""


def _map_graph(raw_nodes: List[Any], raw_edges: List[Any]) -> Dict[str, Any]:
    """Map Cognee entities→nodes and relationships→links into the frozen graph
    contract. ``softLinks`` is always ``[]`` (Cognee edges are all real
    relations). Extra per-node fields (``description``/``relations``/``sources``)
    ride along for the detail card; the renderer ignores unknown keys."""
    norm: List[Tuple[str, Dict[str, Any]]] = []
    titles: Dict[str, str] = {}
    types: Dict[str, Optional[str]] = {}
    for rn in raw_nodes:
        if not isinstance(rn, dict):
            continue
        nid = _node_id(rn)
        if not nid or nid in titles:
            continue
        title = _node_title(rn, nid)
        norm.append((nid, rn))
        titles[nid] = title
        types[nid] = _node_type(rn)

    # Edges → links + degree + per-node relations (resolve target to a title).
    links: List[Dict[str, Any]] = []
    degree: Dict[str, int] = {}
    relations: Dict[str, List[Dict[str, str]]] = {}
    seen: set[Tuple[str, str, str]] = set()
    for re_ in raw_edges:
        src, tgt, label = _edge_fields(re_)
        if not src or not tgt or src == tgt:
            continue
        # Referential integrity: drop edges to a node we didn't ingest, BEFORE
        # touching degree/relations — mirrors vault_graph (``tid not in
        # node_ids``) so a node never renders oversized with phantom relations.
        if src not in titles or tgt not in titles:
            continue
        key = (src, tgt, label)
        if key in seen:
            continue
        seen.add(key)
        link: Dict[str, Any] = {"source": src, "target": tgt}
        if label:
            link["label"] = label
        links.append(link)
        degree[src] = degree.get(src, 0) + 1
        degree[tgt] = degree.get(tgt, 0) + 1
        relations.setdefault(src, []).append({"target": titles.get(tgt, tgt), "label": label})
        relations.setdefault(tgt, []).append({"target": titles.get(src, src), "label": label})

    # Type clusters → projects (drive node colour, mirrors vault projects).
    project_names = sorted({t for t in types.values() if t})
    color_of = {
        name: _PROJECT_COLORS[i % len(_PROJECT_COLORS)]
        for i, name in enumerate(project_names)
    }
    projects = [{"id": n, "label": n, "color": color_of[n]} for n in project_names]

    nodes: List[Dict[str, Any]] = []
    for nid, rn in norm:
        etype = types[nid]
        description = _node_description(rn)
        nodes.append({
            "id": nid,
            "title": titles[nid],
            "folder": etype or "Entity",
            "project": etype,
            "tags": [etype] if etype else [],
            "degree": degree.get(nid, 0),
            "updated": "",  # Cognee has no per-entity mtime; renderer tolerates
            "snippet": description[:220],
            "pinned": False,
            # Extras for the Cognee node-detail card (renderer ignores these):
            "description": description,
            "relations": relations.get(nid, []),
            "sources": _node_sources(rn),
        })

    return {"nodes": nodes, "links": links, "softLinks": [], "projects": projects}


# ---------------------------------------------------------------------------
# Public entry (cached, fail-open)
# ---------------------------------------------------------------------------

def _load() -> Dict[str, Any]:
    raw_nodes, raw_edges, error = _fetch_cognee_graph()
    graph = _map_graph(raw_nodes, raw_edges)
    if error:
        graph["error"] = error
    return graph


def build_graph(force: bool = False) -> Dict[str, Any]:
    """Return the Cognee graph in the frozen contract, cached on TTL.

    Fail-open: on any error the payload is an **empty** graph (full contract
    keys) plus an ``error`` string — and is **not** cached, so a transient
    Cognee outage recovers on the next request.
    """
    with _CACHE_LOCK:
        cached = _CACHE["graph"]
        fresh = cached is not None and (time.time() - _CACHE["built_at"]) < _CACHE_TTL
        if fresh and not force:
            return cached
    graph = _load()
    if graph.get("error"):
        return graph  # don't cache failures
    with _CACHE_LOCK:
        _CACHE["graph"] = graph
        _CACHE["built_at"] = time.time()
    return graph
