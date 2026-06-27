# Ruflo — Claude Code Configuration

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER add a `Co-Authored-By` trailer to user commits unless this project's `.claude/settings.json` has `attribution.commit` set (#2078). The Claude Code Bash tool may suggest one in its default commit-message template — ignore it. `Co-Authored-By` is semantic authorship attribution under git/GitHub convention; the tool is the facilitator, not a co-author.
- Keep files under 500 lines
- Validate input at system boundaries

## Ponytail — binding code standard (every agent, every task)

The rule is **never "fewest tokens."** It is: **write only what the task needs, and
never cut validation, error handling, security, or accessibility.** Code ends up
small because it's *necessary, not golfed*; lower cost/latency is a side effect, not
the goal.

**Climb the ladder before writing — read the real code/flow first ("lazy about the
solution, never about reading"):**

1. Does this need to exist? → skip it (YAGNI)
2. Already in this codebase? → reuse it
3. Stdlib does it? → use the stdlib
4. Native platform feature? → use it
5. Installed dependency? → use it
6. One line? → write the one line
7. Only then → the minimum that works

**Never on the chopping block** (the ladder trims scope, never safety): trust-boundary
validation, data-loss handling, security, accessibility. Full standard:
[`.agent-os/standards/ponytail.md`](.agent-os/standards/ponytail.md).

## Agent Comms (SendMessage-First Coordination)

Named agents coordinate via `SendMessage`, not polling or shared state.

```
Lead (you) ←→ architect ←→ developer ←→ tester ←→ reviewer
              (named agents message each other directly)
```

### Spawning a Coordinated Team

```javascript
// ALL agents in ONE message, each knows WHO to message next
Agent({ prompt: "Research the codebase. SendMessage findings to 'architect'.",
  subagent_type: "researcher", name: "researcher", run_in_background: true })
Agent({ prompt: "Wait for 'researcher'. Design solution. SendMessage to 'coder'.",
  subagent_type: "system-architect", name: "architect", run_in_background: true })
Agent({ prompt: "Wait for 'architect'. Implement it. SendMessage to 'tester'.",
  subagent_type: "coder", name: "coder", run_in_background: true })
Agent({ prompt: "Wait for 'coder'. Write tests. SendMessage results to 'reviewer'.",
  subagent_type: "tester", name: "tester", run_in_background: true })
Agent({ prompt: "Wait for 'tester'. Review code quality and security.",
  subagent_type: "reviewer", name: "reviewer", run_in_background: true })

// Kick off the pipeline
SendMessage({ to: "researcher", summary: "Start", message: "[task context]" })
```

### Patterns

| Pattern | Flow | Use When |
|---------|------|----------|
| **Pipeline** | A → B → C → D | Sequential dependencies (feature dev) |
| **Fan-out** | Lead → A, B, C → Lead | Independent parallel work (research) |
| **Supervisor** | Lead ↔ workers | Ongoing coordination (complex refactor) |

### Rules

- ALWAYS name agents — `name: "role"` makes them addressable
- ALWAYS include comms instructions in prompts — who to message, what to send
- Spawn ALL agents in ONE message with `run_in_background: true`
- After spawning: STOP, tell user what's running, wait for results
- NEVER poll status — agents message back or complete automatically

## Swarm & Routing

### Config
- **Topology**: hierarchical-mesh (anti-drift)
- **Max Agents**: 15
- **Memory**: hybrid
- **HNSW**: Enabled
- **Neural**: Enabled

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

### Agent Routing

| Task | Agents | Topology |
|------|--------|----------|
| Bug Fix | researcher, coder, tester | hierarchical |
| Feature | architect, coder, tester, reviewer | hierarchical |
| Refactor | architect, coder, reviewer | hierarchical |
| Performance | perf-engineer, coder | hierarchical |
| Security | security-architect, auditor | hierarchical |

### When to Swarm
- **YES**: 3+ files, new features, cross-module refactoring, API changes, security, performance
- **NO**: single file edits, 1-2 line fixes, docs updates, config changes, questions

### 3-Tier Model Routing

| Tier | Handler | Use Cases |
|------|---------|-----------|
| 1 | Agent Booster (WASM) | Simple transforms — skip LLM, use Edit directly |
| 2 | Haiku | Simple tasks, low complexity |
| 3 | Sonnet/Opus | Architecture, security, complex reasoning |

## Memory & Learning

### Before Any Task
```bash
npx @claude-flow/cli@latest memory search --query "[task keywords]" --namespace patterns
npx @claude-flow/cli@latest hooks route --task "[task description]"
```

### After Success
```bash
npx @claude-flow/cli@latest memory store --namespace patterns --key "[name]" --value "[what worked]"
npx @claude-flow/cli@latest hooks post-task --task-id "[id]" --success true --store-results true
```

### MCP Tools (use `ToolSearch("keyword")` to discover)

| Category | Key Tools |
|----------|-----------|
| **Memory** | `memory_store`, `memory_search`, `memory_search_unified` |
| **Bridge** | `memory_import_claude`, `memory_bridge_status` |
| **Swarm** | `swarm_init`, `swarm_status`, `swarm_health` |
| **Agents** | `agent_spawn`, `agent_list`, `agent_status` |
| **Hooks** | `hooks_route`, `hooks_post-task`, `hooks_worker-dispatch` |
| **Security** | `aidefence_scan`, `aidefence_is_safe`, `aidefence_has_pii` |
| **Hive-Mind** | `hive-mind_init`, `hive-mind_consensus`, `hive-mind_spawn` |

### Background Workers

| Worker | When |
|--------|------|
| `audit` | After security changes |
| `optimize` | After performance work |
| `testgaps` | After adding features |
| `map` | Every 5+ file changes |
| `document` | After API changes |

```bash
npx @claude-flow/cli@latest hooks worker dispatch --trigger audit
```

## Agents

**Core**: `coder`, `reviewer`, `tester`, `planner`, `researcher`
**Architecture**: `system-architect`, `backend-dev`, `mobile-dev`
**Security**: `security-architect`, `security-auditor`
**Performance**: `performance-engineer`, `perf-analyzer`
**Coordination**: `hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`
**GitHub**: `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

Any string works as a custom agent type.

## Build & Test

- ALWAYS run tests after code changes
- ALWAYS verify build succeeds before committing

```bash
npm run build && npm test
```

## CLI Quick Reference

```bash
npx @claude-flow/cli@latest init --wizard           # Setup
npx @claude-flow/cli@latest swarm init --v3-mode     # Start swarm
npx @claude-flow/cli@latest memory search --query "" # Vector search
npx @claude-flow/cli@latest hooks route --task ""    # Route to agent
npx @claude-flow/cli@latest doctor --fix             # Diagnostics
npx @claude-flow/cli@latest security scan            # Security scan
npx @claude-flow/cli@latest performance benchmark    # Benchmarks
```

26 commands, 140+ subcommands. Use `--help` on any command for details.

## Setup

```bash
claude mcp add claude-flow -- npx -y ruflo@latest mcp start
npx ruflo@latest doctor --fix
```

> The background `daemon` is optional. It runs interval workers that each spawn
> a headless `claude` session, so it consumes tokens continuously. Start it only
> if you want those sweeps: `npx ruflo@latest daemon start` (self-stops after 12h
> by default; `--ttl 0` to disable, `daemon status --all` to audit running daemons).

**Agent tool** handles execution (agents, files, code, git). **MCP tools** handle coordination (swarm, memory, hooks). **CLI** is the same via Bash.

## Agent Team & Orchestration (Workspace Architect)

This workspace is driven by the **Workspace Architect (Winston)** — an SDLC orchestrator that takes each
feature from design → sprint → implemented, reviewed code. Winston orchestrates; a custom 9-agent team,
authored to this codebase (Eona OS), executes. See `project-context.md` (deep briefing) and
`openspec/project.md` (conventions). Pipeline state lives in `workspace.json`; per-feature specs live as
OpenSpec changes under `openspec/changes/{slug}/`.

### The team (`.agent-os/agents/{slug}/`)

| Slug | Persona | Role |
|------|---------|------|
| `architect` | Winston 🏛️ | System architecture & technical design (OpenSpec design, readiness) |
| `pm` | John 📋 | PRDs, epics & stories |
| `ux-designer` | Sally 🎨 | UX/UI — owns the experience (HTML mockups + Framer-grade interaction, 21st.dev) |
| `frontend-dev` | Amelia 💻 | React 19 / Vite dashboard implementation |
| `backend-dev` | Marcus ⚙️ | Hermes-fork engine (FastAPI / Python) implementation |
| `analyst` | Mary 📊 | Domain research & product briefs |
| `researcher` | Ravi 🔬 | Technical research & code investigation |
| `test-architect` | Murat 🧪 | Test design & automation |
| `code-reviewer` | Quinn 🔎 | Adversarial code review (read-mostly) |

### Pipeline & gates

```
Architect (Winston) ─orchestrates→ design → sprint → implement (story-by-story under review)
   ↑ user approves design & sprint gates · ↑ unresolved questions go to the feature's qna.json
```

- **One phase per turn (step-gate).** Each turn writes its artifacts + `workspace.json` and halts at the gate.
- **Design and sprint plans require explicit user approval.**
- **Quality is the Architect's job** — every story's diff is reviewed (Winston + `code-reviewer` + `test-architect`)
  before acceptance; findings logged under `reviews/{feature}/`.
- **Safety rails:** hard-stop on red tests/build; **never `git commit`/`git push` or any irreversible/outward
  action without explicit user approval**; the `code-reviewer` is read-mostly; no agent runs `git commit`.

### Scripts (run from the dashboard or shell)

- `scripts/build.sh` — dashboard build (`tsc -b && vite build`) + engine compile check
- `scripts/run.sh` — `docker compose up -d --build` (dashboard :3737 · engine :8642); host bridge runs separately
- `scripts/test.sh` — dashboard typecheck + engine pytest (falls back to compile check)
