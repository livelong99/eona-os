# Dashboard (`127.0.0.1:3737`)

Next.js 16 + Tailwind v4 command surface over the Hermes gateway. Phase 3 — **scaffolded and running**.

## Run
```bash
npm install
npm run dev      # http://127.0.0.1:3737  (localhost-only by design)
npm run build    # production build / typecheck / lint
```
Optionally copy `.env.local.example` → `.env.local` to point at a non-default gateway.

## What works now
- Full dark **shell**: `LOCAL · STUDIO` / `Agentic OS` wordmark, three nav groups, gradient agent icons,
  vault chip + gateway live/offline pill.
- **3 screen archetypes:** Chat (Claude/Gemini/Local + tier/privacy badge), Board (Kanban + live
  `task_events` ticker), Graph (Memory "galaxy").
- **Views:** Mission Control launcher, Prompt Foundry (brief → Google Flow prompt output), Goal Mode.
- **Offline-first:** `src/lib/hermes.ts` talks to `127.0.0.1:8642`; when the gateway is down it falls back to
  clearly-labeled mock data, so the UI is demonstrable before Phase 1 is run.

## Wire to real Hermes
The client expects these gateway endpoints (verify/adjust against the installed Hermes API):
`GET /` (health), `GET /api/kanban/tasks`, `GET /api/memory/graph`, `POST /api/agents/:id/chat`,
`WS /task_events`. Map them in `src/lib/hermes.ts`.

## Layout / structure
```
src/app/        layout, globals (theme), page (shell + view router)
src/lib/        types, nav (agents + nav config), hermes (client), mock
src/components/  Sidebar, ui/ (AgentIcon, TierBadge, LivePill, Icon), views/
```
Backend rule: all data via the Hermes REST/WS API — no direct provider calls from the browser.

See `../docs/architecture.md` §4.D.
