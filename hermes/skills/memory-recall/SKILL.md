---
name: memory-recall
description: Semantic recall over the Obsidian vault via Qdrant. Use to find relevant past notes when keyword search in the vault misses.
---

# Memory Recall (Qdrant)

Vector search over the vault, complementing the Obsidian MCP's exact/text search. Embeddings via Gemini,
stored in the self-hosted Qdrant container (both free).

## Index (run when notes change; or on a cron)
```bash
GEMINI_API_KEY=$GEMINI_API_KEY python3 scripts/index-vault.py
```

## Recall
```bash
GEMINI_API_KEY=$GEMINI_API_KEY python3 scripts/index-vault.py --query "<question>"
# → ranked note paths + previews
```
Or query Qdrant directly (collection `agent_home_vault`) at `http://qdrant:6333` once you have an embedding.

## Procedure
1. Prefer the Obsidian MCP for exact/recent lookups; use this when meaning matters more than keywords.
2. Take the top hits, open the full notes via the Obsidian MCP, then answer with citations (note paths).
3. Never present a recalled snippet as fact without naming its source note.

## Guardrails
- Index only the scoped `10_Projects/agent-home` workspace (the script already excludes tooling dirs).
- Embeddings go to Gemini; do not index secret-bearing files (none should exist in the vault anyway).
