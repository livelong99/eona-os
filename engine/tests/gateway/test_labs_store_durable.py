"""Durable run store + bounded run registry (D4).

Two concerns are exercised here:

1. ``labs_store`` persists the resume-turn payload — ``inputs`` (JSON),
   ``run_cwd`` and ``swarm`` — so a ``/message`` resume after an engine restart
   keeps full capability instead of silently re-deriving ``run_cwd`` and getting
   an empty ``inputs``.  The round-trip tests assert those fields survive
   persist→hydrate (both ``load_all`` and ``get_run``), and that older rows
   (written before the new columns existed) hydrate without crashing.

2. ``api_dashboard._RUN_REGISTRY`` is bounded: inserting past the cap evicts the
   oldest COMPLETED runs first and NEVER evicts a busy/in-flight run.
"""
from __future__ import annotations

import sqlite3

import pytest

from gateway.platforms import labs_store


@pytest.fixture
def store(tmp_path, monkeypatch):
    """Point ``labs_store`` at an isolated DB under ``tmp_path`` and init it."""
    db_path = tmp_path / "labs" / "runs.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(labs_store, "_DB_PATH", db_path)
    labs_store.init_db()
    return labs_store


# ---------------------------------------------------------------------------
# labs_store: persist → hydrate round-trip carries the resume payload
# ---------------------------------------------------------------------------


def test_persist_hydrate_round_trip_carries_inputs_and_run_cwd(store):
    record = {
        "session_id": "tool-workspace-abc",
        "tool_id": "workspace",
        "inputs": {"name": "Acme", "source_type": "folder", "nested": {"k": [1, 2]}},
        "brand": "Acme",
        "claude_session_id": "cs-1",
        "created": 1700.0,
        "completed": True,
        "busy": True,  # liveness — must NOT survive a restart
        "run_cwd": "/opt/data/workspaces/acme",
        "swarm": True,
    }
    store.persist_run("run_1", record)

    loaded = {r["run_id"]: r for r in store.load_all()}
    assert "run_1" in loaded
    rec = loaded["run_1"]
    assert rec["inputs"] == record["inputs"]  # JSON round-trip, nested intact
    assert rec["run_cwd"] == "/opt/data/workspaces/acme"
    assert rec["swarm"] is True
    assert rec["tool_id"] == "workspace"
    assert rec["brand"] == "Acme"
    assert rec["claude_session_id"] == "cs-1"
    assert rec["completed"] is True
    # busy is restart-derived: always False on hydrate.
    assert rec["busy"] is False


def test_get_run_carries_resume_payload(store):
    store.persist_run(
        "run_2",
        {
            "session_id": "tool-x-1",
            "tool_id": "brand-maker",
            "inputs": {"brand": "Zed"},
            "brand": "Zed",
            "created": 10.0,
            "completed": False,
            "run_cwd": "/tmp/zed",
            "swarm": False,
        },
    )
    rec = store.get_run("run_2")
    assert rec is not None
    assert rec["inputs"] == {"brand": "Zed"}
    assert rec["run_cwd"] == "/tmp/zed"
    assert rec["swarm"] is False
    assert rec["busy"] is False


def test_get_run_missing_returns_none(store):
    assert store.get_run("nope") is None


def test_upsert_updates_resume_payload(store):
    store.persist_run("run_3", {"inputs": {"a": 1}, "run_cwd": "/one", "swarm": False})
    store.persist_run("run_3", {"inputs": {"a": 2}, "run_cwd": "/two", "swarm": True})
    rec = store.get_run("run_3")
    assert rec is not None
    assert rec["inputs"] == {"a": 2}
    assert rec["run_cwd"] == "/two"
    assert rec["swarm"] is True


def test_persist_run_with_no_inputs_hydrates_empty_dict(store):
    store.persist_run("run_4", {"tool_id": "t", "run_cwd": "/c"})
    rec = store.get_run("run_4")
    assert rec is not None
    assert rec["inputs"] == {}  # NULL column → empty dict, never None
    assert rec["run_cwd"] == "/c"


def test_non_serializable_inputs_does_not_break_write(store):
    # A non-JSON-serializable input must not crash the durable write; the rest of
    # the resume payload (run_cwd, swarm) still persists, inputs falls back to {}.
    store.persist_run(
        "run_5",
        {"inputs": {"obj": object()}, "run_cwd": "/safe", "swarm": True},
    )
    rec = store.get_run("run_5")
    assert rec is not None
    assert rec["inputs"] == {}
    assert rec["run_cwd"] == "/safe"
    assert rec["swarm"] is True


