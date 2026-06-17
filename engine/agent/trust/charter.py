"""The immutable, write-once goal charter (architecture §6.2).

The charter is the thing the agent is *measured against*. It is **write-once**:
a no-agent path may create it, but any subsequent modification requires explicit
human action outside the autonomous loop. The agent can *read* the charter to
align (Compass scores every tick against it); it cannot *rewrite* the thing it
is measured against. This closes the obvious self-modification escape hatch in
L5 (§6.2 / §5.6).

Enforcement here is in-process: ``create`` refuses to overwrite an existing
charter, and a SHA-256 fingerprint makes tampering evident to the Compass. The
charter file is also marked read-only on disk (best-effort) so a casual
autonomous ``write`` is refused by the OS. True out-of-band immutability (a
human-only commit path) is an open architecture question (§6 risk 8) and is
deferred — this module gives the in-loop guarantee plus tamper-evidence.
"""
from __future__ import annotations

import hashlib
import logging
import os
import stat
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .paths import charter_path

logger = logging.getLogger(__name__)


class CharterImmutableError(RuntimeError):
    """Raised when an autonomous path attempts to overwrite the charter."""


@dataclass(frozen=True)
class Charter:
    """A loaded goal charter plus its tamper-evidence fingerprint."""

    text: str
    fingerprint: str          # sha256 of the text, hex
    path: str
    created_at: Optional[str] = None

    @property
    def exists(self) -> bool:
        return bool(self.text)


def _fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load() -> Optional[Charter]:
    """Load the charter, or ``None`` if none has been created yet."""
    path = charter_path()
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("charter: failed to read %s: %s", path, exc)
        return None
    created_at = None
    try:
        created_at = datetime.fromtimestamp(
            path.stat().st_ctime, tz=timezone.utc
        ).isoformat()
    except OSError:
        pass
    return Charter(
        text=text,
        fingerprint=_fingerprint(text),
        path=str(path),
        created_at=created_at,
    )


def create(text: str, *, allow_human_override: bool = False) -> Charter:
    """Create the charter. Write-once.

    Refuses to overwrite an existing charter with ``CharterImmutableError``
    unless ``allow_human_override`` is explicitly set — that flag models the
    out-of-band human write path and must never be passed by an autonomous
    caller. The created file is marked read-only on disk (best-effort).
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("charter text is empty")

    path = charter_path()
    if path.exists() and not allow_human_override:
        raise CharterImmutableError(
            f"goal charter already exists at {path} and is write-once; "
            "modifying it requires explicit human action outside the "
            "autonomous loop (§6.2)"
        )

    # If overriding, clear the read-only bit first so the write can land.
    if path.exists() and allow_human_override:
        try:
            path.chmod(stat.S_IWUSR | stat.S_IRUSR)
        except OSError:
            pass

    path.write_text(text, encoding="utf-8")

    # Best-effort read-only marker so a casual autonomous overwrite is
    # refused by the OS as well as by ``create``.
    try:
        path.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
    except OSError:
        pass

    logger.info("charter: created write-once goal charter at %s", path)
    return Charter(
        text=text,
        fingerprint=_fingerprint(text),
        path=str(path),
        created_at=datetime.now(timezone.utc).isoformat(),
    )


def create_if_absent(text: str) -> Charter:
    """Create the charter only if absent; otherwise return the existing one.

    Never raises ``CharterImmutableError`` — the no-op-when-present semantics
    are exactly what a startup/bootstrap path wants.
    """
    existing = load()
    if existing is not None:
        return existing
    return create(text)


def verify(charter: Charter) -> bool:
    """Re-read the on-disk charter and confirm it still matches *charter*'s
    fingerprint. False means the charter was tampered with out from under us —
    the Compass treats that as a hard drift breach.
    """
    current = load()
    if current is None:
        return False
    return current.fingerprint == charter.fingerprint


def is_read_only() -> bool:
    """True when the charter file exists and carries no owner-write bit."""
    path = charter_path()
    if not path.exists():
        return False
    try:
        mode = path.stat().st_mode
    except OSError:
        return False
    return not bool(mode & stat.S_IWUSR)
