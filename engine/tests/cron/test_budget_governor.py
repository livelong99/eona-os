"""Tests for engine/cron/budget_governor.py.

Covers:
  - Basic allocation when demand fits within budget.
  - Priority ordering: L3 loops funded before L4, L4 before L5.
  - Proportional scaling within a tier when demand exceeds envelope.
  - Rate-limit backoff: 50 % budget reduction applied bottom-up.
  - Zero-budget edge case: all loops receive zero allocation.
  - Empty loops list: plan has no allocations, remaining == budget.
  - record_spend writes a valid JSONL entry to the ledger.
  - record_spend creates the ledger directory if missing.
  - record_spend raises on negative turns_used.
  - allocate raises on negative budget.
  - AllocationPlan.remaining correct after partial tier funding.
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from cron.budget_governor import (
    AllocationPlan,
    Loop,
    RateLimitSignal,
    allocate,
    record_spend,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def l3_loops() -> list[Loop]:
    """Canonical L3 loops (priority 1)."""
    return [
        Loop("chronicle", layer=3, priority=1, estimated_turns=20),
        Loop("steward", layer=3, priority=1, estimated_turns=15),
    ]


@pytest.fixture()
def l4_loops() -> list[Loop]:
    """Canonical L4 loops (priority 2)."""
    return [
        Loop("flywheel", layer=4, priority=2, estimated_turns=40),
        Loop("atlas", layer=4, priority=2, estimated_turns=30),
    ]


@pytest.fixture()
def l5_loops() -> list[Loop]:
    """Canonical L5 loops (priority 3)."""
    return [
        Loop("matts", layer=5, priority=3, estimated_turns=60),
        Loop("genesis", layer=5, priority=3, estimated_turns=50),
    ]


@pytest.fixture()
def all_loops(l3_loops, l4_loops, l5_loops) -> list[Loop]:
    return l3_loops + l4_loops + l5_loops


@pytest.fixture()
def no_signals() -> list[RateLimitSignal]:
    return []


@pytest.fixture()
def rate_limit_signal() -> list[RateLimitSignal]:
    return [RateLimitSignal(triggered=True, retry_after_seconds=120)]


@pytest.fixture()
def tmp_ledger(tmp_path) -> Path:
    return tmp_path / "test_ledger.jsonl"


# ---------------------------------------------------------------------------
# allocate — basic cases
# ---------------------------------------------------------------------------

class TestAllocateBasic:
    def test_all_loops_funded_when_budget_sufficient(self, all_loops, no_signals):
        """When budget exceeds total demand, every loop is funded in full."""
        total_demand = sum(l.estimated_turns for l in all_loops)
        plan = allocate(all_loops, budget=total_demand + 50, signals=no_signals)

        assert isinstance(plan, AllocationPlan)
        alloc_map = dict(plan.allocations)
        for loop in all_loops:
            assert alloc_map[loop.name] == loop.estimated_turns, (
                f"{loop.name} should be fully funded"
            )
        assert plan.remaining == 50
        assert plan.degraded is False

    def test_empty_loops_returns_full_remaining(self, no_signals):
        plan = allocate([], budget=100, signals=no_signals)
        assert plan.allocations == ()
        assert plan.remaining == 100
        assert plan.total_budget == 100
        assert plan.degraded is False

    def test_zero_budget_all_loops_zero(self, all_loops, no_signals):
        plan = allocate(all_loops, budget=0, signals=no_signals)
        for _, alloc in plan.allocations:
            assert alloc == 0
        assert plan.remaining == 0

    def test_negative_budget_raises(self, all_loops, no_signals):
        with pytest.raises(ValueError, match="budget must be >= 0"):
            allocate(all_loops, budget=-1, signals=no_signals)

    def test_plan_total_budget_field(self, all_loops, no_signals):
        plan = allocate(all_loops, budget=200, signals=no_signals)
        assert plan.total_budget == 200

    def test_single_loop_gets_full_budget_when_demand_low(self, no_signals):
        loops = [Loop("chronicle", layer=3, priority=1, estimated_turns=10)]
        plan = allocate(loops, budget=50, signals=no_signals)
        assert dict(plan.allocations)["chronicle"] == 10
        assert plan.remaining == 40

    def test_single_loop_capped_at_budget(self, no_signals):
        loops = [Loop("chronicle", layer=3, priority=1, estimated_turns=100)]
        plan = allocate(loops, budget=30, signals=no_signals)
        assert dict(plan.allocations)["chronicle"] == 30
        assert plan.remaining == 0


# ---------------------------------------------------------------------------
# allocate — priority ordering
# ---------------------------------------------------------------------------

class TestAllocatePriority:
    def test_l3_fully_funded_before_l4(self, l3_loops, l4_loops, no_signals):
        """L3 (priority 1) always gets full allocation before L4 (priority 2)."""
        l3_demand = sum(l.estimated_turns for l in l3_loops)
        # Budget is just enough for L3 but not L4.
        plan = allocate(l3_loops + l4_loops, budget=l3_demand, signals=no_signals)
        alloc_map = dict(plan.allocations)
        for loop in l3_loops:
            assert alloc_map[loop.name] == loop.estimated_turns
        for loop in l4_loops:
            assert alloc_map[loop.name] == 0

    def test_l4_fully_funded_before_l5(self, l3_loops, l4_loops, l5_loops, no_signals):
        """L4 (priority 2) gets funded before L5 (priority 3)."""
        l3_demand = sum(l.estimated_turns for l in l3_loops)
        l4_demand = sum(l.estimated_turns for l in l4_loops)
        budget = l3_demand + l4_demand  # Exact fit for L3 + L4; nothing for L5.
        plan = allocate(l3_loops + l4_loops + l5_loops, budget=budget, signals=no_signals)
        alloc_map = dict(plan.allocations)
        for loop in l3_loops + l4_loops:
            assert alloc_map[loop.name] == loop.estimated_turns
        for loop in l5_loops:
            assert alloc_map[loop.name] == 0

    def test_l5_cut_entirely_when_budget_exhausted_by_l3_l4(
        self, l3_loops, l4_loops, l5_loops, no_signals
    ):
        l3_demand = sum(l.estimated_turns for l in l3_loops)
        l4_demand = sum(l.estimated_turns for l in l4_loops)
        plan = allocate(
            l3_loops + l4_loops + l5_loops,
            budget=l3_demand + l4_demand - 1,  # One short of full L4 funding.
            signals=no_signals,
        )
        alloc_map = dict(plan.allocations)
        for loop in l5_loops:
            assert alloc_map[loop.name] == 0

    def test_all_loops_appear_in_allocations(self, all_loops, no_signals):
        """Every loop appears in allocations even if its allocation is 0."""
        plan = allocate(all_loops, budget=5, signals=no_signals)
        names_in_plan = {name for name, _ in plan.allocations}
        for loop in all_loops:
            assert loop.name in names_in_plan


# ---------------------------------------------------------------------------
# allocate — proportional scaling within a tier
# ---------------------------------------------------------------------------

class TestAllocateProportional:
    def test_single_tier_scaled_proportionally(self, no_signals):
        """When a tier's demand exceeds the envelope, allocations are proportional."""
        loops = [
            Loop("a", layer=3, priority=1, estimated_turns=60),
            Loop("b", layer=3, priority=1, estimated_turns=40),
        ]
        plan = allocate(loops, budget=50, signals=no_signals)
        alloc_map = dict(plan.allocations)
        # a: 60/100 * 50 = 30, b: 40/100 * 50 = 20
        assert alloc_map["a"] == 30
        assert alloc_map["b"] == 20
        assert plan.remaining == 0

    def test_allocations_sum_does_not_exceed_budget(self, all_loops, no_signals):
        for budget in [0, 10, 50, 100, 215, 500]:
            plan = allocate(all_loops, budget=budget, signals=no_signals)
            total_alloc = sum(v for _, v in plan.allocations)
            assert total_alloc <= budget, f"budget={budget}: allocated {total_alloc} > budget"

    def test_remaining_is_consistent(self, all_loops, no_signals):
        budget = 300
        plan = allocate(all_loops, budget=budget, signals=no_signals)
        total_alloc = sum(v for _, v in plan.allocations)
        assert total_alloc + plan.remaining == budget


