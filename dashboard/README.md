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
- **3 screen archetypes:** Chat (Claude/Gemini/Local + tier badge), Board (Kanban + live
  `task_events` ticker), Graph (Memory "galaxy").
- **Views:** Mission Control launcher, Prompt Foundry (brief → Google Flow prompt output), Goal Mode.
- **Offline-first:** `src/lib/hermes.ts` talks to `127.0.0.1:8642`; when the gateway is down it falls back to
  clearly-labeled mock data, so the UI is demonstrable before Phase 1 is run.

## Wire to real Hermes
The client targets the Hermes **API server** (`127.0.0.1:8642`, `hermes gateway run`):
- `GET /health` — gateway health
- `POST /v1/chat/completions` — OpenAI-compatible chat (agent tabs)
- `POST /v1/runs` + SSE `GET /v1/runs/{id}/events` — async runs + lifecycle stream (Goal Mode)

Kanban + the memory graph are **not** on the 8642 API server. They live in the Hermes **dashboard
backend** (`:9119`, auth-gated: `/api/sessions`, WS `/api/ws`) or the kanban CLI/DB — so `getTasks()` and
`getMemory()` in `src/lib/hermes.ts` use mock data with a TODO to wire :9119 next.

## Layout / structure
```
src/app/        layout, globals (theme), page (shell + view router)
src/lib/        types, nav (agents + nav config), hermes (client), mock
src/components/  Sidebar, ui/ (AgentIcon, TierBadge, LivePill, Icon), views/
```
Backend rule: all data via the Hermes REST/WS API — no direct provider calls from the browser.

See `../docs/architecture.md` §4.D.
