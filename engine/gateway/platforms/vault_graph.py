"""Vault graph — parse the Obsidian PARA vault into a node/edge graph.

Backs the dashboard Memory screen's three live endpoints (wired in
``api_dashboard.register_dashboard_routes``):

- ``GET /v1/memory/graph``  → :func:`build_graph` (cached)
- ``GET /v1/memory/note``   → :func:`read_note`
- ``GET /v1/memory/search`` → filesystem full-text fallback :func:`fts_search`
  (the Brain semantic lane is attempted first by the route handler).

The vault is mounted read-only at ``/vault`` in the hermes container
(``HERMES_VAULT_PATH=/vault``).  We scan ~3,500 *genuine* notes (raw is
~27K — ``node_modules`` and agent-generated files dominate the rest), so the
graph build is **cached** (TTL + max-mtime signal) to avoid re-scanning per
request.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Vault root + exclude rules
# ---------------------------------------------------------------------------

VAULT_ROOT = Path(
    os.path.expanduser(os.environ.get("HERMES_VAULT_PATH", "~/Documents/Obsidian/Vault"))
).resolve()

# Canonical exclude: any path containing one of these segments is noise
# (generated/agent files). Brings ~27K raw .md down to ~3,500 genuine notes.
_EXCLUDE_SEGMENTS = frozenset({
    "node_modules", "_bmad", "_bmad-output", ".obsidian", ".claude",
    ".git", ".swarm", ".claude-flow", ".agent", ".trash",
})

# Top-level PARA dir → display folder.  ``10_Projects`` carries a project segment.
_FOLDER_MAP: Dict[str, str] = {
    "10_Projects": "Projects",
    "20_Areas": "Areas",
    "30_Resources": "Resources",
    "40_Archive": "Archive",
    "AI": "Daily",
    "00_Inbox": "Inbox",
}

# Stable palette for project clusters (cycled deterministically).
_PROJECT_COLORS = [
    "#7c5cff", "#22d3ee", "#34d399", "#f59e0b", "#f472b6",
    "#60a5fa", "#a78bfa", "#fb7185", "#2dd4bf", "#facc15",
    "#818cf8", "#4ade80", "#fbbf24", "#e879f9", "#38bdf8",
]

# [[Target]], [[Target|alias]], [[Target#section]], ![[Target]] embeds.
_WIKILINK_RE = re.compile(r"\[\[!?\s*([^\]|#]+)")

# Fenced ```code``` and `inline code` — stripped before wikilink extraction so
# nested-list literals (``[[0,0],[1,1]]``), Obj-C message sends
# (``[[Foo alloc] init]``) and JSON arrays don't masquerade as [[wikilinks]].
_CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`[^`]*`")

# Frontmatter block at the very top of a file.
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

_MAX_NOTE_BYTES = 512 * 1024  # skip pathologically large files in the scan

# Soft-edges (derived connectivity) bounds — keep the sphere performant.
# Tags/folders are STARRED to a recency anchor, never fully meshed.
_SOFT_TAG_MIN, _SOFT_TAG_MAX = 2, 15        # specific tags only (skip mega-generic)
_SOFT_FOLDER_MIN, _SOFT_FOLDER_MAX = 2, 12  # small/cohesive dirs only
_SOFT_PER_NODE_CAP = 4                       # max soft degree per node
_SOFT_TOTAL_CAP = 600                        # max softLinks overall


def _is_excluded(rel_parts: Tuple[str, ...]) -> bool:
    """True if any path segment is in the exclude set, is a dotfile, or the
    note lives under ``30_Resources/Skills`` (agent skill docs)."""
    for part in rel_parts:
        if part in _EXCLUDE_SEGMENTS or part.startswith("."):
            return True
    if len(rel_parts) >= 2 and rel_parts[0] == "30_Resources" and rel_parts[1] == "Skills":
        return True
    return False


def _relative_time(mtime: float, now: Optional[float] = None) -> str:
    """Format an epoch mtime as a coarse relative string (e.g. ``2h ago``)."""
    now = now if now is not None else time.time()
    delta = max(0, int(now - mtime))
    if delta < 60:
        return "just now"
    if delta < 3600:
        return f"{delta // 60}m ago"
    if delta < 86400:
        return f"{delta // 3600}h ago"
    if delta < 86400 * 30:
        return f"{delta // 86400}d ago"
    if delta < 86400 * 365:
        return f"{delta // (86400 * 30)}mo ago"
    return f"{delta // (86400 * 365)}y ago"


def _parse_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    """Best-effort YAML frontmatter parse without a YAML dependency.

    Returns ``(frontmatter_dict, body_without_frontmatter)``. Only the small
    set of fields we need (title, tags, pinned/sticky) is parsed robustly;
    everything else is captured as raw strings.
    """
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    block = match.group(1)
    body = text[match.end():]
    fm: Dict[str, Any] = {}
    current_list_key: Optional[str] = None
    for raw in block.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        # Inline list item under a previously seen "key:" with no value.
        if current_list_key is not None and re.match(r"^\s*-\s+", line):
            fm.setdefault(current_list_key, [])
            if isinstance(fm[current_list_key], list):
                fm[current_list_key].append(line.split("-", 1)[1].strip().strip("'\""))
            continue
        current_list_key = None
        m = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)$", line)
        if not m:
            continue
        key, value = m.group(1), m.group(2).strip()
        if value == "":
            # Could be the start of a block list.
            current_list_key = key
            continue
        if value.startswith("[") and value.endswith("]"):
            items = [v.strip().strip("'\"") for v in value[1:-1].split(",") if v.strip()]
            fm[key] = items
        else:
            fm[key] = value.strip("'\"")
    return fm, body


def _first_sentences(body: str, max_chars: int = 220) -> str:
    """First 1-2 non-heading, non-empty sentences for a node snippet."""
    for raw in body.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith(("- ", "* ", ">", "|", "```")):
            continue
        # Strip markdown emphasis / wikilink brackets for readability.
        line = re.sub(r"\[\[!?\s*([^\]|#]+)[^\]]*\]\]", r"\1", line)
        line = re.sub(r"[*_`]", "", line)
        return line[:max_chars]
    return ""


def _coerce_tags(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(t) for t in value if str(t).strip()]
    if isinstance(value, str) and value.strip():
        return [t.strip() for t in re.split(r"[,\s]+", value) if t.strip()]
    return []


def _extract_wikilinks(text: str) -> List[str]:
    """Return raw [[wikilink]] targets, ignoring matches inside code spans."""
    stripped = _INLINE_CODE_RE.sub("", _CODE_FENCE_RE.sub("", text))
    return [m.strip() for m in _WIKILINK_RE.findall(stripped)]


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1", "pinned", "sticky"}
    return bool(value)


# ---------------------------------------------------------------------------
# Graph build (cached)
# ---------------------------------------------------------------------------

_CACHE_LOCK = threading.Lock()
_CACHE: Dict[str, Any] = {"graph": None, "built_at": 0.0, "signal": None}
_CACHE_TTL = 60.0  # seconds


def _scan_notes() -> List[Path]:
    """Walk the vault, pruning excluded directories, collecting genuine ``.md``."""
    notes: List[Path] = []
    root = VAULT_ROOT
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root)
        rel_parts = tuple(p for p in rel_dir.parts if p not in (".", ""))
        # Prune excluded subdirs in-place so os.walk doesn't descend.
        dirnames[:] = [
            d for d in dirnames
            if d not in _EXCLUDE_SEGMENTS and not d.startswith(".")
        ]
        # Skip 30_Resources/Skills entirely.
        if len(rel_parts) >= 2 and rel_parts[0] == "30_Resources" and rel_parts[1] == "Skills":
            dirnames[:] = []
            continue
        if _is_excluded(rel_parts):
            continue
        for name in filenames:
            if not name.endswith(".md") or name.startswith("."):
                continue
            notes.append(Path(dirpath) / name)
    return notes


def _folder_and_project(rel_parts: Tuple[str, ...]) -> Tuple[str, Optional[str]]:
    """Map vault-relative path parts → (display folder, project|None)."""
    if not rel_parts:
        return "Resources", None
    top = rel_parts[0]
    folder = _FOLDER_MAP.get(top, "Resources")
    project = None
    if top == "10_Projects" and len(rel_parts) >= 2:
        project = rel_parts[1]
    return folder, project


def _build_graph_uncached() -> Dict[str, Any]:
    """Scan + parse the vault into the frozen graph contract."""
    now = time.time()
    raw_nodes: List[Dict[str, Any]] = []
    # Unique key (title / stem / alias, all lowercased) → node id. First writer
    # wins so a real note isn't clobbered by a later duplicate.
    name_index: Dict[str, str] = {}
    # Stem → list of node ids sharing that stem (for ambiguity resolution by
    # same-project preference). Keyed lowercased.
    stem_buckets: Dict[str, List[str]] = {}
    # node id → its project (for same-project tie-breaking)
    node_project: Dict[str, Optional[str]] = {}
    # node id → list of raw link target strings
    link_targets: Dict[str, List[str]] = {}
    # Side metadata for the soft-edges layer (not in the node shape).
    node_mtime: Dict[str, float] = {}            # for recency-anchor selection
    node_tags: Dict[str, List[str]] = {}         # lowercased tags
    node_parent: Dict[str, str] = {}             # immediate parent dir (posix)

    for path in _scan_notes():
        try:
            rel = path.relative_to(VAULT_ROOT)
        except ValueError:
            continue
        node_id = rel.as_posix()
        rel_parts = rel.parts
        try:
            stat = path.stat()
            if stat.st_size > _MAX_NOTE_BYTES:
                text = ""
            else:
                text = path.read_text(encoding="utf-8", errors="ignore")
            mtime = stat.st_mtime
        except OSError:
            continue

        fm, body = _parse_frontmatter(text)
        stem = path.stem
        title = str(fm.get("title") or stem).strip() or stem
        folder, project = _folder_and_project(rel_parts)
        tags = _coerce_tags(fm.get("tags"))
        pinned = _coerce_bool(fm.get("pinned") or fm.get("sticky"))
        snippet = _first_sentences(body)

        # Index for link resolution (case-insensitive). First writer wins so
        # we don't clobber a real note with a later duplicate stem/title.
        name_index.setdefault(title.lower(), node_id)
        name_index.setdefault(stem.lower(), node_id)
        for alias in _coerce_tags(fm.get("aliases")):
            name_index.setdefault(alias.lower(), node_id)
        stem_buckets.setdefault(stem.lower(), []).append(node_id)
        node_project[node_id] = project
        node_mtime[node_id] = mtime
        node_tags[node_id] = [t.lower() for t in tags]
        node_parent[node_id] = rel.parent.as_posix()

        link_targets[node_id] = _extract_wikilinks(text)

        raw_nodes.append({
            "id": node_id,
            "title": title,
            "folder": folder,
            "project": project,
            "tags": tags,
            "degree": 0,
            "updated": _relative_time(mtime, now),
            "snippet": snippet,
            "pinned": pinned,
        })

    node_ids = {n["id"] for n in raw_nodes}

    def _resolve_target(raw: str, source: str) -> Optional[str]:
        """Resolve a raw [[wikilink]] target to a node id.

        Order: exact name (title/stem/alias) → path-style basename. On an
        ambiguous stem (same filename in several folders) prefer the
        source's project, else fall back to the first writer. Returns None
        for unresolved / excluded targets.
        """
        tnorm = raw.strip().lower()
        if not tnorm:
            return None
        # 1. Exact match on title / stem / alias.
        tid = name_index.get(tnorm)
        if tid is not None:
            return _disambiguate(tnorm, tid, source)
        # 2. Path-style link "folder/sub/Title" — resolve by basename.
        base = Path(tnorm).name
        # Drop a trailing ".md" the author may have written.
        if base.endswith(".md"):
            base = base[:-3]
        if base and base != tnorm:
            tid = name_index.get(base)
            if tid is not None:
                return _disambiguate(base, tid, source)
        return None

    def _disambiguate(stem_key: str, default_id: str, source: str) -> str:
        """When a stem maps to several notes, prefer the source's project."""
        bucket = stem_buckets.get(stem_key)
        if not bucket or len(bucket) == 1:
            return default_id
        src_project = node_project.get(source)
        if src_project is not None:
            for cand in bucket:
                if node_project.get(cand) == src_project:
                    return cand
        return default_id

    # Resolve edges; dedupe; drop edges to unknown targets and self-loops.
    edges: List[Dict[str, str]] = []
    seen_edges: set[Tuple[str, str]] = set()
    degree: Dict[str, int] = {nid: 0 for nid in node_ids}

    for source, targets in link_targets.items():
        for target in targets:
            tid = _resolve_target(target, source)
            if tid is None or tid == source or tid not in node_ids:
                continue
            key = (source, tid)
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append({"source": source, "target": tid})
            degree[source] = degree.get(source, 0) + 1
            degree[tid] = degree.get(tid, 0) + 1

    for n in raw_nodes:
        n["degree"] = degree.get(n["id"], 0)

    # ------------------------------------------------------------------
    # Soft-edges layer — derived connectivity so the loosely-wikilinked
    # sphere reads as a graph WITHOUT fabricating fake wikilinks. Two cheap,
    # deterministic signals (no Brain/Qdrant): shared specific tags, and
    # cohesive parent folders. Each group is STARRED to its most-recently-
    # updated anchor. Bounded by per-node + total caps; never feeds degree.
    # ------------------------------------------------------------------
    real_pairs = {frozenset((e["source"], e["target"])) for e in edges}
    soft_links = _build_soft_links(
        node_ids=node_ids,
        node_tags=node_tags,
        node_parent=node_parent,
        node_mtime=node_mtime,
        real_pairs=real_pairs,
    )

    # Distinct projects with a stable color.
    project_names = sorted({n["project"] for n in raw_nodes if n["project"]})
    projects = [
        {
            "id": name,
            "label": name,
            "color": _PROJECT_COLORS[i % len(_PROJECT_COLORS)],
        }
        for i, name in enumerate(project_names)
    ]

    return {
        "nodes": raw_nodes,
        "links": edges,
        "softLinks": soft_links,
        "projects": projects,
    }


