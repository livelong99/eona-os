---
title: Agent Home — System Architecture
created: 2026-06-16
modified: 2026-06-16
tags: [architecture, agent-os, hermes, obsidian]
status: active
related: [design-research]
---

# Agent Home — System Architecture

> Author: Winston (System Architect)
> Sources: [[design-research]], `docs/reference/*` (architecture spec, transcript, 70 UI screenshots)
> Status: **approved** · v1 scope

## 1. Context

The "Agentic OS / Local Studio" sold inside Julian Goldie's AI Profit Boardroom is **not an engine** — it is a
thin Next.js + Tailwind dashboard (`localhost:3737`) skinning genuinely open-source backends, with **Hermes
Agent (Nous Research, MIT)** doing the real orchestration: a SQLite Kanban dispatcher, `delegate_task`
sub-agents, a `/goal` judge loop, three-tier memory, and an Obsidian MCP. Every "agent" tab is a branded
façade over a real provider reached over OpenAI-/Anthropic-compatible APIs.

**Agent Home** is our own version with the same functionality. We take the **orchestrator-skin** route: adopt
Hermes as the conductor (don't reinvent a proven MIT engine) and build our own dashboard, agent profiles,
integrations, and branding on top. The outcome is a locally-hosted "mission control" on an Apple Silicon Mac
where multiple model-backed agents work as a team from one shared Obsidian-vault brain, and where the content
surface produces maximally-detailed prompts we paste into **Google Flow** for image/video generation.

## 2. Locked Decisions

| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| 1 | Build philosophy | **Orchestrator skin** — reuse Hermes as engine | Weeks not months; depend on upstream Hermes |
| 2 | Stack | **Python** engine (Hermes/FastAPI) + **Next.js + Tailwind** dashboard | Mirrors Hermes' own arch; richest MCP ecosystem |
| 3 | Deployment | **Local Mac (Apple Silicon)** via **Docker Compose** | Self-hosted, reproducible; all services are containers (no local model runtime) |
| 4 | Providers | **Claude Code (PRIMARY) → Gemini (fallback) → OpenRouter (bulk/last-resort)** | Claude is first choice (subscription); Gemini only when Claude unavailable; OpenRouter replaces local. No Ollama. |
| 5 | Enterprise tools | **Self-hosted OSS via Docker** — SearXNG (search), Crawl4AI (scrape), Qdrant (vector memory) | No paid SaaS (Firecrawl/etc.); any AI capability uses Claude/Gemini |
| 6 | v1 pillars | Multi-agent orchestration · Shared Obsidian memory · dashboard · **Prompt Foundry** | Studio v1 = Google Flow prompts, not paid media APIs |

**Cost principle:** paid = **Claude Code subscription** + **Gemini API key** + **OpenRouter** (use its free/cheap
models). Everything else is free/OSS, self-hosted via Docker. Hermes itself is free (MIT). No local model runtime.

**Deferred:** paid-only providers (Kimi K2, Grok, OpenRouter, GLM, Fusion), paid media APIs (Grok Imagine /
MiniMax / HeyGen), paid search SaaS (Firecrawl), SEO auto-publish (Netlify / WordPress), VPS / remote topology,
OpenClaw / Antigravity / Codex tabs.

## 3. High-Level Architecture (5-layer stack)

All containers run under one **Docker Compose** stack bound to `127.0.0.1`. **Claude Code runs host-native**
(the primary executor, reached via the bridge); there is **no local model runtime** (Ollama removed).

```
┌──────────────────────────────────────────────────────────────────┐
│ L4  COMMAND SURFACE — Next.js + Tailwind dashboard :3737  [docker] │
│     Mission Control · Kanban · Goal Mode · Agents · Memory graph    │
│     · Prompt Foundry (Studio)                                       │
└───────────────▲───────────────────────────────────────────────────┘
                │ REST + SSE (127.0.0.1 only)
┌───────────────┴───────────────────────────────────────────────────┐
│ L3  ENGINE — Hermes Agent gateway (free, MIT)  :8642     [docker]   │
│     Kanban dispatcher (SQLite, WAL, task_events)                    │
│     Profiles · delegate_task · async "Hive" · /goal judge loop      │
│     · MCP clients · skills (SKILL.md)                               │
│   ══ PRIMARY ══▶ Claude Code CLI (subscription; host bridge + tab)  │
└──┬──────────────┬───────────────────────────────┬─────────────────┘
   │ MCP :27123    │ provider routing               │ OSS tools (docker)
┌──┴─────────┐ ┌───┴───────────────────────────┐ ┌─┴────────────────────┐
│ L1 MEMORY   │ │ L2 PROVIDERS (work tier)       │ │ TOOLS                 │
│ Obsidian    │ │ 1 Claude Code  — PRIMARY        │ │ SearXNG  (search)     │
│ vault + MCP │ │ 2 Gemini (API) — fallback+engine│ │ Crawl4AI (scrape)     │
│ + Qdrant    │ │ 3 OpenRouter   — bulk/last-resort│ │ Qdrant   (vector mem) │
└─────────────┘ └─────────────────────────────────┘ └───────────────────────┘
  L0 Capture (optional, later): OMI/voice → vault
```

**Data flow:** a brief is dropped as a Kanban card or `/goal`; Hermes' in-gateway dispatcher assigns it to
Gemini profiles and/or delegates coding/agentic jobs to the Claude Code CLI; agents call the OSS tools
(SearXNG/Crawl4AI/Qdrant) over MCP; outputs are written back to the Obsidian vault, which every other agent
reads. The dashboard is a viewer/controller over Hermes' REST API plus a Claude Code panel.

## 4. Components

### A. Engine — Hermes Agent (adopt, configure, extend; do not fork)
- Install via official `install.sh`; state in `~/.hermes`. Run `hermes gateway start` (REST/WS on **:8642**),
  `hermes kanban init` (SQLite board), `dispatch_in_gateway: true`.
- **Profiles** = our agents (`judge`, `researcher`, `writer`, `seo`, `prompt-writer`, `prompt-judge`), each =
  model + toolset + persona in `~/.hermes/config.yaml`.
- Orchestration primitives we **expose, not rebuild:** Kanban dispatcher; `delegate_task`
  (`delegation.max_concurrent_children`, `max_spawn_depth`); async background delegation (the "Hive"); Goal
  Mode (`/goal` + judge, `goals.max_turns`).
- **Extension seam:** add capabilities as Hermes **skills** (`SKILL.md`) + **MCP add-ons**, never by patching
  the engine — stays on the upstream upgrade path.

### B. Memory — Obsidian vault (shared brain)
- Reuse the existing Obsidian vault (path configured via `HERMES_VAULT_PATH`, e.g.
  `~/Documents/Obsidian/Vault`), scoped to the `10_Projects/agent-home/` workspace so agents
  never roam the whole vault.
- Wire via the **Obsidian Local REST API plugin** (`:27123`) and an **Obsidian MCP server** so any MCP-aware
  agent shares one brain. Hermes stores `MCP_OBSIDIAN_API_KEY` in `~/.hermes/.env` + an `mcp_servers.obsidian`
  block in `config.yaml`.
- Layer on Hermes' built-in 3-tier memory (`memory.md`/`user.md`; FTS5 session search; pluggable providers).
- **Semantic recall via self-hosted Qdrant** (Docker, free): a vector index over vault notes for similarity
  search, replacing any paid memory SaaS. Embeddings via Gemini or a local model — no paid embedding service.
- **Guardrail:** secrets stay OUT of the vault; append-only dated summaries; honor PARA + `[[wikilink]]`
  conventions and the vault `CLAUDE.md` rules (never delete/overwrite notes).

### C. Provider mesh — Claude-primary, three roles
Work routes to Claude first; Gemini is the fallback; OpenRouter is the bulk/last-resort tier. No local models.

| Role | Provider | Cost | Use |
|------|----------|------|-----|
| **Primary** | **Claude Code CLI** (subscription) | no per-token | First choice for all real/agentic work, via the host bridge + `claude-code` skill; also its own dashboard tab |
| **Fallback** | **Gemini** Pro/Flash (Google API) | API key (free tier + paid) | Used when Claude Code is unavailable; **also Hermes' own engine model** (orchestration/judge) since Claude is a CLI, not an API |
| **Bulk / last-resort** | **OpenRouter** (`openrouter/auto` + cheap/free models) | OpenRouter key (free/cheap) | High-volume/cheap batch work; final fallback after Gemini. Replaces the removed local tier |

**Why Gemini is also the engine model:** Claude Code is a CLI runtime, not an API provider, so Hermes' own
agent loop can't run *on* Claude. Hermes runs on Gemini and **delegates execution to Claude Code first** (the
`claude-code` skill / bridge). That delivers "Claude primary" without an Anthropic API bill.

