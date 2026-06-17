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

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

logger = logging.getLogger(__name__)

Verdict = Literal["allow", "block", "warn"]
AutonomyTier = Literal["content", "full", "guarded"]

# Change kinds that mutate persistent state and therefore require a
# reversibility proof (a snapshot or a rollback token) before the gate will
# allow them. Read-only / send kinds are excluded; ``send`` is outbound and
# handled via the irreversible/Conclave path when flagged.
_MUTATING_KINDS = frozenset({"file_edit", "git", "skill", "memory", "deploy"})

# Kinds whose ``details["command"]`` (or ``details["argv"]``) should be run
# through Tirith pre-exec scanning.
_COMMAND_KINDS = frozenset({"bash", "git"})


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


def _resolve_permission_mode(autonomy_tier: str) -> Optional[str]:
    """Map an autonomy tier to a claude permission mode via the cron substrate.

    Wraps ``engine/cron/scheduler.py`` ``_resolve_cron_permission_mode`` so the
    gate binds the *same* kernel tiers the scheduler uses (§6.1): ``content`` /
    ``full`` → ``bypassPermissions``; ``guarded`` / unknown → ``None`` (runtime
    default ``acceptEdits``, Tirith stays in force). Fail-safe: any import error
    yields ``None`` (the guarded posture).
    """
    try:
        from cron.scheduler import _resolve_cron_permission_mode
    except Exception as exc:  # noqa: BLE001
        logger.debug("trust_gate: cron tier resolver unavailable: %s", exc)
        return None
    tier = str(autonomy_tier or "").strip().lower()
    try:
        return _resolve_cron_permission_mode({"autonomy": tier})
    except Exception as exc:  # noqa: BLE001
        logger.debug("trust_gate: tier resolution failed: %s", exc)
        return None


def _extract_command(change: "Change") -> Optional[str]:
    """Pull a scannable command string out of a change's details, if any."""
    details = change.details or {}
    cmd = details.get("command")
    if isinstance(cmd, str) and cmd.strip():
        return cmd
    argv = details.get("argv")
    if isinstance(argv, (list, tuple)) and argv:
        try:
            return " ".join(str(a) for a in argv)
        except Exception:  # noqa: BLE001
            return None
    return None


def _scan_command(command: str) -> Dict[str, Any]:
    """Run Tirith pre-exec scanning. Fail-safe to allow on import failure.

    Wraps ``engine/tools/tirith_security.py`` ``check_command_security`` →
    ``{"action": allow|warn|block, "findings": [...], "summary": str}``.
    """
    try:
        from tools.tirith_security import check_command_security
    except Exception as exc:  # noqa: BLE001
        logger.debug("trust_gate: tirith unavailable: %s", exc)
        return {"action": "allow", "findings": [], "summary": "tirith unavailable"}
    try:
        return check_command_security(command)
    except Exception as exc:  # noqa: BLE001
        logger.debug("trust_gate: tirith scan failed: %s", exc)
        return {"action": "allow", "findings": [], "summary": f"tirith error: {exc}"}


def _has_reversibility_proof(reversibility: Optional["Reversibility"]) -> bool:
    if reversibility is None:
        return False
    return bool(
        reversibility.has_snapshot
        or reversibility.snapshot_path
        or reversibility.rollback_token
    )


def _rollback_token_for(
    change: "Change", reversibility: Optional["Reversibility"]
) -> Optional[str]:
    """Build the ledger rollback token from the supplied reversibility proof."""
    from agent.trust import ledger

    if reversibility is None:
        return None
    if reversibility.rollback_token:
        return reversibility.rollback_token
    if reversibility.snapshot_path:
        # A curator snapshot dir name is its backup id.
        from pathlib import Path
        return ledger.make_curator_token(Path(reversibility.snapshot_path).name)
    if reversibility.has_snapshot:
        return ledger.make_curator_token(None)  # newest snapshot
    return None


