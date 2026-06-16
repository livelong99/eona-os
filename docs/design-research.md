# Agentic OS / Local Studio — Rebuild-Oriented Technical Architecture Specification

## TL;DR
- "Agentic OS / Local Studio" is **not a single product**: it is a custom **Next.js + TailwindCSS dashboard** (distributed as a zip inside Julian Goldie's AI Profit Boardroom — a Skool community at $59/month with 3,000+ members) that runs locally in the browser at **localhost:3737** and acts as a "mission control" skin/orchestrator wrapping the genuinely open-source **Hermes Agent** (Nous Research), **OpenClaw** (Peter Steinberger), **Claude Code**, **Codex CLI**, **Google Antigravity CLI**, and a roster of model providers reached over OpenAI-/Anthropic-compatible APIs — all sharing one Obsidian-vault memory.
- Almost every "agent" in the nav is a **branded façade over a real, documented backend**: "Hermes" = NousResearch/hermes-agent; "OpenClaw" = openclaw/openclaw; "Kimi Code" = Moonshot Kimi K2.x via api.moonshot.ai; "GLM 5.2" = Zhipu/Z.ai via the Anthropic-compatible endpoint; "Grok Build" = xAI's coding agent (grok-code-fast-1 / grok-build-0.1); "Free Claude Code" = the open-source free-claude-code proxy routing Claude Code to OpenRouter's free "Owl Alpha"; "Fusion" = OpenRouter's `openrouter/fusion` multi-model judge; "Antigravity" = Google Antigravity 2.0; "Codex" = OpenAI Codex CLI.
- The "Hive"/swarm, Kanban, Goal Mode and shared memory are **real Hermes Agent features** (SQLite kanban dispatcher, `delegate_task` sub-agents, `/goal` judge loop, three-tier memory + Obsidian MCP), so the system is rebuildable today from open-source parts; the marketing claims ($0 cost, "frontier free APIs") rest on **temporary free promo tiers** (Owl Alpha, Nemotron, GLM coding plan) that should be treated as transient, not permanent.

## Key Findings

1. **The dashboard is a thin Next.js orchestration layer, not the engine.** Julian Goldie states the dashboard was "scaffolded… in Next.js and Tailwind, fully locally hosted" by Claude Desktop, and is distributed to community members as a zip. Port **3737** matches the "Operating System for AI Coding Assistants" convention used by projects like Archon (coleam00) and is set via `next dev -p 3737`. This is distinct from the underlying Hermes web UIs (official Nous dashboard on :9119; the community outsourc-e "Hermes Workspace" Vite/React app on :3000, backed by the Hermes gateway on :8642).

2. **The real orchestration engine is Hermes Agent (Nous Research).** Hermes Agent is open-source under the MIT License and was released February 2026 by Nous Research; per hermes-agent.nousresearch.com it is "Open Source • MIT License," installed via `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`. The installer provisions uv, Python 3.11, Node.js, ripgrep, ffmpeg. State lives in `~/.hermes`. It is model-agnostic (OpenAI-/Anthropic-compatible), ships a CLI/TUI, a messaging gateway (Telegram/Discord/Slack/WhatsApp/Signal/Email), a SQLite-backed Kanban multi-agent board, `delegate_task` sub-agents, `/goal` mode, and a three-tier memory system. It can auto-import an existing `~/.openclaw` config.

3. **"Hermes Agent" is genuinely the Nous Research product** — the agentos.guide pages explicitly say so ("Hermes is the AI agent from Nous Research"). It is the same lab behind the Hermes language-model family. The repo is NousResearch/hermes-agent.

4. **The agents are façades over real providers.** Each nav tab is a profile/skin pointed at a real backend. "OpenClaw" is a real open-source project created by Austrian developer Peter Steinberger (PSPDFKit founder, later at OpenAI); per Wikipedia it was "first published in November 2025 under the name Warelay… renamed twice: first to 'Moltbot'… on January 27, 2026, following trademark complaints by Anthropic, and then… to 'OpenClaw.'" "Free Claude Code" is the open-source proxy at github.com/Alishahryar1/free-claude-code.

5. **The "Hive" / async sub-agents is a real, recently-shipped Hermes capability.** `delegate_task` spawns isolated child agents (own conversation, terminal, toolset) and is synchronous; a newer async, non-blocking background-delegation toolset (Hermes issue #5586) adds fire-and-forget background workers — this is the "asynchronous sub-agents/delegate" / "Hive" feature.

6. **Memory is Obsidian + MCP, shared across every agent.** Hermes' three-tier memory (Layer 1: `memory.md`/`user.md`; Layer 2: FTS5 full-text session search in `state.db`; Layer 3: pluggable providers; Layer 4: Obsidian skill) plus the Obsidian Local REST API plugin (localhost:27123) and an Obsidian MCP server expose the same markdown vault to Claude, Codex, OpenClaw, Antigravity, etc.

7. **Studio media generation wires three+ real services:** Grok Imagine (xAI), MiniMax/Hailuo, and HyperFrames (HeyGen's open-source HTML→MP4 renderer, Apache-2.0), plus HeyGen avatars. HyperFrames is the "free $0 local video" claim; the others are paid/credit APIs.

8. **Antigravity + Google Managed Agents are real Google products.** Google Antigravity 2.0 is a standalone agent-orchestration desktop app + CLI + SDK; "Managed Agents in the Gemini API" spins up cloud Linux sandboxes running Gemini 3.5 Flash that browse/run code and return artifacts. The agentos.guide "Cloud Crew" page links to the genuine Google announcement and docs.

---

## Details

### (1) System overview & high-level architecture

Conceptually the system is a **five-layer stack** (Goldie markets it as the "7-Layer Blueprint" / "Gravity Grid"):

- **Layer 0 — Capture (optional):** OMI wearable/app → passively transcribes speech into the vault.
- **Layer 1 — Memory:** an Obsidian vault of plain markdown, organized with PARA, exposed via the Obsidian Local REST API plugin and/or an Obsidian MCP server.
- **Layer 2 — Models/Brains:** cloud + local LLM endpoints. Per the NousResearch/hermes-agent GitHub README, Hermes works with "Nous Portal, OpenRouter (200+ models), NovitaAI… NVIDIA NIM (Nemotron), Xiaomi MiMo, z.ai/GLM, Kimi/Moonshot, MiniMax, Hugging Face, OpenAI, or your own endpoint" (plus Ollama/LM Studio locally).
- **Layer 3 — Agents/Runtimes:** Hermes Agent (the conductor), OpenClaw, Claude Code, Codex CLI, Antigravity CLI, Free Claude Code proxy.
- **Layer 4 — Command surface:** the Next.js dashboard at localhost:3737 (Mission Control, Kanban, Goal Mode, Studio, SEO, Notebook, Memory graph).

Data/flow: a job is dropped on the Kanban board or as a `/goal`; Hermes' in-gateway dispatcher promotes/assigns tasks to named agent profiles; sub-agents run in isolated terminals/working dirs; outputs are saved to the Workspace and written back to the Obsidian vault, which every other agent then reads. The dashboard is a viewer/controller over Hermes' REST API plus per-agent process panels.

**Architecture diagram (described):** A browser SPA (localhost:3737) at the top. It calls a local REST/SSE backend (Hermes gateway on :8642, dashboard API on :9119). The gateway hosts: (a) the Kanban dispatcher (SQLite `~/.hermes/kanban.db`), (b) per-profile agent sessions, (c) the `delegate_task`/async-delegation thread pool, (d) MCP clients (Obsidian, Firecrawl, HeyGen, etc.). Side processes: Claude Code CLI, Codex CLI, OpenClaw gateway, Antigravity CLI, Free Claude Code proxy (:8082). All read/write one Obsidian vault. Outbound: model provider APIs + media APIs + Netlify/WordPress publish.

### (2) Front-end / dashboard stack and the localhost:3737 app

- **Stack:** React via **Next.js + TailwindCSS**, run locally with `next dev -p 3737` (or `PORT=3737`). Distributed as a **zip** to AIPB members; "Kimi fast mode" and other new models are "built in" by editing the dashboard config/components.
- **Branding:** top-left "Agentic OS / LOCAL · STUDIO"; left nav in three groups: WORKSPACE (Mission Control, Paperclip, AI Agent Mastermind); AGENTS (Claude, OpenClaw, Hermes, Gemini, Antigravity, Codex, Kimi Code, GLM 5.2, Grok Build, Free Claude Code, Fusion); SELF (Pipeline, SEO, Video, Music, Game Studio, Thumbnails, Notebook + Obsidian vault).
- **Relationship to Hermes' own UI:** Hermes ships its own React dashboard (port 9119) with a documented plugin model — `~/.hermes/dashboard-themes/` YAML themes; UI plugins in `~/.hermes/plugins/<name>/dashboard/` with `manifest.json` + a JS bundle that registers tabs/slots via `window.__HERMES_PLUGIN_SDK__`; backend plugins as FastAPI routers mounted at `/api/plugins/<name>/`. Plugins don't bundle React (it comes from the SDK). The Goldie dashboard is a separate Next.js front-end, but the same extensibility concepts (tabs/widgets/skills) apply; a rebuild can either (a) ship a Next.js shell that calls Hermes' REST API, or (b) build everything as Hermes dashboard plugins.
- **Security note:** Hermes' own dashboard binds to 127.0.0.1 and has **no authentication of its own**; it reads/writes the `.env` containing API keys. Binding to 0.0.0.0 exposes credentials to the LAN.

### (3) Multi-agent process / session model

- Each agent tab is its **own backend session/process** running side-by-side; switching browser tabs does not stop background work. This maps to: Hermes profiles (`hermes -p <profile>`), separate CLI processes (Claude Code, Codex, OpenClaw gateway, Antigravity CLI), and persistent terminals (tmux) for durable work.
- **Kanban dispatcher:** `hermes kanban init` creates a SQLite board (`~/.hermes/kanban.db`); `hermes gateway start` hosts the embedded dispatcher (default 60s tick, `dispatch_in_gateway: true`). Tasks have status triage→todo→ready→running→blocked→done→archived; comments are the inter-agent protocol; workspaces are scratch dirs under `~/.hermes/kanban/workspaces/<id>/`. `task_events` is an append-only table streamed over WebSocket; WAL mode keeps reads non-blocking. **Kanban is deliberately single-host** — for multi-host you run independent boards and bridge with `delegate_task`/a message queue.
- **One prompt → many profiles:** the "fan out one prompt to gem build / gem 3.7 / gem researcher / gem judge / gem seo / gem writer" pattern is implemented by creating multiple Hermes profiles (each a model+toolset+persona) and assigning the same brief to each as Kanban cards, or via `delegate_task` parallel batch.

### (4) Per-agent integration specs

| Nav tab | Real identity | Provider | Model IDs (2026) | API / CLI | Auth | Free-tier reality |
|---|---|---|---|---|---|---|
| **Claude** | Claude Code CLI (streaming, voice-in, auto-logged to Obsidian) | Anthropic | Claude Opus/Sonnet (e.g. Opus 4.x, "Fable 5"/Claude 5 per Goldie's naming) | `claude` CLI | Anthropic API key / subscription | Paid |
| **Free Claude Code** | free-claude-code proxy (github.com/Alishahryar1/free-claude-code) routing Claude Code to a free model | OpenRouter | `openrouter/owl-alpha` (1M ctx, free promo) | install via `curl … install.sh \| sh`; `fcc-server` (admin UI http://127.0.0.1:8082/admin); `fcc-claude` | OPENROUTER_API_KEY | Free *while Owl Alpha promo lasts* (logs prompts) |
| **OpenClaw** | openclaw/openclaw personal AI assistant (ex-Warelay/Moltbot, Peter Steinberger) | model-agnostic | any (Claude/GPT/Gemini/local) | `openclaw onboard`; config `~/.openclaw/openclaw.json`; port 18789 | per-provider keys | OSS; pay per model |
| **Hermes** | NousResearch/hermes-agent | model-agnostic | any OpenAI/Anthropic-compatible | `hermes`, `hermes gateway`, `hermes dashboard` | Nous Portal OAuth or BYO keys | OSS (MIT); pay per model |
| **Codex** | OpenAI Codex CLI | OpenAI | gpt-5.x-codex / gpt-5.5 default | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh`; `codex` | ChatGPT plan or API key | Paid |
| **Kimi Code** | Moonshot Kimi K2.x ("Kimi K2.5 engine"; current K2.6/K2.7 Code) | Moonshot AI | `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k2.5` | base_url `https://api.moonshot.ai/v1` (OpenAI- & Anthropic-compatible) | `sk-` key from platform.moonshot.ai | Paid (K2.6 $0.95/$4.00 per M; "Kimi fast mode" = no-think mode) |
| **GLM 5.2** | Zhipu AI / Z.ai GLM | Zhipu (Z.ai) | `glm-5.2` (1M ctx), `glm-4.7`, `glm-4.5-air` | Anthropic-compatible `https://api.z.ai/api/anthropic`; OpenAI-compatible `https://api.z.ai/api/openai/v1` | Z.ai API key (ANTHROPIC_AUTH_TOKEN) | Coding Plan from ~$10/mo (quota); GLM-4.x-Flash free tier; judge/seo/researcher/writer = GLM profiles |
| **Grok Build** | xAI coding agent/CLI | xAI | `grok-code-fast-1`, `grok-build-0.1`, `grok-4.3` | `https://api.x.ai/v1` (OpenAI/Anthropic-compatible) | XAI_API_KEY; CLI via SuperGrok / X Premium+ | Paid; free API credits via data-sharing program |
| **Gemini** | Google Gemini | Google | Gemini 3 Pro / 3.5 Flash | Gemini API / `https://generativelanguage.googleapis.com` | AI Studio API key | Free tier + paid |
| **Antigravity** | Google Antigravity 2.0 (agentic IDE/CLI/SDK) | Google | Gemini 3.x Pro/Flash (+ Claude, GPT-OSS) | Antigravity CLI / app | Google account | Free public preview |
| **Fusion** | OpenRouter Fusion meta-model (panel + judge) | OpenRouter | `openrouter/fusion` | OpenRouter API | OPENROUTER_API_KEY | Paid (~4–5× a single completion) |

Goldie also references free frontier models: **NVIDIA Nemotron 3 Ultra** (550B MoE, 1M ctx, free on OpenRouter, runs via Ollama), and "Step 3.7 Flash/Alpha" / "N2" cloaked free models — all OpenRouter free-promo entries that log prompts.

### (5) Hermes swarm / Kanban / async sub-agents (the "Hive")

- **`delegate_task`** (synchronous): spawns isolated child agents, each with its own conversation, terminal session, and toolset; only the final summary returns to the parent. Config: `delegation.max_concurrent_children` (e.g. 30), `max_spawn_depth` (default 1 flat; 2–3 for orchestrator trees). Subagents inherit the parent's keys/credential pool (enables key rotation on rate limits). Leaf agents are blocked from delegation/memory/send_message. **Not durable** — interrupting the parent cancels children.
- **Async/background delegation (the "Hive"):** Hermes issue #5586 adds a non-blocking `async_delegation` toolset (in-process threads, output captured to a ring buffer, registry `parent_agent._async_tasks` keyed by task_id) so the parent can spawn long-running background agents and keep working. For durable cross-turn work, the documented alternatives are `cronjob` or `terminal(background=True, notify_on_complete=True)`.
- **Goal Mode (`/goal`):** standing objective + auxiliary **judge model** returning `{"done": bool, "reason": "..."}` after each turn; default **20-turn budget** (`goals.max_turns`); auto-continuation loop; `/subgoal` to tighten criteria; state in `SessionDB.state_meta` keyed `goal:<session_id>`; each goal runs in `~/.hermes/goals/<id>/`. Inspired by Codex CLI's `/goal`; route the judge to a cheap model (e.g. `google/gemini-3-flash-preview`) to cut cost ~80%.
- **Kanban swarm setup:** `hermes kanban swarm` wires workers + a checker + the shared board.

### (6) Shared Obsidian-vault memory

- **Three/four tiers:** Layer 1 built-in `memory.md`/`user.md` (~1,300-token budget); Layer 2 FTS5 full-text session search over `state.db` (the "search every conversation," made ~4,500× faster + free in the Velocity release); Layer 3 pluggable providers (Honcho, Memo, Hindsight, Supermemory); Layer 4 the Obsidian skill writing a structured vault.
- **Wiring:** `hermes memory setup --provider obsidian --path ~/vaults/work`; or the Obsidian **Local REST API plugin** on localhost:27123 (R/W during execution); or an **Obsidian MCP server** (e.g. cyanheads/obsidian-mcp-server) exposing the vault as MCP tools so *any* MCP-aware agent (Claude, Codex, Cursor, Antigravity, OpenClaw) shares the same brain. Hermes strips the Bearer prefix and stores `MCP_OBSIDIAN_API_KEY` in `~/.hermes/.env`, writing an `mcp_servers.obsidian` block to `~/.hermes/config.yaml`.
- **Structure:** PARA (Projects/Areas/Resources/Archive), wikilinks `[[ ]]`, graph view (the "Memory Galaxy"). Best practice: scope a dedicated folder, keep secrets out of the vault, use append-only dated summaries for cron jobs.
- **Persistence/cleanup:** conversations persist across restarts and are searchable; chat saving/deletion handled by SessionDB; goals/outputs survive via scratch dirs + orphan recovery.

### (7) Studio media integrations

- **Grok Imagine (xAI):** `grok-imagine-image` (~$0.02/img at 1K), `grok-imagine-image-quality` ($0.05–$0.07), `grok-imagine-video` ($0.05/sec 720p; ~$0.07/sec for 1.5 preview); also Grok TTS/STT. Bundled "free" with X Premium+/SuperGrok for consumer use; API via `https://api.x.ai/v1`. The agentos blog frames Grok as "four senses": X search (eyes), image gen, video gen (~25s clips), TTS (voice).
- **MiniMax / Hailuo:** video models `MiniMax-Hailuo-2.3`, `Hailuo-02` (text-to-video & image-to-video); API at platform.minimax.io (also via fal.ai ~$0.08/sec Pro 1080p). Three products under one brand: Hailuo consumer app, MiniMax API (per-token from ~$0.15/M on M-series), and a Token/Coding Plan from $10/mo.
- **HyperFrames (HeyGen, Apache-2.0):** open-source HTML→MP4 renderer; agents write HTML/CSS/JS, headless Chrome seeks frames, FFmpeg encodes — deterministic, **local, $0**. Install skill: `npx skills add heygen-com/hyperframes`; `npx hyperframes preview` / `render`. This is the "free video maker on your own computer" claim. Catalog at hyperframes.heygen.com/catalog.
- **HeyGen avatars (AI Avatar Studio):** API at `https://api.heygen.com/v3/videos` (X-Api-Key header), or MCP (OAuth, web-plan credits), or Skills/CLI. Pay-as-you-go from $5; ~$1/min Avatar III 1080p, ~$4/min Avatar IV.

### (8) SELF builder workflows & web-search / auto-publish

- **Pipeline / SEO / Video / Music / Game Studio / Thumbnails / Notebook** are workflow tabs that compose Hermes skills + Studio + Kanban. Notebook = NotebookLM integration (docs → audio/video/slides). Music = "Resonance Engine" (text→track). Game Studio/Thumbnails = Claude/free-Claude-Code building playable HTML games and image assets.
- **Web search as a tool:** **Firecrawl** API (scrape/crawl/map/search). Per firecrawl.dev/pricing, "Firecrawl is free for 1,000 pages every month (1,000 free credits per month)" and "Search costs 2 credits per 10 results. Interact costs 2 credits per browser minute." Agent onboarding skill at firecrawl.dev/agent-onboarding/SKILL.md. Plus Grok X-search and Tavily/Exa. "Llama" giving agents search refers to local Llama models calling these search tools.
- **SEO auto-publish (the "Assembly Line"/"Ranking Swarm"):** keyword + case study → multi-agent content generation → deploy. Confirmed deploy paths (AIPB Hermes Kanban blog): **(a) manual** — drag the built folder into Netlify; **(b) automated** — give Hermes a **Netlify access token** and it "handles deploy and DNS automatically." Alternative publish leg is **WordPress** (Hermes pushes directly). Firecrawl is the keyword/SERP research crawler step. Auto-deploy is *not* built into Kanban — Netlify/WordPress must be configured separately.

### (9) Deployment topologies

- **Local Mac (recommended):** M4 Mac Studio / Mac Mini; run Hermes + dashboard + agents natively. OpenClaw is purpose-built for macOS/Apple Silicon. For an always-on agent server: Ethernet, "prevent sleep," "start after power failure," fixed local IP, optional Tailscale for remote access. ~$644 hardware vs recurring VPS.
- **VPS (Hostinger / Hetzner) for phone/remote:** Ubuntu + Docker; Hermes via Docker; one-click templates exist (Hostinger lists Hermes Agent, OpenClaw, Ollama, Agent Zero, Claude Code). ~$5–20/mo + model API. Remote access via Tailscale or session-auth proxy. Hetzner ~$11/mo is the cheap cloud path cited for Hermes video.
- **Security trade-offs:** Local = data stays home but exposes your real machine to an agent with file/shell access. Per Wikipedia's OpenClaw entry, Cisco's AI security team tested a third-party OpenClaw skill and found it "performed data exfiltration and prompt injection without user awareness"; maintainer "Shadow" warned: "if you can't understand how to run a command line, this is far too dangerous of a project for you to use safely." VPS = isolated "naked Linux box," 24/7 uptime, easy scaling, but you don't control the data center. Hermes/dashboard bind to 127.0.0.1 by default and have no built-in auth — never bind 0.0.0.0 without a TLS reverse proxy + auth; the Velocity release added prompt-injection guards at three checkpoints and a Bitwarden secret-vault option. OpenClaw `doctor` flags plaintext secrets in `openclaw.json`; bind to localhost, never expose port 18789.

### (10) Extensibility / skill / tab / plugin model

- **Hermes skills:** markdown "recipes" (SKILL.md) in `~/.hermes` and OpenClaw skills in `~/.openclaw/workspace/skills/<skill>/SKILL.md`; compatible with the agentskills.io open standard; recipes can call other recipes. A "Skill Vault"/Skills Hub browses/installs community skills with source preview + security scan.
- **MCP add-ons:** ~30+ one-click MCP servers (Notebook, computer-use, web/browser, timers/cron, files, NVIDIA skills). Model Context Protocol is the universal extension bus.
- **Dashboard plugins (Hermes' own UI):** drop-in `~/.hermes/plugins/<name>/dashboard/` with `manifest.json` + JS bundle (registers tabs via `window.__HERMES_PLUGINS__.register`, injects into shell/page slots like `sessions:top`), optional CSS, and a Python FastAPI `plugin_api.py` mounted at `/api/plugins/<name>/`. Themes are YAML in `~/.hermes/dashboard-themes/`. For the Next.js Goldie dashboard, "tabs/widgets/skills" are React components + config entries inside the distributed zip; a "save button" persists user customizations (nav order, added tabs) across zip version updates.
- **Local models:** Ollama / LM Studio / vLLM / llama.cpp endpoints plug in as OpenAI-compatible providers (no key). Goldie tested Gemma 3/4 locally and found them slow — consistent with community reports (Gemma 4 31B "almost unusable" on M1 Max without context/quant tuning; Q4_K_M + reduced ctx-size needed; M4 with 32GB+ unified memory recommended). Realistic local options: Gemma 4 12B/26B-A4B (Q4), Nemotron via Ollama. Creator's stated preference is free cloud APIs over local.

### (11) Consolidated bill-of-materials

| Component | Real-world identity | Official docs | Auth | Cost / free-tier |
|---|---|---|---|---|
| Dashboard | Custom Next.js + Tailwind (AIPB zip) | (community, not public) | none (local) | Bundled with $59/mo AIPB membership |
| Hermes Agent | NousResearch/hermes-agent | hermes-agent.nousresearch.com | Nous OAuth / BYO keys | OSS (MIT) |
| OpenClaw | openclaw/openclaw | openclaw.ai / github.com/openclaw/openclaw | per-provider keys | OSS (MIT) |
| Claude Code | Anthropic Claude Code CLI | docs.anthropic.com/claude-code | API key/plan | Paid |
| Free Claude Code | free-claude-code proxy | github.com/Alishahryar1/free-claude-code | OPENROUTER_API_KEY | OSS + free Owl Alpha promo |
| Codex | OpenAI Codex CLI | developers.openai.com/codex | ChatGPT/API | Paid |
| Kimi Code | Moonshot Kimi K2.x | platform.moonshot.ai | sk- key | Paid (~$0.95/$4.00 per M, K2.6) |
| GLM 5.2 | Zhipu/Z.ai GLM | docs.z.ai | Z.ai key | Coding Plan ~$10/mo; some free models |
| Grok Build | xAI coding agent | x.ai/api , x.ai/news/grok-build-cli | XAI_API_KEY / SuperGrok | Paid + free credits program |
| Gemini | Google Gemini API | ai.google.dev | AI Studio key | Free + paid |
| Antigravity | Google Antigravity 2.0 | antigravity.google | Google account | Free public preview |
| Fusion | OpenRouter Fusion | openrouter.ai | OPENROUTER_API_KEY | Paid (~4–5× single call) |
| Owl Alpha | OpenRouter cloaked frontier model | openrouter.ai/openrouter/owl-alpha | OPENROUTER_API_KEY | Free promo (logged) |
| Grok Imagine | xAI image/video/TTS | docs.x.ai | XAI_API_KEY / X Premium+ | Paid / bundled |
| MiniMax/Hailuo | MiniMax video | platform.minimax.io | API key | Paid + free tier |
| HyperFrames | HeyGen OSS HTML→MP4 | hyperframes.heygen.com | none (local) | Free (Apache-2.0) |
| HeyGen | HeyGen avatar API | developers.heygen.com | X-Api-Key / OAuth | Pay-as-you-go from $5 |
| Firecrawl | Firecrawl web API | firecrawl.dev | fc- key | Free 1,000 pages/mo |
| Obsidian | Obsidian + Local REST API plugin + MCP | obsidian.md | Bearer token | Free personal |
| OMI | OMI wearable/app | (omi) | account | Hardware + free export |
| Ollama/LM Studio | Local model runtimes | ollama.com | none | Free |
| Netlify / WordPress | Publish targets | netlify.com | access token | Free tier / hosting |

---

## Recommendations

**Stage 1 — Stand up the engine (weekend 1).** Install Hermes Agent (`curl … install.sh | bash`); confirm `hermes chat` works on a free OpenRouter model (Owl Alpha) or a paid Claude/Kimi/GLM key. Install Obsidian + the Local REST API plugin (or an Obsidian MCP server) and wire it as Hermes' memory provider. Benchmark to change course: if `hermes dashboard` (:9119) loads and a `/goal` completes a four-file test, the core works.

**Stage 2 — Add agents + memory sharing (weekend 2).** Install Claude Code, Codex CLI, OpenClaw, Antigravity CLI, and the free-claude-code proxy; point each at the same Obsidian vault via MCP. Create named profiles (researcher/writer/judge/seo/build). Wire Firecrawl (free key) as the search tool. Threshold: every agent should answer a question using a fact only present in the vault.

**Stage 3 — Orchestration + the dashboard (weekend 3).** Enable the Kanban dispatcher (`hermes kanban init` + swarm), Goal Mode, and `delegate_task`. Build the Next.js + Tailwind shell on :3737 that calls Hermes' REST API and embeds per-agent panels — or, simpler and more maintainable, build the same tabs as **Hermes dashboard plugins** (manifest + JS bundle + FastAPI routes) so you inherit auth/themes/SDK for free.

**Stage 4 — Media + publish (week 4).** Add HyperFrames (free, local) first for video; add Grok Imagine / MiniMax / HeyGen only when you have paid keys and a clear ROI. Wire SEO auto-publish via a Netlify access token (and/or WordPress) as a Hermes skill.

**Cost/Decision thresholds:** Default everything to free/local (HyperFrames, Owl Alpha/Nemotron, GLM coding plan) and only escalate a given task to a paid frontier model (Claude Opus, Grok, Kimi K2.7, Fusion) when a judge step shows the free model failing. Re-evaluate monthly: the "free frontier" promos (Owl Alpha, cloaked Alpha models) are temporary and log your data — migrate any sensitive workload off them immediately.

**Do NOT** expose any of these dashboards/gateways on 0.0.0.0 without a TLS reverse proxy + auth; run agents with shell access on a dedicated machine/VPS, not your primary work laptop.

---

## Caveats

- **Marketing vs. mechanism.** agentos.guide is a sales/affiliate funnel for the AI Profit Boardroom — a Skool community at $59/month with 3,000+ members. Its claims are accurate about *what open-source tools exist* but inflate ease, cost ("$0"), and novelty (the "Goldie [X] Engine™" names are branding over standard Hermes/OpenClaw/Claude features). Treat superlatives and "INSANE" framing as promotional.
- **Port 3737 is inferred, not documented by Goldie.** Goldie's own posts confirm Next.js + Tailwind + zip distribution but do not explicitly state "3737" on reachable public pages; 3737 is the convention from Archon/AgentGraphed-style "Agent OS" dashboards and is the port shown in the source video. The underlying Hermes UIs use 9119 (dashboard), 8642 (gateway API), and 3000 (community Workspace).
- **"Free" is conditional and transient.** Owl Alpha, Nemotron, cloaked "Alpha" models, and "Step 3.7 Flash/N2" are OpenRouter promo models that are free *for now* and **log prompts/completions** for training; GLM-5.2 "free for individuals" is a low-cost coding-plan quota, not unlimited. Grok bundling is free only with a paid X Premium+/SuperGrok subscription.
- **Model naming drift.** Goldie uses fast-moving/aspirational names ("Claude Fable 5/Mythos 5", "Opus 4.8", "Kimi K2.7", "GLM 5.2", "Gemini 3.5 Flash", "Grok 4.3"). Some are real 2026 releases; verify exact current model IDs against each provider's docs before pinning, as IDs change frequently (e.g., Codex defaults track gpt-5.5).
- **"Hermes" name collision.** "Hermes" here is Nous Research's agent harness, NOT HeyGen, the Greek-myth branding, or any unrelated "Hermes" SaaS. "Antigravity" is Google's product, not a community fork.
- **Some claimed events are narrative.** agentos.guide references dramatic items (a "White House bans Mythos AI," "Claude Mythos & Fable 5 banned") that are framed as news but should be treated as **unverified/promotional storytelling** unless corroborated by primary sources; this spec does not rely on them.
- **Single-host limits.** Hermes Kanban and `delegate_task` are single-host by design; the "run a 10-agent company" framing works on one machine but is not a distributed cluster.
- **Security is a first-class risk, not an afterthought.** Because these agents have shell/file access and the dashboards ship without auth, a malicious skill or prompt-injected document can exfiltrate data or run code; vet every community skill, scope vault access, and isolate the runtime.