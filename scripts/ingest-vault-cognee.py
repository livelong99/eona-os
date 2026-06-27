#!/usr/bin/env python3
"""Ingest the scoped Obsidian vault into Cognee (the graph "brain").

Companion to ``scripts/index-vault.py`` (the Qdrant indexer): same stdlib-only
(``urllib``) shape, same PARA/exclude filtering, but the target is the **Cognee**
graph store instead of Qdrant. It walks the vault's genuine notes, POSTs each to
Cognee's ``/add`` (the "remember" step), then triggers a single ``/cognify`` pass
that extracts entities + typed relationships into the knowledge graph that backs
``GET /v1/memory/cognee/graph`` and the Cognee recall lane.

This is a **one-time / periodic batch** — NOT a per-turn cost. ``cognify`` is the
expensive step (an LLM pass per document); ``/add`` is local. Run it after the
``cognee`` compose profile is up and the vault has changed.

Usage:
  python3 scripts/ingest-vault-cognee.py                      # (re)ingest the vault
  python3 scripts/ingest-vault-cognee.py --query "routing?"   # smoke-test recall

Env:
  COGNEE_URL          Cognee REST base. Default http://127.0.0.1:8801 — the
                      compose HOST publish (cognee is published on 127.0.0.1:8801
                      → container :8000). In-container callers set
                      COGNEE_URL=http://cognee:8000.
  VAULT_DIR /
  HERMES_VAULT_PATH   Vault root to ingest. Default the agent-home workspace.
  COGNEE_DATASET      Cognee dataset name. Default "vault".
  COGNEE_LLM_API_KEY  The per-document cognify LLM key. NOT read by this script —
                      it is consumed by the *cognee* service (its LLM_API_KEY,
                      sourced from ~/.hermes/.env) during the /cognify pass. Set
                      it in ~/.hermes/.env; it is only needed when the `cognee`
                      compose profile is enabled. cognify FAILS without it.

The vault is the source of truth; Cognee is a derived, rebuildable index — this
script only READS the vault and WRITES to Cognee, never the reverse.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Host-side default uses 8801 (the compose host publish; the in-container service
# is cognee:8000). In-container callers set COGNEE_URL=http://cognee:8000.
COGNEE_URL = os.environ.get("COGNEE_URL", "http://127.0.0.1:8801").rstrip("/")
VAULT_DIR = Path(
    os.environ.get(
        "VAULT_DIR",
        os.environ.get(
            "HERMES_VAULT_PATH",
            os.path.expanduser("~/Documents/Obsidian/Vault/10_Projects/agent-home"),
        ),
    )
)
DATASET = os.environ.get("COGNEE_DATASET", "vault")

# Exclude rules mirror gateway/platforms/vault_graph.py (the source of truth for
# "genuine notes"): tooling/generated trees, any dot-dir, and agent skill docs.
EXCLUDE_SEGMENTS = frozenset({
    "node_modules", "_bmad", "_bmad-output", ".obsidian", ".claude",
    ".git", ".swarm", ".claude-flow", ".agent", ".trash",
})
MAX_NOTE_BYTES = 512 * 1024  # skip pathologically large files (matches vault_graph)


def _post(path: str, body: dict) -> dict:
    """POST JSON to a Cognee endpoint. Raises SystemExit (non-zero) on a hard
    HTTP error, surfacing the response body for debugging."""
    url = f"{COGNEE_URL}{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} from {url}: {e.read().decode()[:400]}")
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Cannot reach Cognee at {url}: {e.reason}. Is the `cognee` compose "
            f"profile up? (docker compose --profile cognee up -d)"
        )


def _is_excluded(rel_parts: tuple[str, ...]) -> bool:
    for part in rel_parts:
        if part in EXCLUDE_SEGMENTS or part.startswith("."):
            return True
    # Skip 30_Resources/Skills (agent skill docs), as vault_graph does.
    if len(rel_parts) >= 2 and rel_parts[0] == "30_Resources" and rel_parts[1] == "Skills":
        return True
    return False


def scan_notes() -> list[Path]:
    """Genuine vault notes, applying the vault_graph PARA/exclude rules."""
    if not VAULT_DIR.is_dir():
        raise SystemExit(f"VAULT_DIR does not exist: {VAULT_DIR}")
    notes: list[Path] = []
    for path in VAULT_DIR.rglob("*.md"):
        if path.name.startswith("."):
            continue
        try:
            rel = path.relative_to(VAULT_DIR)
        except ValueError:
            continue
        if _is_excluded(rel.parts):
            continue
        notes.append(path)
    return notes


def add_note(rel_path: str, text: str) -> None:
    """Send one note to Cognee's ``/add`` (the "remember" step). Cognee is
    content-addressed, so re-adding an unchanged note is a no-op (idempotent-ish)."""
    _post("/add", {"data": text, "dataset_name": DATASET})


def cognify() -> None:
    """Trigger the single graph-extraction pass over the dataset (the LLM cost)."""
    print(f"Cognifying dataset '{DATASET}' (LLM extraction pass)…")
    _post("/cognify", {"datasets": [DATASET]})


def ingest() -> None:
    notes = scan_notes()
    print(f"Ingesting {len(notes)} notes from {VAULT_DIR} (tooling/dot dirs excluded)…")
    added = 0
    for path in notes:
        rel = path.relative_to(VAULT_DIR).as_posix()
        try:
            if path.stat().st_size > MAX_NOTE_BYTES:
                print(f"  skip (too large) {rel}")
                continue
            text = path.read_text(encoding="utf-8", errors="ignore").strip()
        except OSError as e:
            print(f"  skip (read error) {rel}: {e}")
            continue
        if not text:
            continue
        add_note(rel, text)
        added += 1
        print(f"  added {rel}")
    if added == 0:
        raise SystemExit("No notes ingested — nothing to cognify.")
    cognify()
    print(f"Done: added {added} notes to dataset '{DATASET}' and triggered cognify.")


def query(q: str, limit: int = 5) -> None:
    """Smoke-test recall against the ingested graph."""
    out = _post("/search", {"query": q, "search_type": "GRAPH_COMPLETION", "top_k": limit})
    hits = out if isinstance(out, list) else (
        out.get("results") or out.get("data") or out.get("hits") or []
    )
    if not hits:
        print("(no results — has cognify finished?)")
        return
    for hit in hits[:limit]:
        if isinstance(hit, dict):
            text = hit.get("text") or hit.get("description") or hit.get("entity") or ""
            print(f"  {str(text)[:160]}")
        else:
            print(f"  {str(hit)[:160]}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--query":
        query(sys.argv[2])
    else:
        ingest()
