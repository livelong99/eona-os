"""
Nightly compute budget governor for agent-home.

Allocates the night's Claude-subscription compute across the L3/L4/L5 loops
by priority (per §5.3 of agent-os-architecture.md):

    Priority 1 (L3): Chronicle, Steward   — first funded, never cut
    Priority 2 (L4): Flywheel, Atlas      — funded after L3, cut on backoff
    Priority 3 (L5): MaTTS, Genesis       — funded last, cut first on backoff

Because compute is subscription-metered (not token-metered), the binding
constraint is Claude's rate-limit, not dollars. The governor:

  1. ``allocate(loops, budget, signals) -> AllocationPlan``
     Pure allocator — no I/O, safe to call in the scheduler tick.
     Call this at the start of a nightly run to get the allocation plan.

  2. ``record_spend(loop_name, turns_used, ledger_path=None)``
     Appends one JSONL entry to the budget ledger after each loop finishes.
     Defaults to ``~/.hermes/cron/budget_ledger.jsonl``.

The cron scheduler imports these two functions; nothing else in this module
should be called externally.

Usage example (scheduler.py hook, future wiring):

    from cron.budget_governor import allocate, record_spend, Loop, RateLimitSignal

    loops = [
        Loop("chronicle", layer=3, priority=1, estimated_turns=20),
        Loop("steward",   layer=3, priority=1, estimated_turns=15),
        Loop("flywheel",  layer=4, priority=2, estimated_turns=40),
        Loop("atlas",     layer=4, priority=2, estimated_turns=30),
        Loop("matts",     layer=5, priority=3, estimated_turns=60),
        Loop("genesis",   layer=5, priority=3, estimated_turns=50),
    ]
    signals = [RateLimitSignal(triggered=True, retry_after_seconds=120)]
    plan = allocate(loops, budget=150, signals=signals)
    # later, after each loop completes:
    record_spend("chronicle", turns_used=18)
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Loop:
    """Descriptor for one nightly agent loop that consumes compute budget.

    Attributes:
        name:             Unique loop identifier (e.g. "chronicle", "flywheel").
        layer:            Architecture layer (3 = L3 Life-OS, 4 = L4 Studio,
                          5 = L5 Evolution Engine).
        priority:         Allocation priority — lower is higher precedence.
                          Loops with the same priority compete proportionally.
        estimated_turns:  Expected number of Claude turns this loop will use
                          on a typical night. Used by the allocator to size
                          each loop's slice.
    """

    name: str
    layer: int
    priority: int
    estimated_turns: int


@dataclass(frozen=True)
class RateLimitSignal:
    """A rate-limit signal from the Claude API, observed during the current night.

    Attributes:
        triggered:             True when a 429/rate-limit was received.
        retry_after_seconds:   Hint from the Retry-After header (0 = unknown).
    """

    triggered: bool
    retry_after_seconds: int = 0


@dataclass(frozen=True)
class AllocationPlan:
    """Output of ``allocate()``.

    Attributes:
        allocations:   Ordered mapping of loop name → allocated turns.
                       Ordered highest-priority first. Loops with a zero
                       allocation were cut entirely by backoff.
        total_budget:  The budget passed to ``allocate()``.
        remaining:     Unallocated turns after all loops are funded
                       (may be > 0 when total estimated demand < budget).
        degraded:      True when at least one rate-limit signal was active
                       and the backoff multiplier was applied.
    """

    allocations: tuple[tuple[str, int], ...]
    total_budget: int
    remaining: int
    degraded: bool


# ---------------------------------------------------------------------------
# Allocator
# ---------------------------------------------------------------------------

# When any rate-limit signal is active, effective budget is reduced to this
# fraction of the original. High-priority loops are funded first within the
# reduced envelope; lower-priority tiers absorb the cuts.
_RATE_LIMIT_BACKOFF_FACTOR = 0.5


def allocate(
    loops: Sequence[Loop],
    budget: int,
    signals: Sequence[RateLimitSignal],
) -> AllocationPlan:
    """Allocate the nightly compute budget across loops by priority.

    Algorithm:
      1. If any signal is triggered, shrink the effective budget by
         ``_RATE_LIMIT_BACKOFF_FACTOR`` (50 % cut).
      2. Sort loops by (priority ASC, estimated_turns DESC) so that within
         a priority tier, heavier loops are considered first — this makes
         the proportional split intuitive and stable.
      3. Walk priority tiers in order. Within each tier, distribute the
         remaining envelope proportionally to ``estimated_turns``.
         If the tier's total demand fits within the envelope, fund it fully.
         If it exceeds the envelope, scale each loop's allocation down
         proportionally (no loop in the same tier starves entirely unless
         the envelope is zero).
      4. Any unused budget is reported as ``remaining``.

    Args:
        loops:   The loops competing for budget tonight.
        budget:  Total Claude turns available for the night (>= 0).
        signals: Rate-limit signals observed this night.

    Returns:
        An ``AllocationPlan`` with per-loop allocations.
    """
    if budget < 0:
        raise ValueError(f"budget must be >= 0, got {budget}")

    degraded = any(s.triggered for s in signals)
    effective_budget = int(budget * _RATE_LIMIT_BACKOFF_FACTOR) if degraded else budget

    # Group loops by priority tier (ascending = highest priority first).
    tiers: dict[int, list[Loop]] = {}
    for loop in loops:
        tiers.setdefault(loop.priority, []).append(loop)

    allocations: list[tuple[str, int]] = []
    envelope = effective_budget

    for priority in sorted(tiers):
        tier_loops = sorted(tiers[priority], key=lambda l: l.estimated_turns, reverse=True)
        total_demand = sum(l.estimated_turns for l in tier_loops)

        if envelope <= 0:
            # Budget exhausted — remaining tiers get zero.
            for loop in tier_loops:
                allocations.append((loop.name, 0))
            continue

        if total_demand <= envelope:
            # Tier fits entirely — fund all loops in full.
            for loop in tier_loops:
                allocations.append((loop.name, loop.estimated_turns))
            envelope -= total_demand
        else:
            # Tier exceeds envelope — scale proportionally.
            remaining_in_tier = envelope
            tier_allocs: list[tuple[str, int]] = []
            for i, loop in enumerate(tier_loops):
                if i == len(tier_loops) - 1:
                    # Last loop gets whatever's left (avoids rounding drift).
                    alloc = remaining_in_tier
                else:
                    alloc = int(envelope * loop.estimated_turns / total_demand)
                    alloc = min(alloc, remaining_in_tier)
                tier_allocs.append((loop.name, alloc))
                remaining_in_tier -= alloc
            allocations.extend(tier_allocs)
            envelope = 0

    remaining = envelope
    return AllocationPlan(
        allocations=tuple(allocations),
        total_budget=budget,
        remaining=remaining,
        degraded=degraded,
    )


# ---------------------------------------------------------------------------
# Spend recorder
# ---------------------------------------------------------------------------

_DEFAULT_LEDGER_FILENAME = "budget_ledger.jsonl"


def _default_ledger_path() -> Path:
    """Resolve the default ledger path under ~/.hermes/cron/."""
    try:
        from hermes_constants import get_hermes_home
        hermes_home = get_hermes_home()
    except Exception:
        hermes_home = Path(os.path.expanduser("~")) / ".hermes"
    return hermes_home / "cron" / _DEFAULT_LEDGER_FILENAME


def record_spend(
    loop_name: str,
    turns_used: int,
    ledger_path: str | None = None,
) -> None:
    """Append a spend record to the budget ledger after a loop completes.

    Each call appends one JSON line to the ledger file. The ledger is
    append-only; existing entries are never modified. The file is created
    (with parent directories) if it does not exist.

    Record format::

        {
          "ts":        "<ISO-8601 UTC timestamp>",
          "loop":      "<loop_name>",
          "turns_used": <int>
        }

    Args:
        loop_name:   The name of the loop that just completed (e.g. "chronicle").
        turns_used:  The number of Claude turns the loop actually consumed.
        ledger_path: Absolute path to the JSONL ledger file. Defaults to
                     ``~/.hermes/cron/budget_ledger.jsonl``.
    """
    if turns_used < 0:
        raise ValueError(f"turns_used must be >= 0, got {turns_used}")

    path = Path(ledger_path) if ledger_path else _default_ledger_path()

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        logger.error("budget_governor: failed to create ledger directory %s: %s", path.parent, exc)
        raise

    record = {
        "ts": datetime.now(tz=timezone.utc).isoformat(),
        "loop": loop_name,
        "turns_used": turns_used,
    }
    line = json.dumps(record, ensure_ascii=False)

    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError as exc:
        logger.error("budget_governor: failed to write to ledger %s: %s", path, exc)
        raise

    logger.debug("budget_governor: recorded spend — loop=%s turns=%d ledger=%s", loop_name, turns_used, path)