**Claude integration:** reachable (1) as a dashboard tab and (2) by Hermes via the host bridge
(`scripts/claude-bridge.py`, token-gated). It shares the brain via the Obsidian MCP in Claude Code's `.mcp.json`.

**Routing policy:** Claude Code (primary) → Gemini (fallback) → OpenRouter (bulk/last-resort). Hermes'
engine-level `fallback` is set to OpenRouter for resilience when Gemini errors/rate-limits.

### D. Dashboard — Next.js + Tailwind (`localhost:3737`)
- Standalone Next.js shell over Hermes' REST/WS API (design control; we forgo Hermes' plugin-inherited
  auth/themes — revisit if auth becomes painful).
- **Layout (matched to `docs/reference/montages/`):** dark theme; fixed left sidebar with the
  `LOCAL · STUDIO` / `Agentic OS` wordmark, three grouped sections, circular gradient agent icons, and a
  user/vault status chip pinned bottom.
- **Nav (v1):**
  - **WORKSPACE:** Mission Control, Kanban (triage→todo→ready→running→blocked→done).
  - **AGENTS:** Claude (Claude Code panel — primary), Gemini (fallback), OpenRouter (bulk). Each is its own
    backend session — switching tabs never stops background work. A **role badge** shows Primary / Fallback /
    Bulk.
  - **SELF:** Prompt Foundry, Memory (purple knowledge-"galaxy" graph), Goal Mode.
