"""Brain — the L0 shared-memory contract (retrieve + append over the one vault).

CONTRACT (Phase 0). Interface + implementation by Worker W-C:
fuse Qdrant similarity (``scripts/index-vault.py``) with the holographic
``FactRetriever`` (``engine/plugins/memory/holographic/retrieval.py``: FTS5 +
Jaccard + HRR + temporal decay) AND a dated-note **time-walk** over the PARA
vault, and back ``append`` with the ReasoningBank / Preference-Spine stores.

Consumers (do not change these signatures without coordinating): the Chronicle
(L3), the Agent-Tools Platform one-brain wiring (§8.2), and the Evolution Engine
(L5). All retrieved context is injected as USER messages by the caller, never
into the system prompt (cache discipline, §5.4).

Append-only write discipline
----------------------------
``append()`` never mutates an existing note.  Every write creates a new
``YYYY-MM-DD-<id8>.md`` file in the namespace directory.  Callers that touch
*learned* memory (ReasoningBank, Preference Spine) MUST pass ``TrustGate.gate``
before calling ``append()`` — see ``engine/agent/trust_gate.py`` (W-D's domain).
Brain itself does NOT call the gate; it is below L1 in the stack.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Vault + store paths
# ---------------------------------------------------------------------------

_DEFAULT_VAULT = Path(
    os.environ.get(
        "VAULT_DIR",
        os.environ.get(
            "HERMES_VAULT_PATH",
            os.path.expanduser("~/Documents/Obsidian/Vault"),
        ),
    )
)

# SQLite brain store (holographic layer).  Override with BRAIN_DB env var.
_DEFAULT_BRAIN_DB = Path(
    os.environ.get("BRAIN_DB", str(Path.home() / ".agent-home" / "brain.db"))
)

# Qdrant vector index settings — same defaults as scripts/index-vault.py
_QDRANT_URL = os.environ.get("QDRANT_URL", "http://127.0.0.1:6533").rstrip("/")
_QDRANT_COLLECTION = "agent_home_vault"
_GEMINI_EMBED_MODEL = os.environ.get("EMBED_MODEL", "gemini-embedding-001")
_EMBED_DIM = 768

# Brain retrieval mode — gates which similarity lanes feed BrainResult.similar.
# Env (HERMES_BRAIN_MODE) is the runtime source of truth; hermes/config.yaml's
# brain.mode is the declarative default exported into this env at boot. Validated
# at the boundary: an unset or unrecognized value falls back to "obsidian" so a
# bad config can never break retrieval. BrainFact/BrainResult signatures are
# unchanged — only lane selection changes.
_VALID_BRAIN_MODES = ("obsidian", "cognee", "unified")

# Cognee graph-recall service — a derived, rebuildable, fail-open REST index over
# the read-only vault. Never the source of truth. The live transport (login +
# bearer + /api/v1 paths) lives in agent.cognee_client; COGNEE_URL + creds are
# configured there. The dataset cognified from the vault (override COGNEE_DATASET).
_COGNEE_DATASET = os.environ.get("COGNEE_DATASET", "vault")

# Namespace → vault-relative directory for append writes
_NAMESPACE_DIRS: Dict[str, str] = {
    "reasoningbank":   "20_Areas/agent-os/brain/reasoningbank",
    "preference-spine": "20_Areas/agent-os/brain/preference-spine",
}


# ---------------------------------------------------------------------------
# Public dataclasses (frozen — do not change signatures)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class BrainFact:
    content: str
    score: float
    provenance: str               # "vault" | "web" | "derived" | "unverified"
    created_at: Optional[str] = None
    source: Optional[str] = None  # e.g. a vault note path
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BrainResult:
    """Fused retrieval result. ``similar`` = similarity hits; ``temporal`` =
    the dated time-walk ("what changed / what was decided, in order")."""
    similar: List[BrainFact] = field(default_factory=list)
    temporal: List[BrainFact] = field(default_factory=list)
    strategies: List[BrainFact] = field(default_factory=list)   # ReasoningBank
    preferences: List[BrainFact] = field(default_factory=list)  # Preference Spine
    as_of: Optional[str] = None


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _brain_mode() -> str:
    """Resolve the active retrieval mode from ``HERMES_BRAIN_MODE``.

    Fail-safe boundary validation: returns ``"obsidian"`` when the env var is
    unset or holds a value outside ``_VALID_BRAIN_MODES`` (case/whitespace
    insensitive), so a garbage value can never break retrieval.
    """
    mode = (os.environ.get("HERMES_BRAIN_MODE") or "obsidian").strip().lower()
    return mode if mode in _VALID_BRAIN_MODES else "obsidian"


def _merge_dedupe(facts: List[BrainFact], k: int) -> List[BrainFact]:
    """Merge two similarity lanes, deduplicate by content, return top-k."""
    seen: set[str] = set()
    merged: List[BrainFact] = []
    # Sort descending by score before dedup so higher-scored copy wins
    for fact in sorted(facts, key=lambda f: f.score, reverse=True):
        key = fact.content.strip()[:200]
        if key in seen:
            continue
        seen.add(key)
        merged.append(fact)
        if len(merged) >= k:
            break
    return merged


def _gemini_embed(text: str) -> Optional[List[float]]:
    """Embed ``text`` via Gemini REST.  Returns None on any failure.

    Mirrors the logic in ``scripts/index-vault.py`` so the query embedding
    is consistent with the indexed embeddings.
    """
    import urllib.request
    import urllib.error

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return None

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{_GEMINI_EMBED_MODEL}:embedContent?key={api_key}"
    )
    body = {
        "model": f"models/{_GEMINI_EMBED_MODEL}",
        "content": {"parts": [{"text": text[:8000]}]},
        "outputDimensionality": _EMBED_DIM,
    }
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())["embedding"]["values"]
    except Exception as exc:
        logger.debug("Brain: Gemini embed failed (non-fatal): %s", exc)
        return None


def _qdrant_search(vector: List[float], k: int) -> List[Dict[str, Any]]:
    """POST a similarity search to Qdrant.  Returns [] on any failure."""
    import urllib.request
    import urllib.error

    url = f"{_QDRANT_URL}/collections/{_QDRANT_COLLECTION}/points/search"
    body = {"vector": vector, "limit": k, "with_payload": True}
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            return result.get("result", [])
    except Exception as exc:
        logger.debug("Brain: Qdrant search failed (non-fatal): %s", exc)
        return []


def _cognee_recall(query: str, k: int) -> List[Dict[str, Any]]:
    """POST a recall query to the live Cognee API. Returns [] on any failure.

    Mirrors ``_qdrant_search``'s fail-open shape exactly: Cognee is a derived,
    rebuildable recall lane over the read-only vault — service down, unreachable,
    not-yet-ingested, un-authenticated, or malformed all degrade to ``[]`` and
    never raise, so a turn is never blocked. Transport (login + bearer + the
    ``/api/v1`` base) is the shared ``agent.cognee_client``; no SDK dependency.

    Uses ``POST /api/v1/recall`` scoped to the vault dataset by NAME (recall
    accepts ``datasets`` directly, so no dataset-id resolution is needed here).
    The response is a JSON array; elements may be dicts (entity hits) or strings
    (GRAPH_COMPLETION answers) — both are normalised to ``{"text": ...}`` dicts
    so ``_similar_via_cognee`` can map them.
    """
    try:
        from agent import cognee_client  # shared fail-open client
    except Exception:  # pragma: no cover - layout fallback (mirrors brain_timewalk)
        try:
            import cognee_client  # type: ignore[no-redef]
        except Exception:
            return []

    result = cognee_client.request(
        "POST",
        "/recall",
        json_body={
            "query": query,
            "searchType": "GRAPH_COMPLETION",
            "datasets": [_COGNEE_DATASET],
            "topK": k,
        },
    )
    if result is None:
        return []

    # The recall response is a JSON array; tolerate an enveloped dict too.
    if isinstance(result, dict):
        hits = result.get("results") or result.get("data") or result.get("hits") or []
    else:
        hits = result
    if not isinstance(hits, list):
        return []

    # Normalise bare-string completions to dicts so the lane can map them.
    return [{"text": h} if isinstance(h, str) else h for h in hits]


# ---------------------------------------------------------------------------
# Brain
# ---------------------------------------------------------------------------

class Brain:
    """The single L0 retrieve/append interface. One instance per process."""

    def __init__(
        self,
        vault_dir: Optional[Path] = None,
        brain_db: Optional[Path] = None,
    ) -> None:
        self._vault_dir: Path = vault_dir or _DEFAULT_VAULT
        self._brain_db: Path = brain_db or _DEFAULT_BRAIN_DB
        # Lazy-init holographic retriever — created on first use
        self.__retriever = None

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _retriever(self):
        """Lazily construct the holographic FactRetriever."""
        if self.__retriever is not None:
            return self.__retriever

        import importlib
        import sys as _sys

        # engine/ root (absolute) must be on sys.path so that
        # "plugins.memory.holographic.*" resolves correctly.
        _engine_root = str(Path(__file__).resolve().parent.parent)
        _injected = _engine_root not in _sys.path
        if _injected:
            _sys.path.insert(0, _engine_root)

        MemoryStore = None
        FactRetriever = None
        try:
            _store = importlib.import_module("plugins.memory.holographic.store")
            _retrieval = importlib.import_module("plugins.memory.holographic.retrieval")
            MemoryStore = _store.MemoryStore
            FactRetriever = _retrieval.FactRetriever
        except ImportError as exc:
            logger.debug(
                "Brain: holographic module not importable (non-fatal): %s", exc
            )

        if MemoryStore is None or FactRetriever is None:
            return None

        try:
            self._brain_db.parent.mkdir(parents=True, exist_ok=True)
            store = MemoryStore(str(self._brain_db))
            self.__retriever = FactRetriever(
                store,
                temporal_decay_half_life=30,  # 30-day half-life for recency bias
            )
        except Exception as exc:
            logger.debug("Brain: FactRetriever init failed (non-fatal): %s", exc)
            return None

        return self.__retriever

    def _similar_via_holographic(
        self,
        query: str,
        *,
        k: int,
        min_trust: float,
    ) -> List[BrainFact]:
        """FTS5 + Jaccard + HRR similarity lane via FactRetriever."""
        retriever = self._retriever()
        if retriever is None:
            return []

        try:
            raw = retriever.search(query, min_trust=min_trust, limit=k)
        except Exception as exc:
            logger.debug("Brain: holographic search failed (non-fatal): %s", exc)
            raw = []

        # Optional compositional recall for multi-word queries
        if len(query.split()) >= 3:
            try:
                terms = query.split()[:3]
                composed = retriever.reason(terms, limit=max(k // 2, 3))
                # Merge without duplicating content already in raw
                raw_contents = {f["content"] for f in raw}
                raw += [f for f in composed if f["content"] not in raw_contents]
            except Exception as exc:
                logger.debug("Brain: holographic reason failed (non-fatal): %s", exc)

        return [
            BrainFact(
                content=fact["content"],
                score=float(fact.get("score", 0.0)),
                provenance="vault",
                source=fact.get("category"),
                created_at=fact.get("created_at") or fact.get("updated_at"),
                metadata={
                    "tags": fact.get("tags", ""),
                    "trust_score": fact.get("trust_score", 0.5),
                    "retrieval_count": fact.get("retrieval_count", 0),
                },
            )
            for fact in raw[:k]
        ]

    def _similar_via_qdrant(self, query: str, *, k: int) -> List[BrainFact]:
        """Gemini embed → Qdrant vector similarity lane."""
        vector = _gemini_embed(query)
        if vector is None:
            return []

        hits = _qdrant_search(vector, k)
        return [
            BrainFact(
                content=hit.get("payload", {}).get("preview", ""),
                score=float(hit.get("score", 0.0)),
                provenance="vault",
                source=hit.get("payload", {}).get("path"),
                metadata={"qdrant_id": hit.get("id")},
            )
            for hit in hits
            if hit.get("payload", {}).get("preview")
        ]

    def _similar_via_cognee(self, query: str, *, k: int) -> List[BrainFact]:
        """Cognee graph ``recall`` similarity lane. Returns [] on any failure.

        Cognee is a derived index built FROM the read-only vault, so hits stay
        ``provenance="vault"``. Fail-open like ``_similar_via_qdrant``: a down,
        unreachable, or un-ingested Cognee yields ``[]`` and never blocks a turn.
        """
        hits = _cognee_recall(query, k)
        return [
            BrainFact(
                content=hit.get("text") or hit.get("description") or "",
                score=float(hit.get("score", 0.0) or 0.0),
                provenance="vault",
                source=hit.get("source_path") or hit.get("entity"),
                metadata={
                    "cognee_entity": hit.get("entity"),
                    "relations": hit.get("relations", []),
                },
            )
            for hit in hits
            if isinstance(hit, dict) and (hit.get("text") or hit.get("description"))
        ]

    def _timewalk_to_facts(
        self, query: str, *, as_of: Optional[str], k: int
    ) -> List[BrainFact]:
        """Walk dated PARA notes up to ``as_of`` and return as BrainFacts.

        The time-walk answers "what happened, in order" rather than "what looks
        like this?" — it is a chronological lane, not a similarity lane.
        Query is unused for ordering (temporal order is the rank) but is kept
        in the signature for future keyword pre-filtering.
        """
        try:
            from engine.agent.brain_timewalk import walk_dated_notes
        except ImportError:
            try:
                from brain_timewalk import walk_dated_notes  # type: ignore[no-redef]
            except ImportError:
                logger.debug("Brain: brain_timewalk not importable; temporal lane disabled")
                return []

        try:
            entries = walk_dated_notes(
                as_of=as_of,
                vault_dir=self._vault_dir,
                limit=k,
            )
        except Exception as exc:
            logger.debug("Brain: time-walk failed (non-fatal): %s", exc)
            return []

        return [
            BrainFact(
                content=snippet or f"[note: {path_str}]",
                score=1.0,  # temporal lane ranks by recency, not relevance score
                provenance="vault",
                source=path_str,
                created_at=date_str,
            )
            for date_str, path_str, snippet in entries
        ]

    def _read_namespace(self, namespace: str, *, k: int) -> List[BrainFact]:
        """Read the top-k most-recent records from a Brain namespace directory.

        For cold-start (no embeddings yet), recency is the ranking signal:
        the most recently written strategy / preference is most relevant.
        """
        ns_rel = _NAMESPACE_DIRS.get(namespace)
        if ns_rel is None:
            # Unknown namespace — try treating it as a vault-relative path
            ns_rel = namespace

        ns_dir = self._vault_dir / ns_rel
        if not ns_dir.exists():
            return []

        try:
            md_files = sorted(
                ns_dir.glob("*.md"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,  # most recent first
            )
        except OSError as exc:
            logger.debug("Brain: namespace read failed (non-fatal): %s", exc)
            return []

        facts: List[BrainFact] = []
        for path in md_files[:k]:
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue

            # Strip frontmatter from content
            body = text
            if text.startswith("---"):
                end = text.find("\n---", 3)
                if end != -1:
                    body = text[end + 4:].lstrip()

            # Extract created date from frontmatter for metadata
            import re
            fm_date_m = re.search(
                r"^created:\s*['\"]?(\d{4}-\d{2}-\d{2})['\"]?",
                text[:1000],
                re.MULTILINE,
            )
            created_at = fm_date_m.group(1) if fm_date_m else None

            facts.append(
                BrainFact(
                    content=body.strip(),
                    score=1.0,
                    provenance="derived",
                    source=str(path.relative_to(self._vault_dir)),
                    created_at=created_at,
                )
            )

        return facts

    # ------------------------------------------------------------------
    # Public contract — do NOT change these signatures
    # ------------------------------------------------------------------

    def retrieve(
        self,
        query: str,
        *,
        as_of: Optional[str] = None,   # ISO date; None = now (enables the time-walk)
        k: int = 10,
        min_trust: float = 0.3,
        namespaces: Optional[List[str]] = None,
    ) -> BrainResult:
        """Fused temporal + similarity + strategy + preference retrieval.

        Four lanes run independently and degrade gracefully:

        1. ``similar`` — holographic FTS5+Jaccard+HRR (FactRetriever.search +
           optional FactRetriever.reason for multi-word queries) fused with
           Qdrant vector similarity; deduped and ranked by score.
        2. ``temporal`` — dated PARA note time-walk up to ``as_of``; answers
           "what changed / what was decided, in order."
        3. ``strategies`` — ReasoningBank namespace; distilled what-worked /
           what-failed strategy memory, injected before each task.
        4. ``preferences`` — Preference-Spine namespace; learned user taste from
           kept-vs-rewrote edit signals.

        All retrieved context MUST be injected as USER messages by the caller —
        never into the system prompt (cache discipline §5.4).
        """
        # Lane 1: similarity — gated by brain mode, fused through the existing
        # _merge_dedupe. obsidian (default) = holographic + Qdrant, byte-for-byte
        # as before; cognee = Cognee lane only; unified = all three fused.
        mode = _brain_mode()
        similar_parts: List[BrainFact] = []
        if mode in ("obsidian", "unified"):
            similar_parts += self._similar_via_holographic(
                query, k=k, min_trust=min_trust
            )
            similar_parts += self._similar_via_qdrant(query, k=k)
        if mode in ("cognee", "unified"):
            similar_parts += self._similar_via_cognee(query, k=k)
        similar = _merge_dedupe(similar_parts, k=k)

        # Lane 2: temporal time-walk
        temporal = self._timewalk_to_facts(query, as_of=as_of, k=k)

        # Lane 3: strategy (ReasoningBank)
        strategies = self._read_namespace("reasoningbank", k=k)

        # Lane 4: preference (Preference-Spine)
        preferences = self._read_namespace("preference-spine", k=k)

        return BrainResult(
            similar=similar,
            temporal=temporal,
            strategies=strategies,
            preferences=preferences,
            as_of=as_of,
        )

    def append(
        self,
        namespace: str,                # e.g. "reasoningbank" | "preference-spine" | "10_Projects/<x>"
        content: str,
        *,
        provenance: str = "derived",   # vault|web|derived|unverified
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Append-only write to the vault brain; returns a record id.

        Writes a new ``YYYY-MM-DD-<id8>.md`` file inside the namespace
        directory.  Never mutates an existing file.

        Namespace routing
        -----------------
        - ``"reasoningbank"``    → ``20_Areas/agent-os/brain/reasoningbank/``
        - ``"preference-spine"`` → ``20_Areas/agent-os/brain/preference-spine/``
        - anything else          → treated as a vault-relative path

        Callers that touch learned memory (ReasoningBank, Preference Spine)
        MUST pass ``TrustGate.gate`` **before** calling this method.
        Brain is L0 — it does not call the gate itself.
        """
        record_id = str(uuid.uuid4())
        today = date.today().isoformat()

        ns_rel = _NAMESPACE_DIRS.get(namespace, namespace)
        ns_dir = self._vault_dir / ns_rel

        try:
            ns_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise RuntimeError(
                f"Brain.append: cannot create namespace dir {ns_dir}: {exc}"
            ) from exc

        filename = f"{today}-{record_id[:8]}.md"
        target = ns_dir / filename

        # Build Obsidian-compatible frontmatter
        meta_lines = ""
        if metadata:
            for k_m, v_m in metadata.items():
                meta_lines += f"{k_m}: {v_m}\n"

        note_text = (
            f"---\n"
            f"title: Brain record {record_id[:8]}\n"
            f"created: {today}\n"
            f"modified: {today}\n"
            f"tags: [brain, {namespace.replace('/', '-')}]\n"
            f"provenance: {provenance}\n"
            f"record_id: {record_id}\n"
            f"{meta_lines}"
            f"---\n\n"
            f"{content}\n"
        )

        try:
            target.write_text(note_text, encoding="utf-8")
        except OSError as exc:
            raise RuntimeError(
                f"Brain.append: write failed for {target}: {exc}"
            ) from exc

        logger.debug(
            "Brain.append: wrote %s (namespace=%s, provenance=%s)",
            target,
            namespace,
            provenance,
        )
        return record_id