def _build_soft_links(
    *,
    node_ids: set,
    node_tags: Dict[str, List[str]],
    node_parent: Dict[str, str],
    node_mtime: Dict[str, float],
    real_pairs: set,
) -> List[Dict[str, str]]:
    """Derive bounded star-shaped soft edges from tags + folders.

    For each qualifying group (a specific tag, or a cohesive parent dir) pick
    the most-recently-updated member as the anchor and connect every other
    member to it. Tag edges are emitted first so they win when capping.
    Pairs are unordered + deduped; pairs already joined by a real wikilink (or
    self-loops) are dropped; per-node soft degree and the total are capped.
    """

    def _anchor(members: List[str]) -> str:
        """Most-recently-updated member (ties broken by id for determinism)."""
        return max(members, key=lambda nid: (node_mtime.get(nid, 0.0), nid))

    def _ordered_groups(
        buckets: Dict[str, List[str]], lo: int, hi: int
    ) -> List[Tuple[str, List[str]]]:
        """Qualifying groups (size in [lo,hi]), in a stable order."""
        out: List[Tuple[str, List[str]]] = []
        for key in sorted(buckets):
            members = sorted(set(buckets[key]))
            if lo <= len(members) <= hi:
                out.append((key, members))
        return out

    # Build the two bucket maps.
    tag_buckets: Dict[str, List[str]] = {}
    for nid, tags in node_tags.items():
        for tag in set(tags):
            if tag:
                tag_buckets.setdefault(tag, []).append(nid)
    folder_buckets: Dict[str, List[str]] = {}
    for nid, parent in node_parent.items():
        folder_buckets.setdefault(parent, []).append(nid)

    soft_links: List[Dict[str, str]] = []
    seen_soft: set = set()
    soft_degree: Dict[str, int] = {}

    def _emit(groups: List[Tuple[str, List[str]]], kind: str) -> None:
        for _key, members in groups:
            if len(soft_links) >= _SOFT_TOTAL_CAP:
                return
            anchor = _anchor(members)
            for member in members:
                if member == anchor:
                    continue
                pair = frozenset((member, anchor))
                if pair in real_pairs or pair in seen_soft:
                    continue
                if soft_degree.get(member, 0) >= _SOFT_PER_NODE_CAP:
                    continue
                if soft_degree.get(anchor, 0) >= _SOFT_PER_NODE_CAP:
                    continue
                seen_soft.add(pair)
                soft_degree[member] = soft_degree.get(member, 0) + 1
                soft_degree[anchor] = soft_degree.get(anchor, 0) + 1
                soft_links.append({"source": member, "target": anchor, "kind": kind})
                if len(soft_links) >= _SOFT_TOTAL_CAP:
                    return

    # Tag edges first (prioritized over folder when capping), then folders.
    _emit(_ordered_groups(tag_buckets, _SOFT_TAG_MIN, _SOFT_TAG_MAX), "tag")
    _emit(_ordered_groups(folder_buckets, _SOFT_FOLDER_MIN, _SOFT_FOLDER_MAX), "folder")
    return soft_links