- **Screen archetypes (3):** Chat (Claude/Gemini/Local), Board (Kanban), Graph (Memory). Prompt Foundry = a
  Chat variant with a structured prompt-output panel.
- **API surface (verified against Hermes source):** the dashboard talks to the OpenAI-compatible **API
  server on :8642** — `GET /health`, `POST /v1/chat/completions`, `POST /v1/runs` + **SSE**
  `GET /v1/runs/{id}/events`. Kanban + memory-graph are **not** on :8642; they live in Hermes' own
  **dashboard backend :9119** (`/api/sessions`, WS `/api/ws`, auth-gated) or the kanban CLI/DB — wired in a
  later pass (today those views use mock data). **Persistence:** local save of nav customizations.

### E. Prompt Foundry — Studio v1 (content pillar)
- Generates **maximally-detailed image & video prompts** for **Google Flow** (Veo/Imagen) instead of calling
  paid media APIs. A Hermes skill + dashboard tab.
- A per-model **prompt-rules registry** (mirrors the `gds-agent-brand-maker` pattern) emits Flow-tuned prompts:
  shot/scene structure, camera, lighting, style, negatives, aspect ratio, duration, cross-shot continuity.
  Inputs (brief/references) come from the vault; outputs saved back as dated notes with `[[wikilinks]]`.
- A `prompt-writer` + `prompt-judge` (Goal Mode) loop iterates to a quality bar. Forward-compatible with a
  later media-API phase.

### F. Tools — self-hosted OSS (Docker), exposed to agents via MCP
No paid SaaS. Each is a free container wired into Hermes (and Claude Code) as an MCP tool/skill:
- **SearXNG** — self-hosted metasearch (`:8080`) for web search, replacing Firecrawl/Tavily/Exa. JSON output
  consumed by a Hermes search skill.
- **Crawl4AI** — self-hosted scrape/extract (`:11235`) for page→markdown, replacing paid crawlers.
- **Qdrant** — vector DB (`:6333`) for semantic memory over the vault (see §4.B).
- Any *AI* step (summarize, classify, extract) uses Gemini or Claude — never a paid AI API.

