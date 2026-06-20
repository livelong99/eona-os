# Agent OS — Dashboard

The mission-control UI for Agent OS: a dark-glass single-page app with a top
liquid-glass dock and eight surfaces — **Home** (Aurora Orb), **Workspace**,
**Brainstorm**, **Labs**, **Memory** (3D knowledge globe), **Control**,
**Integrations**, and **Planner**.

> **Status:** UI complete, backed by mock data. Engine wiring (Hermes) is the
> next pass — see _Wiring_ below.

## Stack

- **Vite 6** + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **react-router-dom** (client routing, lazy-loaded per route)
- **three.js** (Aurora Orb, Memory globe) · **ogl** (SideRays background)
- `@/*` path alias → `src/*`

## Develop

```bash
npm install
npm run dev        # http://127.0.0.1:3737
npm run typecheck  # tsc --noEmit (strict)
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the production build locally
```

## Structure

```
src/
  App.tsx              # shell: SideRays bg + glass dock + routes (lazy)
  main.tsx             # BrowserRouter mount
  index.css            # Tailwind v4 + dark theme tokens
  screens/             # one component per route
  components/
    ui/                # glass primitives, dock, orb, markdown, terminal…
    workspace/ brainstorm/ labs/ control/ integrations/ memory/ planner/
  lib/                 # per-surface mock data + types (replace at wiring)
public/icons/          # dock app icons (transparent squircle PNGs)
```

All screen state is local React state over the mock data in `src/lib/*`.

## Deploy

`docker compose up dashboard` builds the static bundle and serves it with nginx
on `127.0.0.1:3737` (`Dockerfile` + `nginx.conf`, SPA fallback for client routes).

## Wiring (next pass)

The data layer is isolated in `src/lib/*`. To go live:

1. Replace the mock arrays with a typed client that calls the engine API.
2. Enable the `/api/hermes/` proxy in `nginx.conf` (→ `http://hermes:8642`) and a
   matching `server.proxy` in `vite.config.ts` for dev.

The previous Next.js dashboard — which already contains a working Hermes proxy
and client (`lib/hermes.ts`, `voice.ts`, `cockpit.ts`, …) — is preserved at
`../dashboard-legacy-nextjs/` as the reference for that work.
