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
| 3 | Deployment | **Local Mac (Apple Silicon)**, always-on host | Data stays home; agent has file/shell access → security first-class |
| 4 | Providers | **Free-first mesh:** local Ollama/LM Studio · OpenRouter free · GLM-4-Flash · Gemini (API) · Claude (Claude Code CLI) | Default to free/local; Gemini & Claude are escalation tiers |
| 5 | v1 pillars | Multi-agent orchestration · Shared Obsidian memory · dashboard · **Prompt Foundry** | Studio v1 = Google Flow prompts, not paid media APIs |

**Deferred:** paid-only providers (Kimi K2, Grok, OpenRouter Fusion), paid media APIs (Grok Imagine / MiniMax /
HeyGen), SEO auto-publish (Netlify / WordPress), VPS / remote topology, OpenClaw / Antigravity / Codex tabs.

## 3. High-Level Architecture (5-layer stack)

```
┌──────────────────────────────────────────────────────────────────┐
│ L4  COMMAND SURFACE — Next.js + Tailwind dashboard :3737           │
│     Mission Control · Kanban · Goal Mode · Agents · Memory graph    │
│     · Prompt Foundry (Studio)                                       │
└───────────────▲───────────────────────────────────────────────────┘
                │ REST + SSE/WebSocket (127.0.0.1 only)
┌───────────────┴───────────────────────────────────────────────────┐
│ L3  ENGINE — Hermes Agent gateway (Python/FastAPI)   :8642          │
│     Kanban dispatcher (SQLite ~/.hermes/kanban.db, WAL, task_events)│
│     Profiles · delegate_task · async "Hive" · /goal judge loop      │
│     · MCP clients · skills (SKILL.md)                               │
│   ── side runtime ──▶ Claude Code CLI (own session; tool + tab)     │
└───────┬───────────────────────────────┬───────────────────────────┘
        │ MCP (Obsidian Local REST :27123)│ HTTPS / local :11434
┌───────┴────────────┐         ┌─────────┴───────────────────────────────────┐
│ L1  MEMORY          │         │ L2  PROVIDER MESH (free-first, tiered)        │
│ Obsidian vault      │◀────────│ A local  → Ollama/LM Studio :11434 (no key)   │
│ (PARA, wikilinks)   │  shared │ B free$  → OpenRouter free, GLM-4-Flash (keys) │
│ + 3-tier Hermes mem │  brain  │ C Gemini → Google generativelanguage (API)    │
└─────────────────────┘         │ D Claude → Claude Code CLI (subscription)     │
                                └───────────────────────────────────────────────┘
  L0 Capture (optional, later): OMI/voice → vault
```

**Data flow:** a brief is dropped as a Kanban card or `/goal`; Hermes' in-gateway dispatcher assigns it to named
profiles (local/free/Gemini per the routing tier) and/or delegates coding/agentic jobs to the Claude Code CLI
subprocess; sub-agents run in isolated terminals/working dirs; outputs are written back to the Obsidian vault,
which every other agent reads. The dashboard is a viewer/controller over Hermes' REST API plus a Claude Code panel.

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
- **Guardrail:** secrets stay OUT of the vault; append-only dated summaries; honor PARA + `[[wikilink]]`
  conventions and the vault `CLAUDE.md` rules (never delete/overwrite notes).

### C. Provider mesh — free-first, four tiers
Every provider is config in `config.yaml` + keys in `.env`. Tiered by **cost AND data-privacy** — "free" splits
into local (free + private) vs promo (free but logs prompts, transient).

| Tier | Provider | Cost | Privacy | Role |
|------|----------|------|---------|------|
| **A** | Ollama / LM Studio (`:11434`) | free | private, no logging | Default bulk; **only free tier allowed for sensitive data** |
| **B** | OpenRouter free, GLM-4-Flash | free | **logs prompts**, transient | Non-sensitive high-volume only |
| **C** | Gemini Pro / Flash (Google API) | free tier + paid | cloud | Flash = judge; Pro = heavy; Prompt Foundry; backbone |
| **D** | Claude Code CLI (subscription) | no per-token | — | Premium escalation; own runtime + tab |

**Claude integration detail:** Claude is a first-class *runtime* (Claude Code CLI), not a metered API key —
exactly as the original's "Claude" tab *is* Claude Code. It runs as its own session, reachable (1) as a
dashboard tab and (2) by Hermes via `terminal`/CLI delegation, sharing the brain via the Obsidian MCP in Claude
Code's config.

**Routing policy (free-first, judge-gated):** Tier A/B → Tier C (Gemini) → Tier D (Claude), escalate only when a
Gemini-Flash judge shows the cheaper tier failing. **Hard rule: sensitive work routes only to Tier A, Gemini,
or Claude — never Tier B.**

### D. Dashboard — Next.js + Tailwind (`localhost:3737`)
- Standalone Next.js shell over Hermes' REST/WS API (design control; we forgo Hermes' plugin-inherited
  auth/themes — revisit if auth becomes painful).
- **Layout (matched to `docs/reference/montages/`):** dark theme; fixed left sidebar with the
  `LOCAL · STUDIO` / `Agentic OS` wordmark, three grouped sections, circular gradient agent icons, and a
  user/vault status chip pinned bottom.