Implemented as Hermes skills/scripts: `hermes/skills/web-search` (SearXNG), `web-scrape` (Crawl4AI),
`memory-recall` (Qdrant) + `scripts/index-vault.py` (Gemini embeddings → Qdrant), and `claude-code`
(delegate to Claude Code via the host bridge `scripts/claude-bridge.py`). Obsidian MCP is wired into both
Hermes (`config.yaml mcp_servers`) and Claude Code (`.mcp.json`) so they share one vault brain.

## 5. Process / Runtime Model — Docker Compose (local Apple Silicon)
- **One `docker-compose.yml`** runs: `hermes` (:8642 API + :9119 dashboard backend via `HERMES_DASHBOARD=1`),
  `searxng` (:8080), `crawl4ai` (:11235), `qdrant` (:6333), `dashboard` (:3737). **Every published port is
  bound to `127.0.0.1`**. Containers may listen on `0.0.0.0` *inside* the network; host exposure is controlled
  solely by the `127.0.0.1` publish — the correct, safe pattern.
- **Hermes uses the official image** `nousresearch/hermes-agent:latest` (`command: gateway run`), not a
  locally-built image — no build-time `curl|bash`. Its data dir `/opt/data` is the host's `~/.hermes`
  (config.yaml, `.env`, sessions, memory, skills), seeded by `scripts/install.sh`.
- **Host-native (not containerized), reached via `host.docker.internal`:**
  - **Claude Code** CLI (**primary provider**) — tied to your subscription/login; invoked by Hermes via the
    token-gated bridge (`scripts/claude-bridge.py`) and surfaced as the primary dashboard tab.
  - **Obsidian** desktop + Local REST API plugin (`:27123`) — Obsidian is a GUI app; Hermes connects to it.
  - No local model runtime — Ollama was removed (it was hurting host performance); the cheap/bulk tier is
    OpenRouter (a container-reachable API).
- Always-on: Docker Desktop "start on login" + restart policies (`unless-stopped`); prevent sleep; optional
  **Tailscale** for private remote access (no public exposure).
- Single-host: Hermes Kanban & `delegate_task` are single-host by design — a "10-agent company" on one machine,
  not a cluster.

## 6. Build vs. Reuse

| We BUILD | We REUSE (free / OSS / Docker) |
|----------|----------|
| Next.js + Tailwind dashboard (:3737), 3 archetypes | Hermes Agent engine (MIT, Docker) |
| Hermes profiles (judge/researcher/writer/seo/prompt-*) | Kanban dispatcher, `delegate_task`, Goal Mode |
| Prompt Foundry skill + Google Flow prompt-rules | Obsidian Local REST API plugin + Obsidian MCP server |
| Claude-Code-as-runtime integration (CLI + MCP) | Claude Code CLI (sub), Gemini API, OpenRouter API |
| `docker-compose.yml` + tool wiring (search/scrape/vector) | SearXNG, Crawl4AI, Qdrant (Docker images) |
| Cheap-first routing + judge | Existing Obsidian vault (PARA) as shared memory |
| Setup/doctor scripts | |

**Repo layout** (`10_Projects/agent-home/`):
```
/dashboard         Next.js + Tailwind app (:3737) + Dockerfile
/hermes            config.yaml, .env.example, profiles/, skills/ (seeded into ~/.hermes)
                   skills: prompt-foundry, web-search, web-scrape, memory-recall, claude-code
/scripts           install.sh, doctor.sh, index-vault.py (Qdrant), claude-bridge.py (Claude Code)
/infra/searxng     settings.yml (JSON enabled)
docker-compose.yml  hermes + searxng + crawl4ai + qdrant + dashboard (all 127.0.0.1)
.mcp.json          Claude Code MCP servers (incl. obsidian — shared vault)
/docs              design-research.md, architecture.md (this), runbooks
```

## 7. Security (first-class)
- **Never bind 0.0.0.0** without TLS reverse proxy + auth. Local-only by default; remote = Tailscale.
- No built-in auth in Hermes/dashboard; `.env` holds keys — keep keys out of the vault and out of git; OS
  keychain/secret-vault; `doctor` checks for plaintext secrets.
