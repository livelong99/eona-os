---
name: web-search
description: Search the web via the self-hosted SearXNG instance (free, private). Use for any current-events or external-fact lookup.
---

# Web Search (SearXNG)

Query the local SearXNG container — no paid API, no data sold. Replaces Firecrawl/Tavily/Exa.

## Endpoint
- Base URL: `http://searxng:8080` (from inside the Docker network) or `http://127.0.0.1:8080` (host).
- JSON is enabled in `infra/searxng/settings.yml` (`search.formats: [html, json]`).

## How to call
```bash
curl -sG "${SEARXNG_URL:-http://searxng:8080}/search" \
  --data-urlencode "q=<query>" \
  --data-urlencode "format=json" \
  --data-urlencode "language=en" \
  | jq '.results[] | {title, url, content}'
```

## Procedure
1. Build a focused query from the task. Prefer specific terms.
2. Call the endpoint; take the top 3–8 results.
3. For any result you need the full text of, hand the URL to the `web-scrape` skill.
4. Cite sources (title + URL) in your answer; never present a search snippet as verified fact without the source.

## Guardrails
- Non-sensitive queries only contain what you'd type into a public search box.
- If SearXNG returns no JSON, confirm the container is up (`docker compose ps searxng`) and that
  `format: json` is enabled.
