"""Durable run store for the Labs Workbench — SQLite at ``/opt/data/labs/runs.db``.

The live-Workbench run registry in ``api_dashboard.py`` (``_RUN_REGISTRY``) is an
in-memory dict that is wiped on every engine restart/rebuild.  That breaks
``GET /v1/tools/{id}/runs/latest`` (deep-link resume), the ``/message`` resume
path, and the artifacts read-back, all of which resolve a run by id after the
launch turn has settled.

This module persists the durable subset of each run record to a single SQLite
database on the ``/opt/data`` volume (host ``~/.hermes`` — survives image
rebuilds) so those lookups keep working across restarts.  Design notes:

- **Best-effort durability.** A DB failure must NEVER break the live request
  path: every write is wrapped and logged, never raised.  The in-memory dict
  remains the source of truth for the hot path; the DB is a restart-survival
  mirror.
- **Thread-safe.** ``_run_and_close`` mutates records from executor threads, so
  we connect-per-operation (sqlite3 default ``check_same_thread`` is irrelevant
  when each call opens its own connection) and guard writes with a module lock.
- **Parameterized SQL only.** No string interpolation into queries.
- **Persisted columns** are the fields the resume/artifacts endpoints need after
  a restart: ``run_id, tool_id, brand, brand_id, session_id, claude_session_id,
  status, created, updated, completed``.  ``busy`` (liveness) and ``inputs`` are
  intentionally NOT persisted — ``busy`` is a per-process concurrency guard that
  a restart resets, and the artifacts path only needs ``brand``.

On load, ``busy`` is forced ``False`` for every record: a restart kills any live
turn, so no run can still be mid-generation.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Serialize writes across executor threads.  Reads also take it: contention is
# trivial (a handful of runs) and it keeps the connect-per-op simple.
_LOCK = threading.Lock()

_DB_PATH: Optional[Path] = None

# Columns persisted to the `runs` table, in declaration order.
_COLUMNS = (
    "run_id",
    "tool_id",
    "brand",
    "brand_id",
    "session_id",
    "claude_session_id",
    "status",
    "created",
    "updated",
    "completed",
)


def _data_root() -> Path:
    """Resolve the read-WRITE data root (``/opt/data`` in-container).

    Mirrors ``api_dashboard._uploads_root``: derive the data root from the
    writable skills root in ``HERMES_TOOL_ROOTS`` (its parent is the ``~/.hermes``
    mount), falling back to ``~/.hermes`` for local/dev.
    """
    env = os.environ.get("HERMES_TOOL_ROOTS", "").strip()
    if env:
        roots = [p for p in env.split(os.pathsep) if p.strip()]
        for raw in reversed(roots):
            candidate = Path(raw).expanduser()
            try:
                candidate.mkdir(parents=True, exist_ok=True)
                if os.access(candidate, os.W_OK):
                    return candidate.parent  # ``.../skills`` → data root parent
            except OSError:
                continue
    try:
        from hermes_constants import get_hermes_home  # type: ignore

        return get_hermes_home()
    except Exception:
        return Path(os.path.expanduser("~/.hermes"))


def _db_path() -> Path:
    """Resolve (and cache) the runs DB path, mkdir-ing its parent dir."""
    global _DB_PATH
    if _DB_PATH is not None:
        return _DB_PATH
    labs_dir = _data_root() / "labs"
    try:
        labs_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # pragma: no cover — surfaced via load/persist logs
        logger.warning("labs_store: could not create %s: %s", labs_dir, exc)
    _DB_PATH = labs_dir / "runs.db"
    return _DB_PATH


def _connect() -> sqlite3.Connection:
    """Open a fresh connection (one per operation; thread-safe by construction)."""
    conn = sqlite3.connect(str(_db_path()), check_same_thread=False, timeout=5.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the ``runs`` table if absent.  Never raises (durability is best-effort)."""
    try:
        with _LOCK, _connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    run_id            TEXT PRIMARY KEY,
                    tool_id           TEXT,
                    brand             TEXT,
                    brand_id          TEXT,
                    session_id        TEXT,
                    claude_session_id TEXT,
                    status            TEXT,
                    created           REAL,
                    updated           REAL,
                    completed         INTEGER
                )
                """
            )
    except Exception as exc:
        logger.warning("labs_store: init_db failed: %s", exc)


def _kebab(text: str) -> str:
    """Kebab-case a brand name for the durable ``brand_id`` column.

    A local copy of ``api_dashboard._kebab`` so this module has no import cycle.
    """
    import re

    s = (text or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-")


def persist_run(run_id: str, record: Dict[str, Any]) -> None:
    """Upsert the durable subset of *record* keyed by *run_id*.

    Called at every mutation point (launch registration, busy toggles, terminal).
    Never raises: a failed write logs and returns so the live path is unaffected.
    """
    brand = record.get("brand") or ""
    row = {
        "run_id": run_id,
        "tool_id": record.get("tool_id"),
        "brand": brand,
        "brand_id": _kebab(brand),
        "session_id": record.get("session_id"),
        "claude_session_id": record.get("claude_session_id"),
        "status": record.get("status"),
        "created": record.get("created"),
        "updated": time.time(),
        "completed": 1 if record.get("completed") else 0,
    }
    placeholders = ", ".join("?" for _ in _COLUMNS)
    columns = ", ".join(_COLUMNS)
    updates = ", ".join(f"{c}=excluded.{c}" for c in _COLUMNS if c != "run_id")
    sql = (
        f"INSERT INTO runs ({columns}) VALUES ({placeholders}) "
        f"ON CONFLICT(run_id) DO UPDATE SET {updates}"
    )
    values = [row[c] for c in _COLUMNS]
    try:
        with _LOCK, _connect() as conn:
            conn.execute(sql, values)
    except Exception as exc:
        logger.warning("labs_store: persist_run(%s) failed: %s", run_id, exc)


def load_all() -> List[Dict[str, Any]]:
    """Return all persisted runs as record dicts for hydrating the in-memory cache.

    Each dict carries the same keys other callers read: ``session_id``,
    ``tool_id``, ``brand``, ``claude_session_id``, ``created``, ``completed``,
    ``status``, plus ``run_id``.  ``busy`` is set ``False`` (a restart kills any
    live turn) and ``inputs`` defaults to an empty dict (not persisted).
    Never raises — returns ``[]`` on any error so module init can't crash.
    """
    out: List[Dict[str, Any]] = []
    try:
        with _LOCK, _connect() as conn:
            cur = conn.execute(
                "SELECT run_id, tool_id, brand, session_id, claude_session_id, "
                "status, created, completed FROM runs"
            )
            rows = cur.fetchall()
    except Exception as exc:
        logger.warning("labs_store: load_all failed: %s", exc)
        return out

    for r in rows:
        out.append(
            {
                "run_id": r["run_id"],
                "tool_id": r["tool_id"],
                "brand": r["brand"] or "",
                "session_id": r["session_id"],
                "claude_session_id": r["claude_session_id"],
                "status": r["status"],
                "created": r["created"],
                "completed": bool(r["completed"]),
                # Restart-derived defaults (not persisted):
                "busy": False,
                "inputs": {},
            }
        )
    return out


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single persisted run by id, or ``None``.  Never raises."""
    try:
        with _LOCK, _connect() as conn:
            cur = conn.execute(
                "SELECT run_id, tool_id, brand, session_id, claude_session_id, "
                "status, created, completed FROM runs WHERE run_id = ?",
                (run_id,),
            )
            r = cur.fetchone()
    except Exception as exc:
        logger.warning("labs_store: get_run(%s) failed: %s", run_id, exc)
        return None
    if r is None:
        return None
    return {
        "run_id": r["run_id"],
        "tool_id": r["tool_id"],
        "brand": r["brand"] or "",
        "session_id": r["session_id"],
        "claude_session_id": r["claude_session_id"],
        "status": r["status"],
        "created": r["created"],
        "completed": bool(r["completed"]),
        "busy": False,
        "inputs": {},
    }
