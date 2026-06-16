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
| 3 | Deployment | **Local Mac (Apple Silicon)** via **Docker Compose** (Ollama runs native for Metal GPU) | Self-hosted, reproducible; everything but Ollama is a container |
| 4 | Providers | **Claude Code (subscription) + Gemini (API) + optional local Ollama** | The ONLY paid items are the Claude subscription + Gemini key. Local is free. |
| 5 | Enterprise tools | **Self-hosted OSS via Docker** — SearXNG (search), Crawl4AI (scrape), Qdrant (vector memory) | No paid SaaS (Firecrawl/etc.); any AI capability uses Claude/Gemini |
| 6 | v1 pillars | Multi-agent orchestration · Shared Obsidian memory · dashboard · **Prompt Foundry** | Studio v1 = Google Flow prompts, not paid media APIs |

**Cost principle:** the *only* paid things are the **Claude Code subscription** and the **Gemini API key**.
Everything else is free/OSS, self-hosted via Docker, or handled by Claude/Gemini. Hermes itself is free (MIT).

**Deferred:** paid-only providers (Kimi K2, Grok, OpenRouter, GLM, Fusion), paid media APIs (Grok Imagine /
MiniMax / HeyGen), paid search SaaS (Firecrawl), SEO auto-publish (Netlify / WordPress), VPS / remote topology,
OpenClaw / Antigravity / Codex tabs.

## 3. High-Level Architecture (5-layer stack)

All containers run under one **Docker Compose** stack bound to `127.0.0.1`; **Ollama runs native** on macOS
(Docker on Apple Silicon has no Metal GPU access, so containerized local models would be crippled).

```
┌──────────────────────────────────────────────────────────────────┐
│ L4  COMMAND SURFACE — Next.js + Tailwind dashboard :3737  [docker] │
│     Mission Control · Kanban · Goal Mode · Agents · Memory graph    │
│     · Prompt Foundry (Studio)                                       │
└───────────────▲───────────────────────────────────────────────────┘
                │ REST + SSE/WebSocket (127.0.0.1 only)
┌───────────────┴───────────────────────────────────────────────────┐
│ L3  ENGINE — Hermes Agent gateway (free, MIT)  :8642     [docker]   │
│     Kanban dispatcher (SQLite, WAL, task_events)                    │
│     Profiles · delegate_task · async "Hive" · /goal judge loop      │
│     · MCP clients · skills (SKILL.md)                               │
│   ── side runtime ──▶ Claude Code CLI (subscription; tool + tab)    │
└──┬──────────────┬────────────────┬──────────────────┬──────────────┘
   │ MCP :27123    │ HTTPS          │ local :11434      │ OSS tools (docker)
┌──┴─────────┐ ┌───┴────────────┐ ┌─┴──────────────┐ ┌─┴────────────────────┐
│ L1 MEMORY   │ │ L2 PROVIDERS    │ │ A local (opt)  │ │ TOOLS                 │
│ Obsidian    │ │ C Gemini (API)  │ │ Ollama native  │ │ SearXNG  (search)     │
│ vault + MCP │ │ D Claude Code   │ │ — free/private │ │ Crawl4AI (scrape)     │
│ + Qdrant    │ │   (subscription)│ └────────────────┘ │ Qdrant   (vector mem) │
└─────────────┘ └─────────────────┘                    └───────────────────────┘
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
- Reuse the existing vault at `/Users/perkypanda/Documents/Obsidian/Vault`, scoped to the
  `10_Projects/agent-home/` workspace so agents never roam the whole vault.
- Wire via the **Obsidian Local REST API plugin** (`:27123`) and an **Obsidian MCP server** so any MCP-aware
  agent shares one brain. Hermes stores `MCP_OBSIDIAN_API_KEY` in `~/.hermes/.env` + an `mcp_servers.obsidian`
  block in `config.yaml`.
- Layer on Hermes' built-in 3-tier memory (`memory.md`/`user.md`; FTS5 session search; pluggable providers).
- **Semantic recall via self-hosted Qdrant** (Docker, free): a vector index over vault notes for similarity
  search, replacing any paid memory SaaS. Embeddings via Gemini or a local model — no paid embedding service.
- **Guardrail:** secrets stay OUT of the vault; append-only dated summaries; honor PARA + `[[wikilink]]`
  conventions and the vault `CLAUDE.md` rules (never delete/overwrite notes).

### C. Provider mesh — three tiers, two paid
The only paid items are the Claude subscription and the Gemini key. Each provider is config in `config.yaml`
(+ the Gemini key in `.env`).

| Tier | Provider | Cost | Role |
|------|----------|------|------|
| **A** | Ollama (native, `:11434`) — *optional* | free, private | Offline/bulk + sensitive-data tier |
| **C** | Gemini Pro / Flash (Google API) | API key (free tier + paid) | Flash = judge/high-freq; Pro = heavy; Prompt Foundry; engine backbone |
| **D** | Claude Code CLI | existing subscription, no per-token | Premium runtime + own dashboard tab; coding/agentic delegation |

**Claude integration detail:** Claude is a first-class *runtime* (Claude Code CLI), not a metered API key —
exactly as the original's "Claude" tab *is* Claude Code. It runs as its own session, reachable (1) as a
dashboard tab and (2) by Hermes via `terminal`/CLI delegation, sharing the brain via the Obsidian MCP in Claude
Code's config.

**Routing policy (cheap-first, judge-gated):** Ollama (if present) → Gemini Flash → Gemini Pro → Claude Code,
escalate only when a Gemini-Flash judge shows the cheaper tier failing. No external promo/free-cloud models —
they were dropped (data-logging + transient).

### D. Dashboard — Next.js + Tailwind (`localhost:3737`)
- Standalone Next.js shell over Hermes' REST/WS API (design control; we forgo Hermes' plugin-inherited
  auth/themes — revisit if auth becomes painful).
- **Layout (matched to `docs/reference/montages/`):** dark theme; fixed left sidebar with the
  `LOCAL · STUDIO` / `Agentic OS` wordmark, three grouped sections, circular gradient agent icons, and a
  user/vault status chip pinned bottom.
- **Nav (v1):**
  - **WORKSPACE:** Mission Control, Kanban (triage→todo→ready→running→blocked→done).
  - **AGENTS:** Claude (Claude Code panel), Gemini (Hermes Gemini profiles), Local (Ollama, optional). Each is
    its own backend session — switching tabs never stops background work. A **tier badge** shows the active
    provider (Local / Gemini / Claude Code).
  - **SELF:** Prompt Foundry, Memory (purple knowledge-"galaxy" graph), Goal Mode.
- **Screen archetypes (3):** Chat (Claude/Gemini/Local), Board (Kanban), Graph (Memory). Prompt Foundry = a
  Chat variant with a structured prompt-output panel.
- **Realtime:** subscribe to Hermes `task_events` over WebSocket. **Persistence:** local save of nav
  customizations survives updates.

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

## 5. Process / Runtime Model — Docker Compose (local Apple Silicon)
- **One `docker-compose.yml`** runs: `hermes` (:8642), `searxng` (:8080), `crawl4ai` (:11235),
  `qdrant` (:6333), `dashboard` (:3737). **Every published port is bound to `127.0.0.1`**
  (`127.0.0.1:PORT:PORT`). Containers may listen on `0.0.0.0` *inside* the network; host exposure is controlled
  solely by the `127.0.0.1` publish — that is the correct, safe pattern.
- **Host-native (not containerized), reached via `host.docker.internal`:**
  - **Obsidian** desktop + Local REST API plugin (`:27123`) — Obsidian is a GUI app; Hermes connects to it.
  - **Ollama** (`:11434`) — Apple-Silicon containers have no Metal GPU, so a containerized model would be
    CPU-only and far too slow. Optional tier.
  - **Claude Code** CLI — tied to your subscription/login; invoked by Hermes via a delegation bridge and
    surfaced in the dashboard.
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
| Claude-Code-as-runtime integration (CLI + MCP) | Claude Code CLI (sub), Gemini API, Ollama (native, opt) |
| `docker-compose.yml` + tool wiring (search/scrape/vector) | SearXNG, Crawl4AI, Qdrant (Docker images) |
| Cheap-first routing + judge | Existing Obsidian vault (PARA) as shared memory |
| Setup/doctor scripts | |

**Repo layout** (`10_Projects/agent-home/`):
```
/dashboard         Next.js + Tailwind app (:3737) + Dockerfile
/hermes            config.yaml, profiles/, .env.example, skills/ (incl. prompt-foundry)
/scripts           install, doctor
docker-compose.yml  hermes + obsidian-mcp + searxng + crawl4ai + qdrant + dashboard
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
1. **Stack up (Docker):** `docker compose up` brings up hermes + obsidian-mcp + searxng + crawl4ai + qdrant +
   dashboard; add the Gemini key; (optional) run Ollama native. *Gate:* gateway healthy, dashboard live on
   :3737, `/goal` four-file test passes.