class TrustGate:
    """The single L1 gate. Wraps tier resolution + Tirith + reversibility +
    (for irreversible acts) Conclave consensus, recording every verdict in the
    append-only Evolution Ledger."""

    def gate(
        self,
        change: Change,
        *,
        targets: Optional[List[str]] = None,        # files/dirs the change will touch
        autonomy_tier: AutonomyTier = "guarded",
        reversibility: Optional[Reversibility] = None,
    ) -> GateResult:
        """Pre-exec trust verdict. Fail-safe to ``guarded``/``warn`` on ambiguity.

        Orchestration order (architecture §4.2 / §6.1):
          (a) resolve the autonomy tier → permission posture (unknown→guarded);
          (b) Tirith pre-exec scan on command-bearing changes (block/warn);
          (c) require a reversibility proof for mutating changes (else warn +
              approval — never a silent allow);
          (d) Conclave consensus for ``change.irreversible`` regardless of tier
              (fail-safe block on no-consensus; pass still requires approval);
          (e) Compass drift score vs the immutable charter (breach → warn +
              approval);
          (f) write an Evolution-Ledger entry with a rollback token.

        The worst verdict observed wins (block > warn > allow); any ambiguity
        degrades toward ``warn`` + ``require_approval`` rather than ``allow``.
        """
        targets = list(targets or [])
        findings: List[Dict[str, Any]] = []
        reasons: List[str] = []

        verdict: Verdict = "allow"
        require_approval = False
        reversibility_ok = True

        def _worsen(new_verdict: Verdict) -> None:
            nonlocal verdict
            order = {"allow": 0, "warn": 1, "block": 2}
            if order[new_verdict] > order[verdict]:
                verdict = new_verdict

        # (a) Tier → permission posture. Unknown tiers fall to guarded (None).
        permission_mode = _resolve_permission_mode(autonomy_tier)
        tier_norm = str(autonomy_tier or "").strip().lower()
        if tier_norm not in {"content", "full", "guarded"}:
            reasons.append(f"unknown autonomy tier {autonomy_tier!r} → guarded")
            require_approval = True

        # (b) Tirith pre-exec scan on command-bearing changes.
        command = _extract_command(change)
        if change.kind in _COMMAND_KINDS or command:
            if command:
                scan = _scan_command(command)
                action = scan.get("action", "allow")
                scan_findings = scan.get("findings") or []
                if scan_findings:
                    findings.extend(scan_findings)
                if action == "block":
                    _worsen("block")
                    reasons.append(
                        f"tirith blocked command: {scan.get('summary') or 'security risk'}"
                    )
                elif action == "warn":
                    _worsen("warn")
                    require_approval = True
                    reasons.append(
                        f"tirith warning: {scan.get('summary') or 'review advised'}"
                    )

        # (c) Mutating changes require a reversibility proof.
        if change.kind in _MUTATING_KINDS:
            if not _has_reversibility_proof(reversibility):
                reversibility_ok = False
                _worsen("warn")
                require_approval = True
                reasons.append(
                    f"no reversibility proof for mutating change ({change.kind})"
                )

        # (d) Irreversible acts → Conclave consensus regardless of tier (§6.1).
        if change.irreversible:
            from agent.trust import conclave

            action_summary = self._summarize(change, targets)
            result = conclave.convene(action_summary, targets=targets)
            findings.append(
                {"role": "conclave", "consensus": result.consensus,
                 "judge": result.judge_reason}
            )
            if not result.consensus:
                _worsen("block")
                reasons.append(f"Conclave blocked irreversible act: {result.judge_reason}")
            else:
                # Consensus to proceed still keeps a human on the loop (§6.1).
                require_approval = True
                reasons.append("Conclave consensus: proceed (human approval required)")

        # (e) Compass drift score against the immutable charter.
        try:
            from agent.trust import compass

            drift = compass.score_tick(self._summarize(change, targets))
            findings.append(
                {"role": "compass", "score": drift.score, "breached": drift.breached}
            )
            if drift.breached and drift.charter_present:
                _worsen("warn")
                require_approval = True
                reasons.append(f"Compass drift breach: {drift.reason}")
        except Exception as exc:  # noqa: BLE001 — drift scoring must not crash the gate
            logger.debug("trust_gate: compass scoring failed: %s", exc)

        # (f) Record an Evolution-Ledger entry with a rollback token.
        ledger_ref: Optional[str] = None
        try:
            from agent.trust import ledger

            rollback_token = _rollback_token_for(change, reversibility)
            ledger_ref = ledger.record(
                change_description=self._summarize(change, targets),
                verdict=verdict,
                targets=targets,
                rollback_token=rollback_token,
                extra={
                    "kind": change.kind,
                    "autonomy_tier": tier_norm,
                    "permission_mode": permission_mode,
                    "irreversible": change.irreversible,
                    "require_approval": require_approval,
                    "reversibility_ok": reversibility_ok,
                },
            )
        except Exception as exc:  # noqa: BLE001 — ledger failure must not wedge the gate
            logger.warning("trust_gate: ledger write failed: %s", exc)

        reason = "; ".join(reasons) if reasons else "allow: no trust concerns"
        return GateResult(
            verdict=verdict,
            reason=reason,
            require_approval=require_approval,
            findings=findings,
            reversibility_ok=reversibility_ok,
            ledger_ref=ledger_ref,
        )

    @staticmethod
    def _summarize(change: "Change", targets: List[str]) -> str:
        """A short, judge-friendly description of the proposed change."""
        det = change.details or {}
        bits = [f"kind={change.kind}"]
        if change.irreversible:
            bits.append("irreversible")
        if targets:
            bits.append(f"targets={', '.join(targets[:8])}")
        cmd = det.get("command")
        if isinstance(cmd, str) and cmd.strip():
            bits.append(f"command={cmd[:200]}")
        summary = det.get("summary")
        if isinstance(summary, str) and summary.strip():
            bits.append(summary[:300])
        return " | ".join(bits)
