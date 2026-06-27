#!/usr/bin/env python3
"""Ingest the scoped Obsidian vault into Cognee (the graph "brain").

Companion to ``scripts/index-vault.py`` (the Qdrant indexer): same stdlib-only
(``urllib``) shape, same PARA/exclude filtering, but the target is the **Cognee**
graph store instead of Qdrant. It logs in, POSTs each genuine vault note to
Cognee's ``/api/v1/add`` (the "remember" step), then triggers a single
``/api/v1/cognify`` pass that extracts entities + typed relationships into the
knowledge graph that backs ``GET /v1/memory/cognee/graph`` and the Cognee recall
lane.

This is a **one-time / periodic batch** — NOT a per-turn cost. ``cognify`` is the
expensive step (an LLM pass per document); ``/add`` just stages the file. Run it
after the ``cognee`` compose profile is up and the vault has changed.

Usage:
  python3 scripts/ingest-vault-cognee.py                      # (re)ingest the vault
  python3 scripts/ingest-vault-cognee.py --query "routing?"   # smoke-test recall

Env:
  COGNEE_URL          Cognee REST base. Default http://127.0.0.1:8801 — the
                      compose HOST publish (cognee is published on 127.0.0.1:8801
                      → container :8000). In-container callers set
                      COGNEE_URL=http://cognee:8000. The live API is under
                      ``/api/v1`` and requires a bearer token (see below).
  COGNEE_AUTH_EMAIL / COGNEE_AUTH_PASSWORD
                      Login creds. Default Cognee's auto-created
                      default_user@example.com / default_password.
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
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# Host-side default uses 8801 (the compose host publish; the in-container service
# is cognee:8000). In-container callers set COGNEE_URL=http://cognee:8000.
COGNEE_URL = os.environ.get("COGNEE_URL", "http://127.0.0.1:8801").rstrip("/")
API = f"{COGNEE_URL}/api/v1"
AUTH_EMAIL = os.environ.get("COGNEE_AUTH_EMAIL", "default_user@example.com")
AUTH_PASSWORD = os.environ.get("COGNEE_AUTH_PASSWORD", "default_password")
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

_TOKEN: str | None = None


# ---------------------------------------------------------------------------
# Cognee transport (login + bearer). The script is fail-LOUD: a hard error
# raises SystemExit (non-zero) — unlike the engine lanes, which are fail-open.
# ---------------------------------------------------------------------------

def _login() -> str:
    """Form-encoded login → bearer token. SystemExit on failure."""
    data = urllib.parse.urlencode(
        {"username": AUTH_EMAIL, "password": AUTH_PASSWORD}
    ).encode()
    req = urllib.request.Request(
        f"{API}/auth/login",
        data=data,
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            tok = json.loads(resp.read().decode()).get("access_token")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Cognee login failed: HTTP {e.code}: {e.read().decode()[:300]}")
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Cannot reach Cognee at {API}: {e.reason}. Is the `cognee` compose "
            f"profile up? (docker compose --profile cognee up -d)"
        )
    if not tok:
        raise SystemExit("Cognee login returned no access_token.")
    return tok


def _token() -> str:
    global _TOKEN
    if _TOKEN is None:
        _TOKEN = _login()
    return _TOKEN


def _post_json(path: str, body: dict) -> object:
    """Authed JSON POST to /api/v1{path}. SystemExit on a hard HTTP error."""
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json",
                 "authorization": f"Bearer {_token()}"},
        method="POST",
    )
    return _send(req, path)


def _post_multipart(path: str, fields: dict, files: list) -> object:
    """Authed multipart/form-data POST (Cognee's /add takes file parts)."""
    content_type, body = _encode_multipart(fields, files)
    req = urllib.request.Request(
        f"{API}{path}",
        data=body,
        headers={"content-type": content_type,
                 "authorization": f"Bearer {_token()}"},
        method="POST",
    )
    return _send(req, path)


def _send(req: "urllib.request.Request", path: str) -> object:
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} from {path}: {e.read().decode()[:500]}")
    except urllib.error.URLError as e:
        raise SystemExit(f"Cannot reach Cognee at {API}{path}: {e.reason}")


def _encode_multipart(fields: dict, files: list) -> tuple[str, bytes]:
    """Build a multipart/form-data body. ``files`` = list of
    ``(field_name, filename, content_bytes)``."""
    boundary = f"----cognee{time.time_ns():x}"
    out = bytearray()
    for name, value in fields.items():
        out += (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'
        ).encode()
    for field, filename, content in files:
        out += (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
            f"Content-Type: text/markdown\r\n\r\n"
        ).encode()
        out += content + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return f"multipart/form-data; boundary={boundary}", bytes(out)


# ---------------------------------------------------------------------------
# Vault scan + ingest
# ---------------------------------------------------------------------------

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
    """Stage one note via ``/api/v1/add`` (multipart file part ``data``).

    A ``Source: <vault-path>`` line is prepended so the document's vault origin
    survives into cognify and the extracted entities inherit a traceable source.
    That provenance is what the cross-brain bridge maps on — Part 2's per-node
    ``sources[]``, the search "resolve a cognee fact → its vault node", and the
    frontend Cognee node detail all depend on it (without it every cognee hit
    stays an unresolved ``cognee:<entity>``)."""
    body = f"Source: {rel_path}\n\n{text}".encode("utf-8")
    _post_multipart("/add", {"datasetName": DATASET}, [("data", rel_path, body)])


def cognify() -> None:
    """Trigger the single graph-extraction pass over the dataset (the LLM cost)."""
    print(f"Cognifying dataset '{DATASET}' (LLM extraction pass)…")
    _post_json("/cognify", {"datasets": [DATASET]})


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
    out = _post_json(
        "/recall",
        {"query": q, "searchType": "GRAPH_COMPLETION",
         "datasets": [DATASET], "topK": limit},
    )
    hits = out if isinstance(out, list) else (
        (out.get("results") or out.get("data") or out.get("hits") or [])
        if isinstance(out, dict) else []
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
