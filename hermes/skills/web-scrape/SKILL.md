---
name: web-scrape
description: Fetch a URL and get clean Markdown via the self-hosted Crawl4AI container. Use after web-search to read a page in full.
---

# Web Scrape (Crawl4AI)

Convert a page to clean Markdown using the local Crawl4AI container — free, self-hosted, no paid crawler.

## Endpoint
- Base URL: `http://crawl4ai:11235` (Docker network) or `http://127.0.0.1:11235` (host).

## How to call
```bash
# Crawl4AI exposes an HTTP API; submit a URL and read back markdown.
curl -s "${CRAWL4AI_URL:-http://crawl4ai:11235}/crawl" \
  -H "content-type: application/json" \
  -d '{"urls": ["<url>"], "f": "markdown"}' \
  | jq -r '.results[0].markdown'
```
> Verify the exact route/body against the Crawl4AI image you pinned (`/crawl` vs `/md`); the project's
> request shape can change between versions. Adjust this recipe once confirmed on first run.

## Procedure
1. Take a URL (often from the `web-search` skill).
2. Fetch markdown; trim boilerplate; keep the substantive content.
3. Summarize or extract per the task; write durable findings to the vault (append-only, dated).
4. Always keep the source URL with the extracted content.

## Guardrails
- Respect robots/ToS; this is for research, not bulk harvesting.
- Large pages: extract the relevant section rather than dumping the whole document into context.
