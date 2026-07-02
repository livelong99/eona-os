# Phase 0 — Provision

The workspace folder has already been ingested (the folder/repo/brainstorm was
copied or cloned to `SESSION_FOLDER` before this turn). Your job: make it ready for
the pipeline. Do this in order, then write `workspace.json` and halt.

1. **Orient** — `SESSION_FOLDER` is your cwd and the workspace root. List it. Read any
   existing `prd.md`, `README*`, `docs/**`, `_bmad-output/**`, `openspec/**`, and an
   existing `CLAUDE.md`. If it came from a promoted brainstorm, the `prd.md` is the spec.
   Note the `source_type` — `folder`/`github` is an **existing project**; `brainstorm` is
   **greenfield**.

2. **Verify Ruflo** — call `swarm_init(topology="hierarchical", maxAgents=12, strategy="specialized")`
   via the claude-flow MCP (namespace `workspace-{slug}`). Best-effort: if unreachable, log it
   and continue — the native `Task` swarm is the required path.

3. **Document the project (existing projects only).** If `source_type` is `folder`/`github`,
   set top-level `phase = "documenting"`, write `workspace.json`, and run
   `references/0b-document.md` to deep-analyze the codebase into `openspec/project.md`,
   `docs/**`, and a root `project-context.md` **before** generating the team — so every agent
   is project-aware. (Greenfield/brainstorm skips this — `prd.md` is the spec; still write a
   short `openspec/project.md` + `project-context.md` from the PRD.)

4. **Update `CLAUDE.md`** — based on the PRD/docs/project-context, update the workspace
   `CLAUDE.md`:
   - If a project `CLAUDE.md` existed, **preserve it** and append/refresh an
     `## Agent Team & Orchestration` section (roster, the pipeline, the safety rails).
   - If auto-written from the template, fill in the project specifics (stack, domain, constraints).
   Never destroy existing project guidance.

