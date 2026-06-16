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
import urllib.request
import urllib.error
from pathlib import Path

QDRANT_URL = os.environ.get("QDRANT_URL", "http://127.0.0.1:6333").rstrip("/")
VAULT_DIR = Path(
    os.environ.get(
        "VAULT_DIR",
        "/Users/perkypanda/Documents/Obsidian/Vault/10_Projects/agent-home",
    )
)
EMBED_MODEL = os.environ.get("EMBED_MODEL", "text-embedding-004")
COLLECTION = "agent_home_vault"
DIM = 768  # text-embedding-004
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


def embed(text: str) -> list[float]:
    if not API_KEY:
        raise SystemExit("GEMINI_API_KEY is required.")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{EMBED_MODEL}:embedContent?key={API_KEY}"
    )
    out = _post(url, {"model": f"models/{EMBED_MODEL}",
                      "content": {"parts": [{"text": text[:8000]}]}})
    return out["embedding"]["values"]


def ensure_collection() -> None:
    _put(f"{QDRANT_URL}/collections/{COLLECTION}",
         {"vectors": {"size": DIM, "distance": "Cosine"}})


def index() -> None:
    ensure_collection()
    notes = [p for p in VAULT_DIR.rglob("*.md")
             if not any(part in {"node_modules", ".next", "_bmad", ".claude"}
                        for part in p.parts)]
    points = []
    for i, path in enumerate(notes):
        text = path.read_text(encoding="utf-8", errors="ignore").strip()
        if not text:
            continue
        vec = embed(text)
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