def build_graph(force: bool = False) -> Dict[str, Any]:
    """Return the cached graph, rebuilding on TTL expiry or ``force``.

    Cheap freshness signal: TTL only (a full max-mtime scan would itself cost a
    walk). ~3,500 files build in a couple seconds; subsequent calls are instant.
    """
    with _CACHE_LOCK:
        cached = _CACHE["graph"]
        fresh = cached is not None and (time.time() - _CACHE["built_at"]) < _CACHE_TTL
        if fresh and not force:
            return cached
    # Build outside the lock (the walk is slow); last writer wins.
    graph = _build_graph_uncached()
    with _CACHE_LOCK:
        _CACHE["graph"] = graph
        _CACHE["built_at"] = time.time()
    return graph


# ---------------------------------------------------------------------------
# Note read (detail panel) — path-validated against the vault root
# ---------------------------------------------------------------------------

def _resolve_in_vault(rel_path: str) -> Optional[Path]:
    """Resolve a vault-relative path, rejecting traversal outside the root."""
    rel_path = (rel_path or "").strip().lstrip("/")
    if not rel_path:
        return None
    candidate = (VAULT_ROOT / rel_path).resolve()
    try:
        candidate.relative_to(VAULT_ROOT)
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    return candidate


def read_note(rel_path: str) -> Optional[Dict[str, Any]]:
    """Read a note + resolve its outgoing links and backlinks.

    Returns ``None`` if the path is invalid / traverses outside the vault.
    Backlinks are computed from the (cached) graph so this stays cheap.
    """
    path = _resolve_in_vault(rel_path)
    if path is None:
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
        mtime = path.stat().st_mtime
    except OSError:
        return None

    fm, body = _parse_frontmatter(text)
    node_id = path.relative_to(VAULT_ROOT).as_posix()
    title = str(fm.get("title") or path.stem).strip() or path.stem

    graph = build_graph()
    # Derive outgoing links + backlinks straight from the graph edges so the
    # detail panel stays consistent with the rendered sphere (same resolver).
    links = [e["target"] for e in graph["links"] if e["source"] == node_id]
    backlinks = [e["source"] for e in graph["links"] if e["target"] == node_id]

    return {
        "path": node_id,
        "title": title,
        "content": text,
        "frontmatter": fm,
        "links": links,
        "backlinks": backlinks,
        "updated": _relative_time(mtime),
    }