- Agents have file/shell access: scope vault access to the project folder; vet every community skill (a Cisco
  test found a third-party skill exfiltrating data + prompt-injecting); enable Hermes prompt-injection guards.
- **Docker isolation:** containers run non-root where possible; only `127.0.0.1` port bindings; no secrets baked
  into images (passed via env/secrets at runtime). SearXNG/Crawl4AI/Qdrant hold no API keys.
- Honor vault `CLAUDE.md`: append/patch, never delete/overwrite; one focused commit per edit.

## 8. Phased Build Plan
1. **Stack up (Docker):** `docker compose up` brings up hermes + searxng + crawl4ai + qdrant + dashboard; add
   the Gemini + OpenRouter keys; start the Claude bridge on the host. *Gate:* gateway healthy, dashboard live
   on :3737, `/goal` four-file test passes.
2. **Memory + tools:** wire Obsidian MCP (Hermes *and* Claude Code) + Qdrant semantic index; wire SearXNG +
   Crawl4AI as Hermes search/scrape skills. Confirm Claude (primary) + Gemini (fallback) each answer a
   vault-only fact and run a live web search via SearXNG.
3. **Orchestration + dashboard:** Kanban dispatcher + swarm, Goal Mode, `delegate_task`; dashboard shows live
   Kanban, Claude tab, Gemini tab, Memory graph.
4. **Prompt Foundry:** skill + tab + prompt-rules registry + `prompt-writer`/`prompt-judge` loop; outputs to
   vault as Google Flow-ready prompts.
5. **Hardening:** `doctor` (127.0.0.1-only + no plaintext secrets), restart policies, optional Tailscale.

## 9. Verification (end-to-end)
- **Stack:** `docker compose ps` all healthy; every published port bound to 127.0.0.1; dashboard 200 on :3737.
- **Engine:** gateway healthy on :8642; `hermes chat` answers on Gemini; Kanban board created; `/goal`
  four-file test passes; an OpenRouter fallback responds when Gemini is forced to fail.
- **Providers:** a real task routes to **Claude Code first** (via the bridge); disabling the bridge falls back
  to **Gemini**; a bulk task uses **OpenRouter**. No local model is reachable (Ollama removed).
- **Memory + tools:** a vault-only fact is retrieved by Gemini AND the Claude Code session via the Obsidian
  MCP; Qdrant returns a semantic match; a SearXNG query + Crawl4AI fetch return results through Hermes.
- **Orchestration:** one brief fanned to ≥3 profiles via Kanban (+ a Claude Code delegation); parallel sessions
  confirmed; tab-switch doesn't stop background work; `task_events` renders live.
- **Dashboard:** :3737 loads WORKSPACE/AGENTS/SELF nav, Claude + Gemini tabs, live Kanban + Memory graph, nav
  customization persists across restart.
- **Prompt Foundry:** an image + a video prompt generated for a sample brief; judge loop iterates; output saved
  as a dated vault note; manual paste into Google Flow produces usable media.
- **Security:** `doctor` reports no plaintext secrets, all services on 127.0.0.1, vault access scoped, no paid
  API beyond Gemini in use.

## 10. Full feature enablement (Claude-only fork)

This section records the always-on capabilities turned on beyond the v1 base. The governing
constraint is the **always-on brain**: every turn delegates to the `claude` CLI, so 24/7 cron,
gateways, and voice require the host machine + Docker stack + Claude bridge to stay up and consume
the Claude subscription continuously.

### 10.1 Always-on substrate
- All compose services use `restart: unless-stopped`; the `hermes` service runs the full gateway
  loop (`gateway run`) which ticks cron every 60s **and** polls enabled platforms.
- The Claude bridge is a supervised launchd agent, not a manual terminal:
  `scripts/install-bridge-service.sh` installs `com.agenthome.claude-bridge` (KeepAlive + RunAtLoad).
  Enable Docker Desktop "start on login" to complete the always-on chain.

### 10.2 Autonomous skill creation (Curator)
- `curator:` block in `hermes/config.yaml` (`enabled: true`, `interval_hours: 24`). The gateway idle
  loop runs `maybe_run_curator()`; the review fork inherits the main model (→ `claude_code`).