- **Nav (v1):**
  - **WORKSPACE:** Mission Control, Kanban (triage→todo→ready→running→blocked→done).
  - **AGENTS:** Claude (Claude Code panel), Gemini (Hermes Gemini profiles), Local (Ollama/LM Studio), plus a
    free-cloud model picker in the composer. Each is its own backend session — switching tabs never stops
    background work. A **tier/privacy badge** flags when a Tier B "logged" provider is active.
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

## 5. Process / Runtime Model (local Apple Silicon)
- All services bind **127.0.0.1 only**. Always-on: Ethernet, prevent sleep, restart after power failure, fixed
  local IP; optional **Tailscale** for private remote access (no public exposure).
- Supervision (`launchd`/`pm2`-style) for: `hermes gateway` (:8642), Obsidian + Local REST (:27123), dashboard
  (:3737), Ollama (:11434). Durable work in **tmux**.
- Single-host: Hermes Kanban & `delegate_task` are single-host by design — a "10-agent company" on one machine,
  not a cluster.

## 6. Build vs. Reuse

| We BUILD | We REUSE |
|----------|----------|
| Next.js + Tailwind dashboard (:3737), 3 archetypes | Hermes Agent engine (MIT) |
| Hermes profiles (judge/researcher/writer/seo/prompt-*) | Kanban dispatcher, `delegate_task`, Goal Mode |
| Prompt Foundry skill + Google Flow prompt-rules | Obsidian Local REST API plugin + Obsidian MCP server |
| Claude-Code-as-runtime integration (CLI + MCP) | Claude Code CLI, Gemini API, Ollama/LM Studio, OpenRouter free, GLM-4-Flash |
| Free-first tiered routing + judge + privacy guard | Existing Obsidian vault (PARA) as shared memory |
| Setup/supervision scripts (launchd/tmux/Tailscale) | |

**Repo layout** (`10_Projects/agent-home/`):
```
/dashboard   Next.js + Tailwind app (:3737)
/hermes      config.yaml, profiles/, .env.example, skills/ (incl. prompt-foundry)
/scripts     install, doctor, launchd/tmux bootstrap
/docs        design-research.md, architecture.md (this), runbooks
```

## 7. Security (first-class)
- **Never bind 0.0.0.0** without TLS reverse proxy + auth. Local-only by default; remote = Tailscale.
- No built-in auth in Hermes/dashboard; `.env` holds keys — keep keys out of the vault and out of git; OS
  keychain/secret-vault; `doctor` checks for plaintext secrets.
- Agents have file/shell access: scope vault access to the project folder; vet every community skill (a Cisco
  test found a third-party skill exfiltrating data + prompt-injecting); enable Hermes prompt-injection guards;
  route no sensitive work to Tier B logged models.
- Honor vault `CLAUDE.md`: append/patch, never delete/overwrite; one focused commit per edit.

## 8. Phased Build Plan
1. **Engine up:** install Hermes; Tier A local (Ollama + Gemma/Nemotron) + Gemini key; `hermes chat` on
   local + Gemini Flash; wire Obsidian (Local REST + MCP). *Gate:* `/goal` four-file test passes.
2. **Mesh + memory sharing:** add Tier B (OpenRouter free, GLM-4-Flash); profiles across tiers; Obsidian MCP in
   Claude Code; confirm local + Gemini + Claude each answer a vault-only fact; routing + judge + privacy guard.
3. **Orchestration + dashboard:** Kanban dispatcher + swarm, Goal Mode, `delegate_task`; Next.js shell on
   :3737 — Mission Control, live Kanban, Claude tab, Gemini tab, Memory graph.
4. **Prompt Foundry:** skill + tab + prompt-rules registry + `prompt-writer`/`prompt-judge` loop; outputs to
   vault as Google Flow-ready prompts.
5. **Hardening:** security `doctor`, supervision/always-on, optional Tailscale.

## 9. Verification (end-to-end)
- **Engine + mesh:** gateway healthy on :8642; `hermes chat` answers on Tier A local, Gemini, and a Tier B
  model; `hermes kanban init` creates `~/.hermes/kanban.db`; `/goal` four-file test passes (Gemini Flash
  judge); routing escalates a hard task local → Gemini.
- **Memory:** a vault-only fact is retrieved by a local profile, a Gemini profile, AND the Claude Code session
  via the Obsidian MCP.
- **Privacy guard:** a flagged-sensitive task routed at Tier B is blocked/redirected to local or Gemini.
- **Orchestration:** one brief fanned to ≥3 profiles via Kanban (mixed tiers + a Claude Code delegation);
  parallel sessions confirmed; tab-switch doesn't stop background work; `task_events` renders live.
- **Dashboard:** :3737 loads WORKSPACE/AGENTS/SELF nav, Claude + Gemini tabs, live Kanban + Memory graph, nav
  customization persists across restart.
- **Prompt Foundry:** an image + a video prompt generated for a sample brief; judge loop iterates; output saved
  as a dated vault note; manual paste into Google Flow produces usable media.
- **Security:** `doctor` reports no plaintext secrets, all services on 127.0.0.1, vault access scoped.