# ---------------------------------------------------------------------------
# Filesystem full-text search (Brain fallback)
# ---------------------------------------------------------------------------

def fts_search(query: str, k: int = 10) -> List[Dict[str, Any]]:
    """Rank genuine notes by case-insensitive match count of ``query`` terms.

    Title matches are weighted heavier than body matches. Returns the search
    result shape: ``{id, title, folder, project, score, snippet}``.
    """
    query = (query or "").strip()
    if not query:
        return []
    terms = [t.lower() for t in re.split(r"\s+", query) if t]
    if not terms:
        return []

    graph = build_graph()
    node_meta = {n["id"]: n for n in graph["nodes"]}

    scored: List[Tuple[float, Dict[str, Any]]] = []
    for path in _scan_notes():
        try:
            rel = path.relative_to(VAULT_ROOT).as_posix()
        except ValueError:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        lower = text.lower()
        title = (node_meta.get(rel, {}).get("title") or path.stem)
        title_lower = title.lower()
        score = 0.0
        for term in terms:
            body_hits = lower.count(term)
            if body_hits == 0:
                continue
            score += body_hits + 3.0 * title_lower.count(term)
        if score <= 0:
            continue
        meta = node_meta.get(rel, {})
        scored.append((score, {
            "id": rel,
            "title": title,
            "folder": meta.get("folder", "Resources"),
            "project": meta.get("project"),
            "score": float(score),
            "snippet": meta.get("snippet") or _first_sentences(text),
        }))

    scored.sort(key=lambda s: s[0], reverse=True)
    return [item for _, item in scored[:k]]