2. **Memory + tools:** wire Obsidian MCP (Hermes *and* Claude Code) + Qdrant semantic index; wire SearXNG +
   Crawl4AI as Hermes search/scrape skills. Confirm Gemini + Claude each answer a vault-only fact and run a
   live web search via SearXNG.
3. **Orchestration + dashboard:** Kanban dispatcher + swarm, Goal Mode, `delegate_task`; dashboard shows live
   Kanban, Claude tab, Gemini tab, Memory graph.
4. **Prompt Foundry:** skill + tab + prompt-rules registry + `prompt-writer`/`prompt-judge` loop; outputs to
   vault as Google Flow-ready prompts.
5. **Hardening:** `doctor` (127.0.0.1-only + no plaintext secrets), restart policies, optional Tailscale.

## 9. Verification (end-to-end)
- **Stack:** `docker compose ps` all healthy; every published port bound to 127.0.0.1; dashboard 200 on :3737.
- **Engine:** gateway healthy on :8642; `hermes chat` answers on Gemini (and Ollama if present); Kanban board
  created; `/goal` four-file test passes (Gemini Flash judge); routing escalates a hard task Gemini-Flash → Pro.
- **Memory + tools:** a vault-only fact is retrieved by a Gemini profile AND the Claude Code session via the
  Obsidian MCP; Qdrant returns a semantic match; a SearXNG query + Crawl4AI fetch return results through Hermes.
- **Orchestration:** one brief fanned to ≥3 profiles via Kanban (+ a Claude Code delegation); parallel sessions
  confirmed; tab-switch doesn't stop background work; `task_events` renders live.
- **Dashboard:** :3737 loads WORKSPACE/AGENTS/SELF nav, Claude + Gemini tabs, live Kanban + Memory graph, nav
  customization persists across restart.
- **Prompt Foundry:** an image + a video prompt generated for a sample brief; judge loop iterates; output saved
  as a dated vault note; manual paste into Google Flow produces usable media.
- **Security:** `doctor` reports no plaintext secrets, all services on 127.0.0.1, vault access scoped, no paid
  API beyond Gemini in use.