# ---------------------------------------------------------------------------
# allocate — rate-limit backoff
# ---------------------------------------------------------------------------

class TestAllocateRateLimit:
    def test_degraded_flag_set_on_triggered_signal(self, all_loops, rate_limit_signal):
        plan = allocate(all_loops, budget=200, signals=rate_limit_signal)
        assert plan.degraded is True

    def test_degraded_false_when_no_signal_triggered(self, all_loops):
        signals = [RateLimitSignal(triggered=False, retry_after_seconds=0)]
        plan = allocate(all_loops, budget=200, signals=signals)
        assert plan.degraded is False

    def test_backoff_halves_effective_budget(self, all_loops, rate_limit_signal, no_signals):
        """With a triggered signal, total allocation is <= 50 % of budget."""
        budget = 400
        plan_normal = allocate(all_loops, budget=budget, signals=no_signals)
        plan_degraded = allocate(all_loops, budget=budget, signals=rate_limit_signal)
        total_normal = sum(v for _, v in plan_normal.allocations)
        total_degraded = sum(v for _, v in plan_degraded.allocations)
        assert total_degraded <= total_normal
        # Effective budget is budget * 0.5 = 200; total demand is 215 so all
        # allocations are reduced but L3 is fully funded first.
        assert total_degraded <= budget // 2

    def test_l3_protected_under_backoff(self, all_loops, rate_limit_signal):
        """L3 loops (priority 1) should still be funded first even after backoff."""
        # Total l3 demand = 35; 50 % of 200 = 100 — l3 fits inside reduced envelope.
        plan = allocate(all_loops, budget=200, signals=rate_limit_signal)
        alloc_map = dict(plan.allocations)
        assert alloc_map["chronicle"] == 20
        assert alloc_map["steward"] == 15

    def test_l5_cut_first_under_backoff(self, all_loops, rate_limit_signal):
        """Under tight backoff, L5 loops should receive less than full allocation."""
        plan = allocate(all_loops, budget=100, signals=rate_limit_signal)
        alloc_map = dict(plan.allocations)
        # Effective budget = 50; L3 demand = 35; remaining for L4+ = 15.
        # L5 gets nothing.
        assert alloc_map["matts"] == 0
        assert alloc_map["genesis"] == 0

    def test_multiple_signals_only_one_backoff_applied(self, all_loops):
        """Multiple triggered signals still apply the same single backoff factor."""
        signals = [
            RateLimitSignal(triggered=True, retry_after_seconds=60),
            RateLimitSignal(triggered=True, retry_after_seconds=120),
        ]
        plan = allocate(all_loops, budget=200, signals=signals)
        assert plan.degraded is True
        total = sum(v for _, v in plan.allocations)
        assert total <= 100  # 50 % of 200