def test_migration_adds_columns_to_legacy_table(tmp_path, monkeypatch):
    """A DB created before the resume-payload columns existed migrates cleanly."""
    db_path = tmp_path / "labs" / "runs.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # Create the OLD schema (no inputs/run_cwd/swarm) and seed a legacy row.
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE runs (
            run_id TEXT PRIMARY KEY, tool_id TEXT, brand TEXT, brand_id TEXT,
            session_id TEXT, claude_session_id TEXT, status TEXT,
            created REAL, updated REAL, completed INTEGER
        )
        """
    )
    conn.execute(
        "INSERT INTO runs (run_id, tool_id, brand, completed) VALUES (?,?,?,?)",
        ("legacy_1", "workspace", "Old", 1),
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr(labs_store, "_DB_PATH", db_path)
    labs_store.init_db()  # should ALTER in the missing columns, not crash

    rec = labs_store.get_run("legacy_1")
    assert rec is not None
    assert rec["inputs"] == {}  # legacy row had no inputs
    assert rec["run_cwd"] is None
    assert rec["swarm"] is False
    assert rec["tool_id"] == "workspace"

    # New writes against the migrated table carry the full payload.
    labs_store.persist_run(
        "fresh_1", {"inputs": {"k": "v"}, "run_cwd": "/new", "swarm": True}
    )
    fresh = labs_store.get_run("fresh_1")
    assert fresh is not None
    assert fresh["inputs"] == {"k": "v"}
    assert fresh["run_cwd"] == "/new"
    assert fresh["swarm"] is True


# ---------------------------------------------------------------------------
# api_dashboard: bounded run registry eviction
# ---------------------------------------------------------------------------


def _registry(monkeypatch, cap):
    """A fresh bounded registry with a small cap for eviction tests."""
    from gateway.platforms import api_dashboard as d

    monkeypatch.setattr(d, "_RUN_REGISTRY_MAX", cap)
    return d._BoundedRunRegistry()


def test_registry_caps_size_evicting_oldest_completed(monkeypatch):
    reg = _registry(monkeypatch, cap=3)
    # Insert 5 completed runs; only the 3 newest should remain.
    for i in range(5):
        reg[f"r{i}"] = {"completed": True, "busy": False}
    assert len(reg) == 3
    assert set(reg.keys()) == {"r2", "r3", "r4"}  # oldest (r0, r1) evicted


def test_registry_never_evicts_busy_run(monkeypatch):
    reg = _registry(monkeypatch, cap=2)
    # r0 is busy/in-flight and oldest — it must survive even as we overflow.
    reg["r0"] = {"completed": False, "busy": True}
    reg["r1"] = {"completed": True, "busy": False}
    reg["r2"] = {"completed": True, "busy": False}
    reg["r3"] = {"completed": True, "busy": False}
    assert "r0" in reg  # busy run never evicted
    assert len(reg) <= 3  # cap is soft only because the busy run can't be freed
    # The completed runs are the ones that got trimmed to honor the cap.
    assert "r3" in reg  # newest survives


def test_registry_evicts_completed_before_idle_open_run(monkeypatch):
    reg = _registry(monkeypatch, cap=2)
    # r0 open-but-idle (not busy, not completed), r1 completed (older slot than r2).
    reg["r0"] = {"completed": False, "busy": False}
    reg["r1"] = {"completed": True, "busy": False}
    reg["r2"] = {"completed": True, "busy": False}  # overflow → evict a completed
    assert "r0" in reg  # idle-open kept; a completed run was preferred for eviction
    assert len(reg) == 2


def test_registry_soft_cap_when_all_busy(monkeypatch):
    reg = _registry(monkeypatch, cap=1)
    reg["r0"] = {"completed": False, "busy": True}
    reg["r1"] = {"completed": False, "busy": True}
    # Cannot evict either busy run; both remain (soft cap).
    assert len(reg) == 2
    assert {"r0", "r1"} <= set(reg.keys())


def test_registry_reinsert_same_key_does_not_evict(monkeypatch):
    reg = _registry(monkeypatch, cap=2)
    reg["r0"] = {"completed": True, "busy": False}
    reg["r1"] = {"completed": True, "busy": False}
    # Updating an existing key is not a new insert; no eviction.
    reg["r0"] = {"completed": True, "busy": False, "updated": True}
    assert len(reg) == 2
    assert reg["r0"].get("updated") is True
