"""Persisted model roster + 3-tier routing for the dashboard Control → Models tab.

A tiny durable key-value SQLite store (one row per config key) that survives
engine restarts, mirroring the best-effort conventions of ``labs_store.py``:

- **Best-effort / never raises.**  A DB failure must never break a request: every
  write is wrapped and logged; reads fall back to defaults.  The dashboard
  degrades to its static catalog rather than erroring.
- **Connect-per-operation + module lock.**  No long-lived connection; cheap given
  the trivial row count (two keys).
- **Parameterized SQL only.**

Two keys are stored, both JSON-encoded:

- ``roster``  → ``{model_id: enabled_bool}`` — which models are toggled on.
- ``routing`` → ``{"t1": model_id, "t2": model_id}`` — the model chosen for each
  routing tier. Tier 1 serves the home voice agent + planner; Tier 2 serves
  Brainstorming, Labs tools, and the workspace.

``resolve_tier_model(tier, default)`` is the read used on the agent hot path: it
returns *default* whenever the store is empty, unavailable, or the value is
missing/invalid, so callers keep their current behavior until a routing is saved.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_LOCK = threading.Lock()
_DB_PATH: Optional[Path] = None

_VALID_TIERS = ("t1", "t2")

# Runtime default model per tier when nothing is saved. Tier 1 (home voice agent
# + planner) → ``None`` leaves the gateway default in place (already Sonnet). Tier
# 2 (Brainstorming, Tools & Workspace) forces Opus for the heavy creative/coding
# surfaces, per the configured tier policy.
_TIER_RUNTIME_DEFAULT = {"t1": None, "t2": "claude-opus-4-8"}


def _data_root() -> Path:
    """Resolve the read-WRITE data root.  Copy of ``labs_store._data_root``.

    Derives the data root from the writable skills root in ``HERMES_TOOL_ROOTS``
    (its parent is the ``~/.hermes`` mount), falling back to ``~/.hermes``.
    """
    env = os.environ.get("HERMES_TOOL_ROOTS", "").strip()
    if env:
        roots = [p for p in env.split(os.pathsep) if p.strip()]
        for raw in reversed(roots):
            candidate = Path(raw).expanduser()
            try:
                candidate.mkdir(parents=True, exist_ok=True)
                if os.access(candidate, os.W_OK):
                    return candidate.parent
            except OSError:
                continue
    try:
        from hermes_constants import get_hermes_home  # type: ignore

        return get_hermes_home()
    except Exception:
        return Path(os.path.expanduser("~/.hermes"))


def _db_path() -> Path:
    """Resolve (and cache) the model-config DB path, mkdir-ing its parent dir."""
    global _DB_PATH
    if _DB_PATH is not None:
        return _DB_PATH
    control_dir = _data_root() / "control"
    try:
        control_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # pragma: no cover — surfaced via op logs
        logger.warning("model_config_store: could not create %s: %s", control_dir, exc)
    _DB_PATH = control_dir / "model_config.db"
    return _DB_PATH


def _connect() -> sqlite3.Connection:
    """Open a fresh connection (one per operation; thread-safe by construction)."""
    conn = sqlite3.connect(str(_db_path()), check_same_thread=False, timeout=5.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the ``model_config`` table if absent.  Never raises."""
    try:
        with _LOCK, _connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS model_config (
                    key     TEXT PRIMARY KEY,
                    value   TEXT,
                    updated REAL
                )
                """
            )
    except Exception as exc:
        logger.warning("model_config_store: init_db failed: %s", exc)


def _read_key(key: str) -> Optional[Any]:
    """Return the JSON-decoded value for *key*, or ``None``.  Never raises."""
    try:
        with _LOCK, _connect() as conn:
            cur = conn.execute("SELECT value FROM model_config WHERE key = ?", (key,))
            row = cur.fetchone()
    except Exception as exc:
        logger.debug("model_config_store: read(%s) failed: %s", key, exc)
        return None
    if row is None or row["value"] is None:
        return None
    try:
        return json.loads(row["value"])
    except Exception:
        logger.debug("model_config_store: bad JSON for key %s", key)
        return None


def _write_key(key: str, value: Any) -> None:
    """Upsert a JSON-encoded value for *key*.  Never raises."""
    try:
        payload = json.dumps(value, ensure_ascii=False)
    except Exception as exc:
        logger.warning("model_config_store: cannot encode %s: %s", key, exc)
        return
    try:
        with _LOCK, _connect() as conn:
            conn.execute(
                "INSERT INTO model_config (key, value, updated) VALUES (?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated",
                (key, payload, time.time()),
            )
    except Exception as exc:
        logger.warning("model_config_store: write(%s) failed: %s", key, exc)


def get_config() -> Dict[str, Any]:
    """Return ``{"roster": {...}, "routing": {...}}`` (empty dicts if unset)."""
    roster = _read_key("roster")
    routing = _read_key("routing")
    return {
        "roster": roster if isinstance(roster, dict) else {},
        "routing": routing if isinstance(routing, dict) else {},
    }


def put_config(
    roster: Optional[Dict[str, bool]] = None,
    routing: Optional[Dict[str, str]] = None,
) -> None:
    """Persist roster and/or routing.  Only the provided keys are written."""
    if isinstance(roster, dict):
        # Coerce to plain {str: bool}.
        clean = {str(k): bool(v) for k, v in roster.items()}
        _write_key("roster", clean)
    if isinstance(routing, dict):
        clean_r = {
            str(k): str(v)
            for k, v in routing.items()
            if str(k) in _VALID_TIERS and isinstance(v, str) and v.strip()
        }
        _write_key("routing", clean_r)


def resolve_tier_model(tier: str, default: Optional[str] = None) -> Optional[str]:
    """Return the persisted model id for *tier*, or *default*.

    Fully fail-open: returns *default* when the store is empty, unavailable, the
    tier is unknown, or the persisted value is missing/blank.  This is the read
    used on the agent-creation hot path, so callers keep current behavior until a
    routing is saved.
    """
    if tier not in _VALID_TIERS:
        return default
    routing = _read_key("routing")
    if not isinstance(routing, dict):
        return default
    val = routing.get(tier)
    if isinstance(val, str) and val.strip():
        return val
    return default


def resolve_tier_model_effective(tier: str) -> Optional[str]:
    """Resolve the model for *tier*, applying the runtime tier-default policy.

    Returns the saved routing for *tier* when present, else the tier's runtime
    default (``_TIER_RUNTIME_DEFAULT``): ``None`` for Tier 1 (keep the gateway
    default) and Opus for Tier 2. Unknown tiers yield ``None``. Best-effort.
    """
    if tier not in _VALID_TIERS:
        return None
    return resolve_tier_model(tier, default=_TIER_RUNTIME_DEFAULT.get(tier))
