# Stage 0 — Intake

Goal: anchor the session. You receive `project`, `brief`, and optional `context_docs` in the launch message.

1. **Use `SESSION_FOLDER`** — the absolute session folder is given in your launch message as `SESSION_FOLDER`. All artifacts go there; do not invent another path. (Derive `{slug}` = kebab-case `project`, e.g. `"Smart Pantry"` → `smart-pantry`, only for naming/memory.)
2. **Read the steering doc** — `Read` `SESSION_FOLDER/CLAUDE.md` (already written for you). It restates the swarm roster, the readiness rubric, and the artifact contract. Treat it as binding.
3. **Read context docs** — if `context_docs` were supplied (paths under `/opt/data/uploads`), read them now so the swarm briefs are grounded.
4. **Seed shared memory** — store the brief and any context highlights in Ruflo memory under namespace `brainstorm-{slug}` so specialists can read it: `memory_store(namespace="brainstorm-{slug}", key="brief", value=...)`. If the claude-flow MCP is unavailable, skip silently.

Do not ask the user anything here — the dashboard drives interaction. Proceed directly into Stage 1 (the swarm probe) within this same turn.
