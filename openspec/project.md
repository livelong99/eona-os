# OpenSpec Project Conventions — Eona OS

> Standing context every OpenSpec change builds on. The deep end-to-end briefing lives in
> `project-context.md` (workspace root); this file is the conventions layer for spec-driven changes.

## Project

**Eona OS** (slug `agent-home`) — a local-first, Claude-subscription-powered orchestration platform for
AI agents: a React 19/Vite mission-control dashboard over a forked Hermes Agent (FastAPI) engine that
delegates every turn to the host `claude` CLI, with an Obsidian vault + Qdrant as shared memory, all in
Docker on `127.0.0.1`. See `project-context.md` and `docs/architecture.md` (the latter predates the
Next.js→Vite and multi-provider→Claude-only migrations — defer to `project-context.md`).

## Tech stack

- **Dashboard:** Vite 6, React 19, TypeScript 5.6 (strict), Tailwind v4, React Router 7, three.js + ogl,
  `react-markdown`, `lucide-react`, `clsx`/`tailwind-merge`. No Framer Motion; no global state lib; plain `fetch`.
- **Engine:** Python 3.11–3.13, FastAPI, SQLite (WAL), fork of `NousResearch/hermes-agent`. OpenAI-compatible
  API on :8642. Execution delegated to host `claude` CLI via `claude_code` runtime. Exact-pinned deps.
- **Infra:** Docker Compose v2 (`hermes`, `dashboard`, `searxng`, `crawl4ai`, `qdrant`), all on 127.0.0.1.
  Secrets in `~/.hermes/.env`. Self-hosted SearXNG (search) + Crawl4AI (scrape) + Qdrant (vectors).

## Structure

- `dashboard/src/{screens,components,lib}/` — SPA. `dashboard-legacy-nextjs/` is retired (do not touch).
- `engine/{agent,gateway,cron,hermes_cli,tools,transports,schemas}/` — the fork.
- `hermes/{config.yaml,profiles,skills}/` — non-secret config, seeded to `~/.hermes/` on install.
- `scripts/` — install/doctor/bridge/index/cron ops. `infra/` — SearXNG. `docs/` — architecture & runbooks.
- `tests/` — pytest + tool-manifest validation. `.claude/skills/` — Agent OS tools (mounted to `/opt/skills`).

## Coding conventions

- **Conventional Commits** (`feat/fix/docs/test/chore/refactor`). One focused commit per logical change.
- **Dashboard:** strict TS (the build *is* the type gate — `tsc -b && vite build`); functional components +
  hooks; per-screen state, no global store; `fetch` against `/api/hermes`; **cache-bust artifact reads**
  (`?_t=Date.now()`); use `cn()` for classes; dark glass theme tokens from `src/index.css`. UX/Frontend use the
  `ui-ux-pro-max` / `frontend-design` skills + the `magic` (21st.dev) MCP when available.
- **Engine:** Python type hints; extend via **skills** (`SKILL.md` [+ `tool.yaml`]), do **not** patch the fork;
  keep core deps exact-pinned; new tools validate against `engine/schemas/tool_manifest.schema.json`.
- **Files under ~500 lines.** Validate input at system boundaries. Never log/commit secrets.

## Testing & verification

- **Dashboard:** `cd dashboard && npm run typecheck && npm run build`.
- **Engine:** `cd engine && python -m compileall .` (syntax) and `pytest` where tests exist (`tests/`).
- **Stack health:** `scripts/doctor.sh` (read-only: 127.0.0.1-only bindings, no plaintext secrets, auth gates).
- CI (`.github/workflows/ci.yml`) runs the dashboard typecheck+build and an engine compile check on push/PR to `main`.

## Security & local-first rules

- Never bind `0.0.0.0` without TLS + auth. Keep secrets in `~/.hermes/.env` — out of git **and** the vault.
- Run `scripts/doctor.sh` after any config/infra change. Enabling a messaging platform exposes the agent —
  pairing + `*_ALLOWED_USERS`; never `GATEWAY_ALLOW_ALL_USERS=true` on a reachable bot.
- **Never** run `git commit`/`git push` or other irreversible/outward actions without explicit user approval.
- Honor the vault `CLAUDE.md`: append/patch notes, never delete/overwrite; preserve `[[wikilinks]]`; PARA placement.

## How changes are made here (OpenSpec flow)

1. A **feature** = one OpenSpec change under `openspec/changes/{slug}/`: `proposal.md` (Why/What/Impact),
   `design.md` (technical decisions), `tasks.md` (implementation checklist), and `specs/{capability}/spec.md`
   (requirement **deltas**: `## ADDED/MODIFIED/REMOVED Requirements` → `### Requirement:` (SHALL) →
   `#### Scenario:` WHEN/THEN). Gate questions for the feature live in `qna.json`.
2. Design and sprint plans require **explicit user approval** (gates) before implementation.
3. Established truth lives in `openspec/specs/{capability}/spec.md`; a feature deltas against it, and on
   completion the deltas are folded back into the established specs.
4. Implementation is story-by-story under Architect review; findings logged under `reviews/{feature}/`.
