"""TrustGate — the L1 contract that gates every autonomous act.

CONTRACT (Phase 0). Interface + stubs only. Worker W-D implements the body by
wrapping the primitives that already exist:
  - ``engine/cron/scheduler.py`` ``_resolve_cron_permission_mode`` / ``_FULL_AUTONOMY_TIERS``
    (autonomy tier → claude permission mode)
  - ``engine/agent/curator_backup.py`` ``snapshot_skills`` (tar.gz reversibility proof)
  - ``engine/tools/tirith_security.py`` (pre-exec command scan; exit 0/1/2 = allow/block/warn)
  - ``engine/hermes_cli/goals.py`` ``judge_goal`` (LLM-as-judge done/continue) — basis of Conclave
W-D also builds the eval harness, the append-only Evolution Ledger (git-per-change
+ auto-rollback), the immutable goal charter, and the Compass drift monitor.

Every L0 write that touches learned memory, and every irreversible action, MUST
pass ``gate`` first. Irreversible actions additionally require Conclave consensus
regardless of tier (§6.1).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

Verdict = Literal["allow", "block", "warn"]
AutonomyTier = Literal["content", "full", "guarded"]


@dataclass(frozen=True)
class Change:
    kind: Literal["file_edit", "bash", "git", "cron", "skill", "memory", "send", "deploy"]
    details: Dict[str, Any] = field(default_factory=dict)
    irreversible: bool = False     # deploy/publish/force-push/delete → always Conclave


@dataclass(frozen=True)
class Reversibility:
    has_snapshot: bool = False
    snapshot_path: Optional[str] = None
    rollback_token: Optional[str] = None


@dataclass(frozen=True)
class GateResult:
    verdict: Verdict
    reason: str
    require_approval: bool = False
    findings: List[Dict[str, Any]] = field(default_factory=list)   # tirith findings
    reversibility_ok: bool = True
    ledger_ref: Optional[str] = None                               # Evolution-Ledger entry id


class TrustGate:
    """The single L1 gate. Wraps tier resolution + Tirith + reversibility +
    (for irreversible acts) Conclave consensus."""

    def gate(
        self,
        change: Change,
        *,
        targets: Optional[List[str]] = None,        # files/dirs the change will touch
        autonomy_tier: AutonomyTier = "guarded",
        reversibility: Optional[Reversibility] = None,
    ) -> GateResult:
        """Pre-exec trust verdict. Fail-safe to ``guarded``/``warn`` on ambiguity.

        W-D: resolve the tier, run Tirith on command changes, verify a snapshot
        exists for mutating changes, require Conclave for ``change.irreversible``,
        and write an Evolution-Ledger entry with a rollback token.
        """
        raise NotImplementedError("W-D: implement TrustGate.gate")
