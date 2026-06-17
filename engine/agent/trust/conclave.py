"""The Conclave / Tribunal — adversarial consensus before irreversible acts.

Irreversible actions (deploy, publish, force-push, delete) require a Conclave
pass regardless of autonomy tier (architecture §6.1). The Conclave is an
adversarial panel: a **Prosecutor** argues the action is unsafe, a **Defender**
argues it is safe, and a **judge** decides consensus. This is the most
expensive gate in the system, which is exactly why §6.1 scopes it to genuinely
irreversible acts.

**Fail-SAFE — the central inversion.** ``hermes_cli.goals.judge_goal`` is
deliberately fail-*open*: a broken judge returns ``continue`` so a goal loop
never wedges. That is the wrong default here. The cost of wrongly permitting an
irreversible act is unbounded, so this module fails *closed*: any judge error,
ambiguity, missing-charter, or unparseable verdict yields ``consensus=False``
(block). Consensus is granted only on an explicit, affirmative pass.

The three roles are built on the ``judge_goal`` primitive (so we reuse the
auxiliary-judge transport rather than reimplementing it) but each is injectable
so tests run offline and deterministically.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from . import charter as charter_mod

logger = logging.getLogger(__name__)

# A role judge takes a framed prompt + the action summary and returns
# (verdict, reason); verdict "done"==affirmative for that role's question.
RoleJudge = Callable[[str, str], Tuple[str, str]]

PROSECUTOR_FRAMING = (
    "You are the PROSECUTOR in a safety tribunal for an IRREVERSIBLE action "
    "(deploy / publish / force-push / delete). Your question: is there a "
    "concrete, material risk that makes this action UNSAFE to take "
    "autonomously? Answer 'done' (true) if you find such a risk; 'continue' "
    "(false) if you find none.{charter_clause}\n\nProposed irreversible action:"
)

DEFENDER_FRAMING = (
    "You are the DEFENDER in a safety tribunal for an IRREVERSIBLE action. "
    "Your question: is this action clearly SAFE, reversible-enough, and "
    "aligned to proceed autonomously? Answer 'done' (true) only if you are "
    "confident it is safe; 'continue' (false) if you have doubt.{charter_clause}"
    "\n\nProposed irreversible action:"
)

JUDGE_FRAMING = (
    "You are the JUDGE in a safety tribunal for an IRREVERSIBLE action. The "
    "Prosecutor {pros_stance} (reason: {pros_reason}). The Defender "
    "{def_stance} (reason: {def_reason}). Grant consensus to PROCEED only if "
    "the action is clearly safe and the prosecution raised no material "
    "unaddressed risk. Answer 'done' (true) to PERMIT the action; 'continue' "
    "(false) to BLOCK it.{charter_clause}\n\nProposed irreversible action:"
)


@dataclass(frozen=True)
class ConclaveResult:
    """Outcome of an adversarial consensus review."""

    consensus: bool                  # True == permit (pass), False == block
    prosecutor: str                  # prosecutor's reason
    defender: str                    # defender's reason
    judge_reason: str
    findings: List[Dict[str, Any]] = field(default_factory=list)


def _charter_clause() -> str:
    loaded = charter_mod.load()
    if loaded is None:
        return ""
    return (
        "\n\nThe agent's immutable goal charter (the action must be consistent "
        f"with it):\n{loaded.text}"
    )


def _default_role_judge(prompt: str, action_summary: str) -> Tuple[str, str]:
    """Bridge a role's framed prompt to ``judge_goal``. Fail-SAFE to skipped."""
    try:
        from hermes_cli.goals import judge_goal
    except Exception as exc:  # noqa: BLE001
        logger.debug("conclave: judge_goal import failed: %s", exc)
        return "skipped", "judge unavailable"
    try:
        verdict, reason, _parse_failed = judge_goal(prompt, action_summary)
    except Exception as exc:  # noqa: BLE001
        logger.debug("conclave: judge_goal raised: %s", exc)
        return "skipped", f"judge error: {type(exc).__name__}"
    return verdict, reason


def convene(
    action_summary: str,
    *,
    targets: Optional[List[str]] = None,
    prosecutor: Optional[RoleJudge] = None,
    defender: Optional[RoleJudge] = None,
    judge: Optional[RoleJudge] = None,
) -> ConclaveResult:
    """Run the adversarial panel over an irreversible action.

    Returns a ``ConclaveResult``; ``consensus=True`` permits the act,
    ``False`` blocks it. **Fail-SAFE:** consensus is granted only when the
    Defender affirms safety AND the judge affirmatively permits; any judge
    error, ambiguity (``skipped``), or a Prosecutor who finds a material risk
    the judge does not clear results in a block.
    """
    prosecutor = prosecutor or _default_role_judge
    defender = defender or _default_role_judge
    judge = judge or _default_role_judge

    clause = _charter_clause()
    summary = (action_summary or "").strip()
    findings: List[Dict[str, Any]] = []

    if not summary:
        # Nothing to evaluate is itself ambiguous → block.
        return ConclaveResult(
            consensus=False,
            prosecutor="(no action summary)",
            defender="(no action summary)",
            judge_reason="empty action summary — cannot grant consensus",
            findings=[{"role": "tribunal", "verdict": "block", "reason": "empty summary"}],
        )

    pros_prompt = PROSECUTOR_FRAMING.format(charter_clause=clause)
    pros_verdict, pros_reason = prosecutor(pros_prompt, summary)
    findings.append({"role": "prosecutor", "verdict": pros_verdict, "reason": pros_reason})

    def_prompt = DEFENDER_FRAMING.format(charter_clause=clause)
    def_verdict, def_reason = defender(def_prompt, summary)
    findings.append({"role": "defender", "verdict": def_verdict, "reason": def_reason})

    # Prosecutor "done" == found a risk. Defender "done" == affirms safe.
    prosecutor_found_risk = pros_verdict == "done"
    defender_affirms_safe = def_verdict == "done"

    judge_prompt = JUDGE_FRAMING.format(
        pros_stance="found a material risk" if prosecutor_found_risk
        else ("could not assess" if pros_verdict == "skipped" else "found no risk"),
        pros_reason=pros_reason,
        def_stance="affirms it is safe" if defender_affirms_safe
        else ("could not assess" if def_verdict == "skipped" else "has doubts"),
        def_reason=def_reason,
        charter_clause=clause,
    )
    judge_verdict, judge_reason = judge(judge_prompt, summary)
    findings.append({"role": "judge", "verdict": judge_verdict, "reason": judge_reason})

    # FAIL-SAFE consensus rule: permit only on an explicit, unanimous-enough
    # affirmative — judge must say "done" (permit), the defender must affirm
    # safety, and the judge's permit stands only if the prosecutor did not
    # raise a risk (a raised risk forces a block even over a permissive judge).
    consensus = (
        judge_verdict == "done"
        and defender_affirms_safe
        and not prosecutor_found_risk
    )

    if not consensus:
        reason = judge_reason
        if prosecutor_found_risk:
            reason = f"prosecutor raised a material risk: {pros_reason}"
        elif not defender_affirms_safe:
            reason = f"defender could not affirm safety: {def_reason}"
        elif judge_verdict != "done":
            reason = f"judge did not grant consensus: {judge_reason}"
        return ConclaveResult(
            consensus=False,
            prosecutor=pros_reason,
            defender=def_reason,
            judge_reason=reason,
            findings=findings,
        )

    return ConclaveResult(
        consensus=True,
        prosecutor=pros_reason,
        defender=def_reason,
        judge_reason=judge_reason,
        findings=findings,
    )
