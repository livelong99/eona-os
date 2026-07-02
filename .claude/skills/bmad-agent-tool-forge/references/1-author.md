# Stage 1 — Author the tool (swarm)

Write the COMPLETE tool from `tool-brief.md`, stamping + customizing the template at
`{skill-root}/assets/tool-template/`. Target dir:
`${HERMES_USER_TOOLS_ROOT:-/opt/data/skills}/{slug}/`. Spawn `tool-architect` +
`skill-writer` via `Task`; coordinate via Ruflo memory.

## Create the tool folder + files
Copy the template structure to the target dir and fill every placeholder:

- **`tool.yaml`** — `tool: {slug}`, `title`, `description`, `launch.skill: {slug}`,
  `swarm: true`, `steering: CLAUDE.md.tmpl`, the `inputs` and `steps` from the brief
  (each step: `id`, `title`, `ref: references/N-*.md`, `hitl`, `artifacts`, `ui`),
  and a writable `artifacts_root`. (Schema: `engine/schemas/tool_manifest.schema.json`.)
- **`SKILL.md`** — frontmatter `name: {slug}` + a description; an orchestrator persona
  (name/identity/communication style), a **swarm team table** (the roster from the brief),
  a "QnA at any stage" section (raise `qna.json`, halt), Conventions (SESSION_FOLDER is cwd;
  read the steering CLAUDE.md), an "On Activation" block, and a Capabilities table mapping each
  stage → `Load references/N-*.md`.
- **`customize.toml`** — `[agent]` code/name/title/icon for the orchestrator.
- **`assets/CLAUDE.md.tmpl`** — steering: role, team table, stages, the writable artifacts path,
  the `{{PROJECT}}`/`{{SLUG}}`/`{{FOLDER}}`/`{{BRIEF}}` tokens, and the QnA + safety conventions.
- **`references/0-*.md … N-*.md`** — one per stage: what the orchestrator does, which teammate(s)
  it spawns via `Task`, the artifact(s) it writes, the gate (qna.json / user approval), and the
  step-gate "halt" at the end. The first stage should establish context; gated stages write
  `qna.json` and halt.

## Rules
- **Customize, don't leave template boilerplate** — the persona, team, and stages must be specific
  to THIS tool's goal. A generic copy is a failure.
- Make every `ref` you list in `tool.yaml` actually exist as a file.
- Keep files focused (<500 lines). Devs/writers may Edit/Write under the target dir only.
- **Ponytail for code-writing teams (scoped).** If this tool's swarm includes teammates that
  **write or review code** (e.g. a coder/dev/reviewer in the roster), each such teammate's persona
  (in `SKILL.md`'s team table / the stage brief that spawns it) MUST carry the ponytail code-economy
  mandate from the start — the same block already present in `assets/CLAUDE.md.tmpl`. If the tool
  also provisions standalone per-agent personas under `.agent-os/agents/{role}/`, give them the same
  Claude-Code wiring as the workspace tool (slash command + subagent def per role; see
  `bmad-agent-workspace/references/0-provision.md`). **Exempt:** purely **creative / prompt-only**
  tools (brand-maker, flow-director and similar — their specialists write prompts and creative
  direction, not code). Don't force code-economy on them; ponytail brings no constructive change
  where there's no code to keep lean.

## Output
Write `forge-report.md` (run folder) listing the files created + the tool's stage/team summary,
then proceed to `references/2-validate.md`.
