"""L1 Trust Substrate — the immune system every higher layer trusts.

This package implements the spine the TrustGate wraps (architecture §4.2):

  - ``charter``      — the immutable, write-once goal charter (§6.2).
  - ``ledger``       — the append-only Evolution Ledger: git-per-change +
                       auto-rollback (§4.2 / §5.5).
  - ``eval_harness`` — the golden eval suite runner; before/after deltas.
  - ``compass``      — long-horizon drift monitor scored against the charter.
  - ``conclave``     — adversarial Prosecutor/Defender + judge consensus
                       required before irreversible acts (§6.1). Fail-SAFE.

Nothing in L2–L5 is permitted to act without an L1 verdict; ``TrustGate.gate``
(``engine/agent/trust_gate.py``) is the single orchestration surface that
threads these modules together.

Each module degrades gracefully (fail-SAFE) rather than crashing the gate:
operational state lives under ``get_hermes_home()/trust`` so tests stay
hermetic. The vault mirror at ``20_Areas/agent-os/trust/`` is an optional,
config-driven extra and is deferred.
"""
from __future__ import annotations

import importlib
from typing import TYPE_CHECKING

__all__ = ["charter", "compass", "conclave", "eval_harness", "ledger"]

if TYPE_CHECKING:  # pragma: no cover - import hints for type checkers only
    from . import charter, compass, conclave, eval_harness, ledger


def __getattr__(name: str):
    """Lazily import submodules on first access.

    Avoids an eager import chain at package load (so one module's heavy or
    optional dependency can't break ``import agent.trust`` wholesale), and
    keeps import order decoupled.
    """
    if name in __all__:
        module = importlib.import_module(f"{__name__}.{name}")
        globals()[name] = module
        return module
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