- Claude turns can author skills directly: `skill_manage` is exposed via the `hermes-tools` MCP
  server (`engine/agent/transports/hermes_tools_mcp_server.py`). Curator only touches
  `created_by: agent` skills and never deletes (archive only).

### 10.3 24/7 background execution + tiered autonomy
- Seed jobs with `scripts/seed-cron.sh` (idempotent by name). Jobs carry an `autonomy` tier:
  - `content`/`full` → `bypassPermissions` (read/research/content; runs fully unattended).
  - `guarded`/unset (DEFAULT) → `acceptEdits` + Tirith; Bash/shell/git stay gated and scanned.
- The seam lives in `engine/cron/scheduler.py` (`_resolve_cron_permission_mode`): only full-autonomy
  jobs override `CLAUDE_RUNTIME_PERMISSION_MODE`, and those are routed to the serialized pool so the
  process-global env can't race (same guarantee as workdir jobs). `autonomy` is plumbed through
  `cron.jobs.create_job`.

### 10.4 Cross-platform gateways (Telegram + Discord + WhatsApp)
- Platform blocks live under top-level `platforms:` in `hermes/config.yaml`, shipped `enabled: false`.
  **Two-step to turn one on:** add its token(s) to `~/.hermes/.env`, flip `enabled: true`, then
  `docker compose restart hermes`. Tokens use `${ENV}` interpolation, sourced via the compose
  `env_file`.
- **Required env keys** (add to `~/.hermes/.env`):
  - Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_HOME_CHANNEL`
  - Discord: `DISCORD_BOT_TOKEN`, `DISCORD_HOME_CHANNEL`
  - WhatsApp Cloud: `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_HOME_CHANNEL`
  - Optional per-platform allowlist: `TELEGRAM_ALLOWED_USERS` / `DISCORD_ALLOWED_USERS` / etc.
- **Security:** enabling a platform makes the agent reachable from outside 127.0.0.1.
  `unauthorized_dm_behavior: pair` requires unknown senders to pair first; restrict further with
  `*_ALLOWED_USERS`. **Never** set `GATEWAY_ALLOW_ALL_USERS=true` on an internet-reachable bot
  (`doctor.sh` fails if it sees this). Inbound voice memos are auto-transcribed (`stt_enabled: true`).

### 10.5 Voice
- **Dashboard mic (built):** push-to-talk + spoken replies in `ChatView`. STT/TTS go through the
  engine endpoints `POST /voice/transcribe` and `POST /voice/speak`
  (`gateway/platforms/api_server.py`), proxied via `dashboard/.../api/hermes/[...path]` so the API key
  stays server-side (the proxy forwards raw bytes for binary audio). TTS uses local **piper**
  (`tts.provider: piper`) — no paid provider, no key.
- **Messaging voice:** voice memos on Telegram/Discord are transcribed inbound; replies use the same
  piper TTS.
- **OMI wearable:** documented, not built — post-v1 (Layer 0 capture).

### 10.6 Multi-agent orchestration
- Local-first and already wired: `delegation` (`max_concurrent_children: 8`), the Kanban dispatcher,
  `delegate_task`, and Goal Mode are available through the running gateway — no extra config.

### 10.7 Serverless execution (documented, deferred)
- Heavy/parallel jobs can burst to serverless by changing `terminal.backend` in `hermes/config.yaml`:
  - `local` (current) → in-container execution.
  - `modal` → Modal serverless (hibernates when idle). Needs a Modal account + `MODAL_TOKEN_ID` /
    `MODAL_TOKEN_SECRET`.
  - `daytona` → Daytona cloud workspaces. Needs a Daytona account + API token.
- This is a config flip, not code. Keep it deferred until a workload actually needs cloud burst;
  local Docker covers the current multi-agent use.

### 10.8 New operational scripts
- `scripts/install-bridge-service.sh` (+ `run-bridge.sh`, `com.agenthome.claude-bridge.plist`) — bridge as launchd service.
- `scripts/seed-cron.sh` — seed the canonical 24/7 cron jobs with autonomy tiers.
- `scripts/doctor.sh` — extended with bridge-service, voice-endpoint-auth, and gateway-exposure checks.
