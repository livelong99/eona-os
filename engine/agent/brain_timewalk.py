"""brain_timewalk.py — PARA dated-note time-walk for the Brain (L0).

Walks the PARA vault for Markdown notes whose date is <= as_of, returning
them most-recent-first. Date is resolved from (in priority order):

  1. YAML frontmatter ``created:`` field
  2. Filename prefix matching ``YYYY-MM-DD`` (e.g. ``2026-06-01-daily.md``)
  3. File mtime as a last-resort fallback

Pure stdlib — no external dependencies.
"""
from __future__ import annotations

import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

# Default vault root — same env var used by index-vault.py
_DEFAULT_VAULT = Path(
    os.environ.get(
        "VAULT_DIR",
        os.environ.get(
            "HERMES_VAULT_PATH",
            os.path.expanduser("~/Documents/Obsidian/Vault"),
        ),
    )
)

# Directories we skip when walking for notes (tooling/generated trees)
_DENY_DIRS: frozenset[str] = frozenset(
    {"node_modules", "_bmad", "_bmad-output", ".obsidian", ".git",
     ".agent", ".claude", ".swarm", ".claude-flow", ".next"}
)

# ISO date at the start of a filename: YYYY-MM-DD
_DATE_IN_FILENAME = re.compile(r"^(\d{4}-\d{2}-\d{2})")

# YAML frontmatter ``created:`` field (handles quoted and unquoted values)
_FRONTMATTER_DATE = re.compile(
    r"^created:\s*['\"]?(\d{4}-\d{2}-\d{2})['\"]?",
    re.MULTILINE,
)


def _parse_date(date_str: str) -> Optional[date]:
    """Parse YYYY-MM-DD string to date, returning None on failure."""
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        return None


def _note_date(path: Path, text: str) -> Optional[date]:
    """Extract the best date for a note.

    Priority: frontmatter created: > filename prefix > file mtime.
    """
    # 1. frontmatter
    m = _FRONTMATTER_DATE.search(text[:2000])
    if m:
        d = _parse_date(m.group(1))
        if d:
            return d

    # 2. filename
    m = _DATE_IN_FILENAME.match(path.name)
    if m:
        d = _parse_date(m.group(1))
        if d:
            return d

    # 3. mtime fallback
    try:
        mtime = path.stat().st_mtime
        return datetime.fromtimestamp(mtime, tz=timezone.utc).date()
    except OSError:
        return None


def _is_note(path: Path) -> bool:
    """Return True when the path is a real user note (not tooling/dot-dir)."""
    return not any(
        part in _DENY_DIRS or part.startswith(".")
        for part in path.parts
    )


def walk_dated_notes(
    *,
    as_of: Optional[str] = None,
    vault_dir: Optional[Path] = None,
    limit: int = 50,
    snippet_chars: int = 300,
) -> List[Tuple[str, str, str]]:
    """Walk the PARA vault and return dated notes up to ``as_of``.

    Parameters
    ----------
    as_of:
        ISO date string (``YYYY-MM-DD``). Only notes with a resolved date
        <= this value are returned.  ``None`` means today (no future notes).
    vault_dir:
        Override the vault root.  Defaults to ``VAULT_DIR`` env var or the
        hard-coded Obsidian path.
    limit:
        Maximum number of notes to return (most-recent-first).
    snippet_chars:
        How many characters of body text to include in the snippet.

    Returns
    -------
    List of ``(date_str, path_str, snippet)`` tuples, sorted
    most-recent-first.  ``date_str`` is ``YYYY-MM-DD``.
    """
    root = vault_dir or _DEFAULT_VAULT
    if not root.exists():
        return []

    cutoff: date = (
        _parse_date(as_of) or date.today()
        if as_of
        else date.today()
    )

    hits: List[Tuple[date, str, str, str]] = []  # (date, date_str, path_str, snippet)

    for path in root.rglob("*.md"):
        if not _is_note(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        note_date = _note_date(path, text)
        if note_date is None or note_date > cutoff:
            continue

        # Strip frontmatter from snippet (between leading ``---`` fences)
        body = text
        if text.startswith("---"):
            end = text.find("\n---", 3)
            if end != -1:
                body = text[end + 4:].lstrip()

        snippet = body[:snippet_chars].strip()
        hits.append((note_date, note_date.isoformat(), str(path), snippet))

    # Sort most-recent-first, then by path for determinism
    hits.sort(key=lambda t: (t[0], t[2]), reverse=True)

    return [(date_str, path_str, snippet) for _, date_str, path_str, snippet in hits[:limit]]