5. **Generate the custom team — full BMAD-style agents, authored by `bmad-agent-builder`.**
   Each teammate must **resemble a native BMAD agent** (like `bmad-agent-dev` / Amelia,
   `bmad-agent-pm`, `bmad-agent-architect` / Winston) — detailed and structured, NOT a thin stub.
   The roster is fixed; the content is custom to THIS workspace's PRD/stack/domain (informed by
   `project-context.md`).

   Create exactly these **9** as **agent folders** at `.agent-os/agents/{slug}/` (NOT `.claude/`
   — Claude Code hard-blocks all writes into `.claude/`), each containing a `SKILL.md` +
   `customize.toml`:

   | Slug | Persona model | Maps its menu to |
   | ---- | ------------- | ---------------- |
   | `architect` | `bmad-agent-architect` (Winston) | `bmad-create-architecture`, `bmad-check-implementation-readiness` |
   | `pm` | `bmad-agent-pm` | `bmad-prd`, `bmad-create-epics-and-stories` |
   | `ux-designer` | `bmad-agent-ux-designer` (Sally) | `ui-ux-pro-max`, `frontend-design` |
   | `frontend-dev` | `bmad-agent-dev` (Amelia) | `bmad-dev-story`, `ui-ux-pro-max`, `frontend-design` |
   | `backend-dev` | `bmad-agent-dev` (Amelia) | `bmad-dev-story` |
   | `analyst` | `bmad-agent-analyst` | `bmad-domain-research`, `bmad-product-brief` |
   | `researcher` | research specialist | `bmad-technical-research`, `bmad-investigate` |
   | `test-architect` | Test Architect | `bmad-testarch-test-design`, `bmad-testarch-automate` |
   | `code-reviewer` | `bmad-code-review` reviewer | `bmad-code-review` |

   For **each** role, in order:
   - **Author with `bmad-agent-builder` (required):** invoke the `bmad-agent-builder` skill in
     **headless** mode with a rich brief drawn from the PRD/docs/project-context. It produces the
     native BMAD agent anatomy — a `SKILL.md` (Overview, Identity, Communication Style, Principles,
     Conventions, the standard BMAD "On Activation" steps, a Capabilities menu) plus a
     `customize.toml` `[agent]` block: `name` (a real persona name), `title`, `icon`, `role`,
     `identity`, `communication_style`, `principles[]`, `persistent_facts` (include
     `file:{project-root}/project-context.md` and the PRD), and `[[agent.menu]]` items wired to the
     role's skills (table above). The persona MUST be specific to this workspace.
   - **UX/Frontend capability stack** (for `ux-designer` and `frontend-dev`): bake into their
     persona + `persistent_facts` that they (a) use the `ui-ux-pro-max` and `frontend-design` skills
     for best-in-class modern UI, (b) use **Framer Motion** + micro-interactions for rich animation,
     and (c) pull component references/inspiration from **21st.dev** (the `magic` MCP —
     `mcp__magic__21st_magic_component_builder`/`_inspiration`/`_refiner`, `logo_search` — when
     available) and the web. The **UX Designer owns the experience** (creativity + design thinking):
     it produces an HTML mockup OR pairs with the Frontend Dev to build the UI directly, focused on
     UX and visual design. If the `magic` MCP is unavailable, fall back to the skills + WebSearch.
   - Ensure each agent's `SKILL.md` frontmatter has `name: {slug}` + a clear `description`. The
     **Code Reviewer is read-mostly** (no Edit/Write). **No agent ever runs `git commit`/`push`.**
   - **Ponytail baked in (every agent, from the start):** every generated
     `.agent-os/agents/{slug}/SKILL.md` MUST end with the verbatim `## Ponytail` block below — so
     each teammate carries the code-economy mandate the moment it's spawned. This is non-negotiable
     for the whole 9-agent SDLC roster (all of them write, spec, or review code — the UX Designer
     pairs with the Frontend Dev to build real UI). The block:

     ```markdown
     ## Ponytail (binding) — write only what the task needs

     The rule is never "fewest tokens." Write **only what the task needs, and never cut
     validation, error handling, security, or accessibility** — code is small because it's
     necessary, not golfed. Before writing, read the real code/flow (lazy about the solution,
     never about reading), then climb the ladder and stop at the first rung that works:
     1) does this need to exist? (skip, YAGNI) → 2) already in this codebase? (reuse) →
     3) stdlib? → 4) native platform feature? → 5) installed dependency? → 6) one line? →
     7) only then the minimum that works. Never on the chopping block: trust-boundary
     validation, data-loss handling, security, accessibility. Full standard:
     `.agent-os/standards/ponytail.md`.
     ```
   - **Seed the standard it points to:** ensure `.agent-os/standards/ponytail.md` exists in the
     workspace — if missing, copy this skill's canonical standard there (the block above references
     it) so the pointer resolves inside the provisioned workspace.

   You spawn a teammate by loading its `.agent-os/agents/{slug}/` persona into a `Task` call.

   **Idempotent:** if `.agent-os/agents/{slug}/` exists for all 9, skip regeneration. Verify all 9
   exist before continuing.

   **Claude-Code wiring (every agent, generated alongside the persona).** So the user can invoke any
   teammate directly from Claude Code, generate a slash command + a subagent definition per role.
   Claude Code **hard-blocks the Write/Edit tools inside `.claude/`**, so write these with a Bash
   heredoc (that path is allowed for bash). Derive `{prefix}` once as the workspace's short brand
   token — the lowercased acronym of the slug words (e.g. `cursor-for-pms` → `cfp`,
   `agent-home`/Eona OS → `eona`); reuse the same `{prefix}` for all 9. For **each** of the 9 roles,
   write both files (idempotent — skip if both already exist):

   - `.claude/commands/{prefix}-{slug}.md` — the slash command:
     ```markdown
     ---
     description: Run the {Workspace} {Role} ({Persona}) — {one-line role summary}.
     argument-hint: <story / task>
     ---

     Delegate this request to the **{prefix}-{slug}** subagent ({Persona} {icon} {Role}) using the Task tool with
     `subagent_type: "{prefix}-{slug}"`. Pass the task below verbatim, and have it load its persona from
     `.agent-os/agents/{slug}/SKILL.md` + `customize.toml` and honor the ponytail mandate.

     Task: $ARGUMENTS
     ```
   - `.claude/agents/{prefix}-{slug}.md` — the subagent definition:
     ```markdown
     ---
     name: {prefix}-{slug}
     description: {Role} for {Workspace} — {one-line}. Use to {when to invoke}.
     tools: Read, Write, Edit, Grep, Glob, Bash
     ---

     # {Persona} {icon} — {Role} — {Workspace}

     **Authoritative persona (read on activation):** `.agent-os/agents/{slug}/SKILL.md` and
     `.agent-os/agents/{slug}/customize.toml` are your full role, identity, communication style,
     principles, persistent facts, and menu. Load them first. Repo ground truth: `CLAUDE.md`,
     the workspace docs, and — when working a feature — the active OpenSpec change under
     `openspec/changes/{slug}/`.

     **Safety rails:** hard-stop on red tests/build (bounded retries, then surface); never
     `git commit` / `git push` or any irreversible action without explicit user approval. Do only
     what the task asks.

     ## Ponytail — Code-Economy Mandate (at your core, non-negotiable)

     The rule was never "fewest tokens." It is: **write only what the task needs, and never cut
     validation, error handling, security, or accessibility.** Code ends up small because it is
     *necessary, not golfed.* Read and understand the problem fully first, then climb the ladder and
     stop at the first rung that holds: 1) does this need to exist? (skip, YAGNI) → 2) already in this
     codebase? (reuse) → 3) stdlib? → 4) native platform feature? → 5) installed dependency? → 6) one
     line? → 7) only then the minimum that works. *Lazy about the solution, never about reading.*
     **Never on the chopping block:** trust-boundary validation, data-loss handling, security,
     accessibility. Lower cost/latency is a side effect, never the goal. Full rule:
     `.agent-os/standards/ponytail.md`.
     ```
     Use **role-appropriate `tools`**: the **Code Reviewer is read-mostly** → `tools: Read, Grep, Glob, Bash`
     (no Write/Edit); all other roles keep the full set above. Fill `{Persona}`/`{icon}`/`{Role}` from
     each agent's `customize.toml` so the wiring matches the generated persona.

