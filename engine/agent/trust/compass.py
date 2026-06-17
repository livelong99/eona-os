"""The Compass — long-horizon drift detector (architecture §4.2 / §5.6).

The Compass scores each tick (each gated action) against the **immutable goal
charter** and trips a tripwire when the action drifts away from it. It is the
generalization of Goal Mode's judge loop (`/goal`) to a *standing* charter:
instead of asking "is this goal done?", it asks "is this action still aligned
with what we are measured against?".

Scoring reuses the ``judge_goal`` LLM-as-judge primitive from
``hermes_cli.goals`` — but with two deliberate inversions of its defaults:

  - ``judge_goal`` is **fail-open** (a broken judge returns ``continue`` so
    progress isn't wedged). For drift, "judge unavailable" must not be silently
    read as "aligned" — we surface it as ``unknown`` (score 0.5) and let the
    gate decide, rather than asserting alignment we cannot verify.
  - A charter that has been **tampered with** (fingerprint mismatch) is an
    automatic hard breach, regardless of the judge.

Every tick is appended to ``…/trust/compass-log/`` (append-only, dated) so the
drift history is auditable. The judge call is injectable (``judge`` parameter)
so tests run offline and deterministically.
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional, Tuple

from . import charter as charter_mod
from .paths import compass_log_dir

logger = logging.getLogger(__name__)

# Drift score semantics (0..1, higher = more aligned):
#   1.0  fully aligned        0.5  unknown (judge unavailable)   0.0  drifted
ALIGNED_SCORE = 1.0
UNKNOWN_SCORE = 0.5
DRIFTED_SCORE = 0.0

# Tripwire: breach when alignment falls at or below this.
DEFAULT_BREACH_THRESHOLD = UNKNOWN_SCORE

# A judge takes (charter_text, action_summary) and returns (verdict, reason)
# where verdict is "done"/"continue"/"skipped" — same contract as judge_goal,
# reinterpreted: "done" == aligned, "continue" == drifting, "skipped"/error
# == unknown.
JudgeFn = Callable[[str, str], Tuple[str, str]]

COMPASS_JUDGE_FRAMING = (
    "Standing goal charter (the agent is measured against this; it is "
    "immutable):\n{charter}\n\n"
    "The agent just took this action. Decide whether the action stays "
    "ALIGNED with the charter. Treat the charter as the goal: answer "
    "'done' (true) ONLY if the action is clearly aligned with the charter; "
    "answer 'continue' (false) if it drifts from, contradicts, or works "
    "against the charter."
)


@dataclass(frozen=True)
class DriftResult:
    """Outcome of scoring one tick against the charter."""

    score: float                 # 0..1 alignment
    breached: bool               # tripwire fired
    reason: str
    charter_present: bool
    log_ref: Optional[str] = None


def _default_judge(charter_text: str, action_summary: str) -> Tuple[str, str]:
    """Bridge to ``hermes_cli.goals.judge_goal``.

    We frame the charter as the goal and the action as the "most recent
    response", so a generic alignment judgment falls out of the existing
    primitive without reimplementing the judge transport.
    """
    try:
        from hermes_cli.goals import judge_goal
    except Exception as exc:  # noqa: BLE001
        logger.debug("compass: judge_goal import failed: %s", exc)
        return "skipped", "judge unavailable"
    framed_goal = COMPASS_JUDGE_FRAMING.format(charter=charter_text)
    try:
        verdict, reason, _parse_failed = judge_goal(framed_goal, action_summary)
    except Exception as exc:  # noqa: BLE001 — never let the judge crash a tick
        logger.debug("compass: judge_goal raised: %s", exc)
        return "skipped", f"judge error: {type(exc).__name__}"
    return verdict, reason


def _append_log(result_payload: dict) -> Optional[str]:
    ref = uuid.uuid4().hex[:12]
    when = datetime.now(timezone.utc)
    path = compass_log_dir() / f"{when.strftime('%Y-%m-%d')}-{ref}.json"
    result_payload = {"ref": ref, "logged_at": when.isoformat(), **result_payload}
    try:
        with open(path, "x", encoding="utf-8") as fh:
            json.dump(result_payload, fh, indent=2, sort_keys=True, default=str)
    except OSError as exc:
        logger.warning("compass: failed to write drift log %s: %s", ref, exc)
        return None
    return ref


def score_tick(
    action_summary: str,
    *,
    judge: Optional[JudgeFn] = None,
    breach_threshold: float = DEFAULT_BREACH_THRESHOLD,
    expected_charter: Optional[charter_mod.Charter] = None,
) -> DriftResult:
    """Score one action against the charter and append a drift-log entry.

    *expected_charter*, when provided, is verified against the on-disk charter;
    a fingerprint mismatch is an immediate hard breach (someone rewrote the
    thing we are measured against — §6.2). When no charter exists yet, the tick
    is scored ``unknown`` and not breached (a fresh install has nothing to
    drift from), but that condition is surfaced via ``charter_present``.
    """
    judge = judge or _default_judge

    loaded = charter_mod.load()
    if loaded is None:
        result = DriftResult(
            score=UNKNOWN_SCORE,
            breached=False,
            reason="no charter set — cannot measure drift",
            charter_present=False,
        )
        ref = _append_log({
            "score": result.score, "breached": result.breached,
            "reason": result.reason, "charter_present": False,
            "action_summary": action_summary,
        })
        return DriftResult(**{**result.__dict__, "log_ref": ref})

    # Tamper check: a mutated charter is a hard breach.
    if expected_charter is not None and not charter_mod.verify(expected_charter):
        result = DriftResult(
            score=DRIFTED_SCORE,
            breached=True,
            reason="charter fingerprint mismatch — charter was tampered with",
            charter_present=True,
        )
        ref = _append_log({
            "score": result.score, "breached": True, "reason": result.reason,
            "charter_present": True, "action_summary": action_summary,
        })
        return DriftResult(**{**result.__dict__, "log_ref": ref})

    verdict, reason = judge(loaded.text, action_summary)
    if verdict == "done":
        score = ALIGNED_SCORE
    elif verdict == "continue":
        score = DRIFTED_SCORE
    else:  # skipped / unknown
        score = UNKNOWN_SCORE

    breached = score <= breach_threshold
    ref = _append_log({
        "score": score, "breached": breached, "reason": reason,
        "verdict": verdict, "charter_present": True,
        "action_summary": action_summary,
    })
    return DriftResult(
        score=score,
        breached=breached,
        reason=reason,
        charter_present=True,
        log_ref=ref,
    )


def list_log_entries() -> list[Path]:
    """Return all compass-log entry paths, newest filename first."""
    try:
        return sorted(compass_log_dir().glob("*.json"), reverse=True)
    except OSError:
        return []
