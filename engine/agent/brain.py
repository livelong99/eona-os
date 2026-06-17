"""Brain — the L0 shared-memory contract (retrieve + append over the one vault).

CONTRACT (Phase 0). Interface + stubs only. Worker W-C implements the body:
fuse Qdrant similarity (``scripts/index-vault.py``) with the holographic
``FactRetriever`` (``engine/plugins/memory/holographic/retrieval.py``: FTS5 +
Jaccard + HRR + temporal decay) AND a dated-note **time-walk** over the PARA
vault, and back ``append`` with the ReasoningBank / Preference-Spine stores.

Consumers (do not change these signatures without coordinating): the Chronicle
(L3), the Agent-Tools Platform one-brain wiring (§8.2), and the Evolution Engine
(L5). All retrieved context is injected as USER messages by the caller, never
into the system prompt (cache discipline, §5.4).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


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


class Brain:
    """The single L0 retrieve/append interface. One instance per process."""

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

        W-C: wrap ``FactRetriever.search`` (+ optional ``probe``/``reason``) for
        ``similar``; walk dated PARA notes up to ``as_of`` for ``temporal``;
        read ReasoningBank / Preference-Spine namespaces for the rest.
        """
        raise NotImplementedError("W-C: implement Brain.retrieve")

    def append(
        self,
        namespace: str,                # e.g. "reasoningbank" | "preference-spine" | "10_Projects/<x>"
        content: str,
        *,
        provenance: str = "derived",   # vault|web|derived|unverified
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Append-only write to the vault brain; returns a record id.

        W-C: append a dated record (never mutate in place); the caller routes
        learned-memory writes through ``TrustGate.gate`` first (see trust_gate.py).
        """
        raise NotImplementedError("W-C: implement Brain.append")
