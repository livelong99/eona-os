"""The golden eval harness — measurement before autonomy (§4.2 / §5.1).

A self-modifying capability is only trustworthy if its effect can be measured.
This module runs a **golden eval suite** and reports a score, so the gate can
take a before/after delta around any change and trip an auto-rollback on
regression (§5.5: "the golden eval suite is run before/after to catch
regressions").

The suite is a directory of JSON cases under ``…/trust/golden/``. Each case is
``{"id", "weight"?, "check"}`` where ``check`` is one of a small, safe,
declarative vocabulary evaluated against a caller-supplied *context* dict:

  - ``{"kind": "always_pass"}``                      → always 1.0
  - ``{"kind": "context_truthy", "key": "<k>"}``     → 1.0 if context[k] truthy
  - ``{"kind": "context_equals", "key", "value"}``   → 1.0 if context[k]==value
  - ``{"kind": "context_absent", "key": "<k>"}``     → 1.0 if k not in / falsy

Declarative-only by design: the harness never executes arbitrary code from a
case file, so a poisoned golden case cannot become an RCE vector. Richer
runners (subprocess pytest suites, LLM-graded cases) are an extension point and
are deliberately out of scope here.

**No-op-safe:** when no golden cases exist, ``run_golden`` returns a neutral
*passing* result with ``score=1.0`` and ``case_count=0`` so the gate degrades
gracefully on a fresh install rather than blocking every change for lack of a
suite. Callers that require real coverage inspect ``case_count``.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .paths import golden_dir

logger = logging.getLogger(__name__)

# A regression is a drop in score beyond this epsilon (float noise guard).
DEFAULT_REGRESSION_EPSILON = 1e-6


@dataclass(frozen=True)
class EvalResult:
    """Outcome of one golden-suite run."""

    score: float                       # weighted mean in [0, 1]
    passed: bool                       # score == 1.0 (all weighted cases pass)
    case_count: int
    details: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def has_coverage(self) -> bool:
        return self.case_count > 0


def _load_cases() -> List[Dict[str, Any]]:
    cases: List[Dict[str, Any]] = []
    try:
        files = sorted(golden_dir().glob("*.json"))
    except OSError:
        return cases
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("eval: skipping unreadable golden case %s: %s", f, exc)
            continue
        if isinstance(data, dict):
            data.setdefault("id", f.stem)
            cases.append(data)
        elif isinstance(data, list):
            for i, item in enumerate(data):
                if isinstance(item, dict):
                    item.setdefault("id", f"{f.stem}[{i}]")
                    cases.append(item)
    return cases


def _eval_check(check: Dict[str, Any], context: Dict[str, Any]) -> float:
    """Evaluate one declarative check against *context*. Returns 1.0 / 0.0.

    Unknown check kinds score 0.0 (fail-SAFE: an uninterpretable golden case
    is treated as not-satisfied rather than silently passing).
    """
    kind = check.get("kind")
    if kind == "always_pass":
        return 1.0
    if kind == "context_truthy":
        return 1.0 if context.get(check.get("key")) else 0.0
    if kind == "context_equals":
        return 1.0 if context.get(check.get("key")) == check.get("value") else 0.0
    if kind == "context_absent":
        return 1.0 if not context.get(check.get("key")) else 0.0
    logger.warning("eval: unknown check kind %r → scoring 0.0", kind)
    return 0.0


def run_golden(
    context: Optional[Dict[str, Any]] = None,
) -> EvalResult:
    """Run the golden suite against *context*. No-op-safe.

    *context* carries the facts a case asserts over (e.g. a proposed change's
    metadata, a post-change probe result). When the suite directory is empty,
    returns a neutral passing result with ``case_count=0``.
    """
    context = context or {}
    cases = _load_cases()
    if not cases:
        return EvalResult(score=1.0, passed=True, case_count=0, details=[])

    total_weight = 0.0
    weighted_sum = 0.0
    details: List[Dict[str, Any]] = []
    for case in cases:
        try:
            weight = float(case.get("weight", 1.0))
        except (TypeError, ValueError):
            weight = 1.0
        if weight <= 0:
            weight = 1.0
        check = case.get("check") or {"kind": "always_pass"}
        case_score = _eval_check(check, context)
        weighted_sum += case_score * weight
        total_weight += weight
        details.append(
            {"id": case.get("id"), "score": case_score, "weight": weight}
        )

    score = weighted_sum / total_weight if total_weight else 1.0
    return EvalResult(
        score=score,
        passed=score >= 1.0 - DEFAULT_REGRESSION_EPSILON,
        case_count=len(cases),
        details=details,
    )


def delta(before: EvalResult, after: EvalResult) -> float:
    """Score change from *before* to *after* (negative = regression)."""
    return after.score - before.score


def is_regression(
    before: EvalResult,
    after: EvalResult,
    *,
    epsilon: float = DEFAULT_REGRESSION_EPSILON,
) -> bool:
    """True when *after* scores meaningfully below *before*.

    Only meaningful when *before* had coverage; with an empty suite every run
    is a neutral 1.0 and no regression can be detected (the gate treats lack of
    coverage as an explicit, surfaced condition, not a silent pass).
    """
    if not before.has_coverage:
        return False
    return delta(before, after) < -epsilon
