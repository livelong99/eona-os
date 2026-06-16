# Dashboard (`localhost:3737`)

Next.js + Tailwind command surface over the Hermes gateway. **Phase 3** deliverable — not yet scaffolded.

## Scaffold (when starting Phase 3)
```bash
npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint
# run on the Agent OS convention port:
npm run dev -- -p 3737
```

## Layout (matches docs/reference/montages/)
- Dark theme; fixed left sidebar: `LOCAL · STUDIO` / `Agentic OS` wordmark, three groups, gradient agent icons,
  user/vault chip pinned bottom.
- **WORKSPACE:** Mission Control · Kanban (board archetype, WebSocket `task_events`).
- **AGENTS:** Claude (Claude Code panel) · Gemini · Local (Ollama) + free-cloud picker; per-chat tier/privacy
  badge (flags Tier B "logged").
- **SELF:** Prompt Foundry · Memory (graph archetype) · Goal Mode.

## Backend
All data via the Hermes REST/WS API on `127.0.0.1:8642`. No direct provider calls from the browser.
3 reusable screen archetypes: **Chat**, **Board**, **Graph**.

See `../docs/architecture.md` §4.D.