6. **Scaffold OpenSpec** — create `openspec/` if missing: `openspec/project.md` (conventions, from
   step 3), `openspec/specs/` (established specs — seed from the documenting step for existing
   projects; empty for greenfield), and `openspec/changes/` (per-feature changes). This is where
   every feature's spec is maintained.

7. **Author build/run/test scripts** — detect the stack and write executable `scripts/build.sh`,
   `scripts/run.sh`, `scripts/test.sh` (idempotent; `set -e`; sensible no-op + message if a step
   doesn't apply). Record them in `workspace.json.scripts`. The user runs these from the dashboard.

8. **Write `workspace.json`** — schema `engine/schemas/workspace_state.schema.json`:
   ```json
   {
     "name": "<name>", "slug": "<slug>", "path": "<SESSION_FOLDER>",
     "source": {"type": "folder|github|brainstorm", "ref": "<ref>"},
     "phase": "ready", "mode": "manual",
     "team": [{"id":"architect","name":"<persona>","role":"Architect","file":".agent-os/agents/architect/"}, ...all 9...],
     "scripts": {"build":"scripts/build.sh","run":"scripts/run.sh","test":"scripts/test.sh"},
     "active_feature": null, "features": [],
     "summary": "Team provisioned. Ready to create a feature.",
     "updated": <unix>
   }
   ```

9. **Greenfield seed (brainstorm source only)** — create a first feature from `prd.md` so the user
   can start immediately: add `{slug:"mvp", title:"<product> MVP", phase:"designing", change_dir:
   "openspec/changes/mvp", gates:{}, sprint:{stories:[]}, created:<ts>}` to `features[]`, set
   `active_feature="mvp"` and `phase="working"`, scaffold `openspec/changes/mvp/proposal.md` from the
   PRD, and **begin its design** (`references/1-design.md`) this turn. For an **existing project**,
   leave `features` empty and wait for the user to create one.

10. **Halt** — end with a one-paragraph spoken summary: what was ingested (+ documented, if existing),
    the team you generated (each one ponytail-baked and invokable from Claude Code via
    `/{prefix}-{slug}`), the scripts available, and that you're waiting for the user to **create a
    feature** (or, greenfield, that the MVP design is underway). Honor the step-gate.