# ---------------------------------------------------------------------------
# record_spend
# ---------------------------------------------------------------------------

class TestRecordSpend:
    def test_writes_valid_jsonl(self, tmp_ledger):
        record_spend("chronicle", turns_used=18, ledger_path=str(tmp_ledger))
        lines = tmp_ledger.read_text().strip().splitlines()
        assert len(lines) == 1
        entry = json.loads(lines[0])
        assert entry["loop"] == "chronicle"
        assert entry["turns_used"] == 18
        assert "ts" in entry

    def test_multiple_calls_append(self, tmp_ledger):
        record_spend("chronicle", turns_used=18, ledger_path=str(tmp_ledger))
        record_spend("steward", turns_used=12, ledger_path=str(tmp_ledger))
        record_spend("flywheel", turns_used=35, ledger_path=str(tmp_ledger))
        lines = tmp_ledger.read_text().strip().splitlines()
        assert len(lines) == 3
        loops = [json.loads(l)["loop"] for l in lines]
        assert loops == ["chronicle", "steward", "flywheel"]

    def test_ts_is_iso_utc(self, tmp_ledger):
        record_spend("matts", turns_used=5, ledger_path=str(tmp_ledger))
        entry = json.loads(tmp_ledger.read_text().strip())
        # Should parse without raising and have UTC offset.
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(entry["ts"])
        assert dt.tzinfo is not None

    def test_creates_missing_parent_directory(self, tmp_path):
        nested = tmp_path / "a" / "b" / "ledger.jsonl"
        record_spend("genesis", turns_used=0, ledger_path=str(nested))
        assert nested.exists()

    def test_zero_turns_valid(self, tmp_ledger):
        record_spend("atlas", turns_used=0, ledger_path=str(tmp_ledger))
        entry = json.loads(tmp_ledger.read_text().strip())
        assert entry["turns_used"] == 0

    def test_negative_turns_raises(self, tmp_ledger):
        with pytest.raises(ValueError, match="turns_used must be >= 0"):
            record_spend("chronicle", turns_used=-1, ledger_path=str(tmp_ledger))

    def test_default_ledger_path_used_when_none(self, tmp_path):
        """record_spend resolves a default path when ledger_path is None."""
        fake_home = tmp_path / ".hermes"
        with patch(
            "cron.budget_governor._default_ledger_path",
            return_value=fake_home / "cron" / "budget_ledger.jsonl",
        ):
            record_spend("chronicle", turns_used=3, ledger_path=None)
        ledger = fake_home / "cron" / "budget_ledger.jsonl"
        assert ledger.exists()
        entry = json.loads(ledger.read_text().strip())
        assert entry["loop"] == "chronicle"
