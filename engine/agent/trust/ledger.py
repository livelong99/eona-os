"""The Evolution Ledger — append-only provenance of every self-change (§4.2).

Each gated change produces one dated, append-only markdown entry under
``…/trust/evolution-ledger/YYYY-MM-DD-<id>.md`` recording: the change
description, the eval before/after delta, a git commit SHA (git-per-change),
the gate verdict, and a rollback pointer. Entries are **never edited** — this
is the immune system's memory (§5.5: every memory mutation is a ledger entry
with an auto-rollback token).

``auto_rollback`` is the regression response: it undoes a change via the
appropriate mechanism — the Curator's tar.gz snapshot rollback for
skill/memory trees, or ``git revert`` for committed file changes — and records
a follow-up ledger entry so the rollback itself is attributable.

Git and the Curator are wrapped, never reimplemented: ``git`` runs as a
subprocess against the change targets' repo, and skill/memory rollback
delegates to ``agent.curator_backup``. Everything degrades fail-SAFE: a
missing git repo yields ``sha=None`` (the entry still records the change), and
a rollback with no usable token returns ``(False, reason)`` rather than raising.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .paths import ledger_dir

logger = logging.getLogger(__name__)

# Rollback-token scheme. A token is ``<kind>:<payload>``:
#   curator:<backup_id>   → restore a curator skills/memory snapshot
#   curator:              → restore the newest curator snapshot
#   git:<sha>             → git revert the named commit
# Anything else is unrecognized and auto_rollback fails-safe.
_CURATOR_PREFIX = "curator:"
_GIT_PREFIX = "git:"


@dataclass(frozen=True)
class LedgerEntry:
    """One append-only Evolution-Ledger record."""

    ledger_ref: str                       # unique id (also the filename stem)
    change_description: str
    verdict: str                          # allow | warn | block
    targets: List[str] = field(default_factory=list)
    eval_before: Optional[float] = None
    eval_after: Optional[float] = None
    git_sha: Optional[str] = None
    rollback_token: Optional[str] = None
    created_at: str = ""
    kind: str = "change"                  # change | rollback
    extra: Dict[str, Any] = field(default_factory=dict)

    @property
    def eval_delta(self) -> Optional[float]:
        if self.eval_before is None or self.eval_after is None:
            return None
        return self.eval_after - self.eval_before


def _new_ref() -> str:
    return uuid.uuid4().hex[:12]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _entry_path(ref: str, when: Optional[datetime] = None) -> Path:
    when = when or datetime.now(timezone.utc)
    return ledger_dir() / f"{when.strftime('%Y-%m-%d')}-{ref}.md"


def _render_markdown(entry: LedgerEntry) -> str:
    delta = entry.eval_delta
    lines = [
        f"# Evolution-Ledger entry {entry.ledger_ref}",
        "",
        f"- **kind:** {entry.kind}",
        f"- **created_at:** {entry.created_at}",
        f"- **verdict:** {entry.verdict}",
        f"- **targets:** {', '.join(entry.targets) if entry.targets else '(none)'}",
        f"- **eval_before:** {entry.eval_before}",
        f"- **eval_after:** {entry.eval_after}",
        f"- **eval_delta:** {delta}",
        f"- **git_sha:** {entry.git_sha or '(none)'}",
        f"- **rollback_token:** {entry.rollback_token or '(none)'}",
        "",
        "## Change",
        "",
        entry.change_description.strip() or "(no description)",
        "",
        "## Metadata (JSON)",
        "",
        "```json",
        json.dumps(asdict(entry), indent=2, sort_keys=True, default=str),
        "```",
        "",
    ]
    return "\n".join(lines)


def record(
    *,
    change_description: str,
    verdict: str,
    targets: Optional[Sequence[str]] = None,
    eval_before: Optional[float] = None,
    eval_after: Optional[float] = None,
    git_sha: Optional[str] = None,
    rollback_token: Optional[str] = None,
    kind: str = "change",
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    """Append one Evolution-Ledger entry. Returns its ``ledger_ref``.

    Append-only: a fresh file is written per call; existing entries are never
    touched. Never raises on IO failure — a ledger write must not wedge the
    gate; failures are logged and an in-memory ref is still returned so the
    caller has a handle.
    """
    ref = _new_ref()
    entry = LedgerEntry(
        ledger_ref=ref,
        change_description=change_description,
        verdict=verdict,
        targets=list(targets or []),
        eval_before=eval_before,
        eval_after=eval_after,
        git_sha=git_sha,
        rollback_token=rollback_token,
        created_at=_utc_now_iso(),
        kind=kind,
        extra=dict(extra or {}),
    )
    path = _entry_path(ref)
    try:
        # x-mode: never clobber an existing entry (append-only invariant).
        with open(path, "x", encoding="utf-8") as fh:
            fh.write(_render_markdown(entry))
    except FileExistsError:
        # Astronomically unlikely uuid collision — re-ref once.
        ref = _new_ref()
        path = _entry_path(ref)
        try:
            with open(path, "x", encoding="utf-8") as fh:
                fh.write(_render_markdown(entry))
        except OSError as exc:
            logger.warning("ledger: failed to write entry %s: %s", ref, exc)
    except OSError as exc:
        logger.warning("ledger: failed to write entry %s: %s", ref, exc)
    return ref


def list_entries() -> List[Path]:
    """Return all ledger entry paths, newest filename first."""
    try:
        return sorted(ledger_dir().glob("*.md"), reverse=True)
    except OSError:
        return []


# ---------------------------------------------------------------------------
# git-per-change
# ---------------------------------------------------------------------------

def _resolve_repo(targets: Sequence[str]) -> Optional[Path]:
    """Return the git repo working dir for the first existing target, or None."""
    for t in targets:
        p = Path(t)
        candidate = p if p.is_dir() else p.parent
        try:
            res = subprocess.run(
                ["git", "-C", str(candidate), "rev-parse", "--show-toplevel"],
                capture_output=True, text=True, timeout=10,
                stdin=subprocess.DEVNULL,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if res.returncode == 0 and res.stdout.strip():
            return Path(res.stdout.strip())
    return None


def git_commit_change(
    targets: Sequence[str], message: str
) -> Optional[str]:
    """Stage *targets* and commit them, returning the commit SHA.

    Degrades fail-SAFE: returns ``None`` when there is no git repo, nothing
    staged, or git is unavailable. A ``None`` SHA means "the change is
    recorded in the ledger but not git-pinned" — the entry is still valid.
    """
    targets = [t for t in targets if t]
    if not targets:
        return None
    repo = _resolve_repo(targets)
    if repo is None:
        logger.debug("ledger: no git repo for targets %s; skipping commit", targets)
        return None
    try:
        add = subprocess.run(
            ["git", "-C", str(repo), "add", "--", *targets],
            capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL,
        )
        if add.returncode != 0:
            logger.debug("ledger: git add failed: %s", add.stderr.strip())
            return None
        # Nothing to commit → no SHA, not an error.
        diff = subprocess.run(
            ["git", "-C", str(repo), "diff", "--cached", "--quiet"],
            capture_output=True, text=True, timeout=15, stdin=subprocess.DEVNULL,
        )
        if diff.returncode == 0:
            return None  # cached diff empty
        commit = subprocess.run(
            ["git", "-C", str(repo), "commit", "-m", message],
            capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL,
        )
        if commit.returncode != 0:
            logger.debug("ledger: git commit failed: %s", commit.stderr.strip())
            return None
        sha = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=15, stdin=subprocess.DEVNULL,
        )
        if sha.returncode == 0:
            return sha.stdout.strip()
    except (OSError, subprocess.SubprocessError) as exc:
        logger.debug("ledger: git operation failed: %s", exc)
    return None


def _git_revert(sha: str, repo: Optional[Path]) -> Tuple[bool, str]:
    if repo is None:
        return False, f"no git repo to revert {sha}"
    try:
        res = subprocess.run(
            ["git", "-C", str(repo), "revert", "--no-edit", sha],
            capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"git revert failed to run: {exc}"
    if res.returncode == 0:
        return True, f"reverted {sha}"
    return False, f"git revert {sha} failed: {res.stderr.strip()}"


# ---------------------------------------------------------------------------
# auto-rollback
# ---------------------------------------------------------------------------

def auto_rollback(
    rollback_token: Optional[str],
    *,
    targets: Optional[Sequence[str]] = None,
    reason: str = "regression",
) -> Tuple[bool, str]:
    """Undo a change identified by *rollback_token*. Records a rollback entry.

    Token scheme (see module docstring): ``curator:<id>`` restores a Curator
    snapshot, ``git:<sha>`` reverts a commit. Returns ``(ok, message)``.
    Fail-SAFE: an unrecognized/empty token returns ``(False, reason)`` and
    never raises.
    """
    if not rollback_token:
        return False, "no rollback token"

    ok = False
    message = ""
    if rollback_token.startswith(_CURATOR_PREFIX):
        backup_id = rollback_token[len(_CURATOR_PREFIX):].strip() or None
        try:
            from agent import curator_backup
            ok, message, _path = curator_backup.rollback(backup_id)
        except Exception as exc:  # noqa: BLE001 — rollback must not raise
            logger.warning("ledger: curator rollback failed: %s", exc)
            ok, message = False, f"curator rollback error: {exc}"
    elif rollback_token.startswith(_GIT_PREFIX):
        sha = rollback_token[len(_GIT_PREFIX):].strip()
        repo = _resolve_repo(list(targets or [])) if targets else _resolve_repo(["."])
        ok, message = _git_revert(sha, repo)
    else:
        return False, f"unrecognized rollback token: {rollback_token!r}"

    # Record the rollback itself so it is attributable (append-only).
    record(
        change_description=f"auto-rollback ({reason}): {message}",
        verdict="warn" if ok else "block",
        targets=list(targets or []),
        rollback_token=rollback_token,
        kind="rollback",
        extra={"rollback_ok": ok},
    )
    return ok, message


def make_curator_token(backup_id: Optional[str] = None) -> str:
    """Build a curator rollback token from a snapshot id (or newest if None)."""
    return f"{_CURATOR_PREFIX}{backup_id or ''}"


def make_git_token(sha: str) -> str:
    """Build a git rollback token from a commit SHA."""
    return f"{_GIT_PREFIX}{sha}"
