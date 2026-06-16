---
name: claude-code
description: Delegate heavy coding / multi-file agentic work to Claude Code (the premium runtime) via the host bridge. Use when Gemini/local tiers aren't strong enough.
---

# Delegate to Claude Code

Claude Code is the premium agent runtime (your subscription, no per-token cost). It runs on the **host**;
Hermes runs in Docker — so delegation goes through the host bridge (`scripts/claude-bridge.py`).

## When to use
- Multi-file refactors, real codebase edits, debugging, or agentic tasks where the cheap tier (Gemini Flash)
  or local model fails a judge check — i.e. the top of the routing escalation.
- NOT for simple Q&A or bulk text — keep those on Gemini/local.

## How to call
The bridge runs on the host at `CLAUDE_BRIDGE_URL` (default `http://host.docker.internal:8765`) and requires
a shared token.
```bash
curl -s "${CLAUDE_BRIDGE_URL:-http://host.docker.internal:8765}/delegate" \
  -H "content-type: application/json" \
  -H "X-Bridge-Token: ${CLAUDE_BRIDGE_TOKEN}" \
  -d '{"prompt": "<the coding task, with enough context to run standalone>"}' \
  | jq '.result'
```
Returns Claude Code's JSON envelope (or `{ok:false,error}`). Subagents get no parent context, so put
everything needed in the prompt.

## Shared brain
Claude Code reads/writes the SAME Obsidian vault via its own Obsidian MCP (configured in the repo
`.mcp.json`), so its results land where every other agent can see them. Reference vault notes by path.

## Guardrails
- The bridge is token-protected and runs Claude in a fixed working dir. Start it with a strong
  `BRIDGE_TOKEN`; never expose it to an untrusted network.
- Permission mode defaults to `default`; only raise autonomy (`CLAUDE_PERMISSION_MODE`) deliberately.
