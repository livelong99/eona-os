#!/usr/bin/env python3
"""Index the scoped Obsidian vault into Qdrant for semantic recall.

Free stack: Gemini embeddings (your existing key) -> self-hosted Qdrant (Docker).
Stdlib only (urllib) so there is nothing to pip install.

Usage:
  GEMINI_API_KEY=... python3 scripts/index-vault.py            # (re)index the vault
  GEMINI_API_KEY=... python3 scripts/index-vault.py --query "how does routing work?"

Env:
  GEMINI_API_KEY   required
  QDRANT_URL       default http://127.0.0.1:6333
  VAULT_DIR        default the agent-home workspace folder
  EMBED_MODEL      default text-embedding-004 (768-dim)
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# Host-side default uses 6533 (the compose host publish; 6333 may be taken by
# another local Qdrant). In-container callers set QDRANT_URL=http://qdrant:6333.
QDRANT_URL = os.environ.get("QDRANT_URL", "http://127.0.0.1:6533").rstrip("/")
VAULT_DIR = Path(
    os.environ.get(
        "VAULT_DIR",
        "/Users/perkypanda/Documents/Obsidian/Vault/10_Projects/agent-home",
    )
)
EMBED_MODEL = os.environ.get("EMBED_MODEL", "gemini-embedding-001")
COLLECTION = "agent_home_vault"
DIM = 768  # gemini-embedding-001 supports outputDimensionality (we request 768)
API_KEY = os.environ.get("GEMINI_API_KEY", "")


def _post(url: str, body: dict, headers: dict | None = None) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers={"content-type": "application/json", **(headers or {})}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:  # surface the body for debugging
        raise SystemExit(f"HTTP {e.code} from {url}: {e.read().decode()[:400]}")


def _put(url: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="PUT",
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def embed(text: str, retries: int = 5) -> list[float]:
    if not API_KEY:
        raise SystemExit("GEMINI_API_KEY is required.")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{EMBED_MODEL}:embedContent?key={API_KEY}"
    )
    body = {"model": f"models/{EMBED_MODEL}",
            "content": {"parts": [{"text": text[:8000]}]},
            "outputDimensionality": DIM}
    for attempt in range(retries):
        try:
            data = json.dumps(body).encode()
            req = urllib.request.Request(
                url, data=data, headers={"content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())["embedding"]["values"]
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                wait = 2 ** attempt * 5  # 5s, 10s, 20s, 40s — free-tier backoff
                print(f"  rate-limited (429); waiting {wait}s…")
                time.sleep(wait)
                continue
            raise SystemExit(f"HTTP {e.code} from embed: {e.read().decode()[:300]}")
    raise SystemExit("embed: exhausted retries")


def ensure_collection() -> None:
    # Idempotent: skip if the collection already exists (avoids 409 Conflict).
    try:
        with urllib.request.urlopen(
            f"{QDRANT_URL}/collections/{COLLECTION}", timeout=10
        ):
            return
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    _put(f"{QDRANT_URL}/collections/{COLLECTION}",
         {"vectors": {"size": DIM, "distance": "Cosine"}})


DENY_DIRS = {"node_modules", "_bmad", "_bmad-output"}


def _is_note(p: Path) -> bool:
    # Skip tooling/generated trees and any dot-directory (.agent, .claude, .git,
    # .swarm, .claude-flow, .next, .obsidian, …) — index real notes only.
    return not any(part in DENY_DIRS or part.startswith(".") for part in p.parts)


def index() -> None:
    ensure_collection()
    notes = [p for p in VAULT_DIR.rglob("*.md") if _is_note(p)]
    print(f"Indexing {len(notes)} notes (tooling/dot dirs excluded)…")
    points = []
    for i, path in enumerate(notes):
        text = path.read_text(encoding="utf-8", errors="ignore").strip()
        if not text:
            continue
        vec = embed(text)
        time.sleep(0.5)  # gentle pacing for the free embedding tier
        points.append({
            "id": i,
            "vector": vec,
            "payload": {"path": str(path.relative_to(VAULT_DIR)),
                        "preview": text[:200]},
        })
        print(f"  embedded {path.relative_to(VAULT_DIR)}")
    if points:
        _put(f"{QDRANT_URL}/collections/{COLLECTION}/points?wait=true",
             {"points": points})
    print(f"Indexed {len(points)} notes into '{COLLECTION}'.")


def query(q: str, limit: int = 5) -> None:
    vec = embed(q)
    out = _post(f"{QDRANT_URL}/collections/{COLLECTION}/points/search",
                {"vector": vec, "limit": limit, "with_payload": True})
    for hit in out.get("result", []):
        p = hit.get("payload", {})
        print(f"{hit['score']:.3f}  {p.get('path')}\n        {p.get('preview', '')[:120]}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--query":
        query(sys.argv[2])
    else:
        index()
