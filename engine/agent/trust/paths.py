"""Resolved filesystem locations for L1 trust state.

All trust state lives under ``get_hermes_home()/trust`` so it is isolated
per-profile and per-test (the test harness redirects HERMES_HOME to a
tempdir — see ``engine/tests/conftest.py``). Resolving lazily at call time
(never at import) keeps profile/env switches and test monkeypatches honored.
"""
from __future__ import annotations

from pathlib import Path

from hermes_constants import get_hermes_home


def trust_dir() -> Path:
    """Return ``~/.hermes/trust`` (created on demand)."""
    d = get_hermes_home() / "trust"
    d.mkdir(parents=True, exist_ok=True)
    return d


def charter_path() -> Path:
    """Path to the write-once goal charter markdown file."""
    return trust_dir() / "goal-charter.md"


def ledger_dir() -> Path:
    """Directory holding append-only Evolution-Ledger entries."""
    d = trust_dir() / "evolution-ledger"
    d.mkdir(parents=True, exist_ok=True)
    return d


def compass_log_dir() -> Path:
    """Directory holding per-tick Compass drift scores."""
    d = trust_dir() / "compass-log"
    d.mkdir(parents=True, exist_ok=True)
    return d


def golden_dir() -> Path:
    """Directory holding golden eval cases (JSON)."""
    d = trust_dir() / "golden"
    d.mkdir(parents=True, exist_ok=True)
    return d
