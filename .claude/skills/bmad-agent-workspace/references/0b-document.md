# Phase 0b — Document the Project (existing projects)

For an **existing project** (source `folder`/`github`), deep-analyze the codebase BEFORE
generating the team, so every agent is project-aware end to end. Reached during provisioning
with top-level `phase = "documenting"`.

## Analyze (fan out)
Survey the repo first (languages, package manifests, entry points, top-level dirs, configs,
tests). Then spawn researchers/analysts **in parallel** via `Task` to map subsystems — e.g.
one per major area (frontend, backend/API, data layer, build/CI, domain logic) — each returning
a concise structured map (purpose, key modules, patterns, external deps, risks). Coordinate via
Ruflo memory (`workspace-{slug}`). Read real code, not guesses; cite file paths.

## Produce the documentation
Drive `bmad-document-project` (the *method*) and consolidate its output into:
- **`docs/**`** — the structured project documentation it generates (architecture overview,
  module/component docs, data model, conventions, how-to-run). Preserve any existing `docs/`.
- **`openspec/project.md`** — the OpenSpec project conventions: tech stack, structure, coding
  conventions, testing approach, and "how changes are made here". This is the standing context
  every OpenSpec change builds on.
- **`project-context.md`** (workspace root) — a tight, high-signal end-to-end briefing (≤ ~400
  lines): what the system does, its architecture, the main flows, the stack, the conventions, and
  the landmines. This is referenced as a `persistent_fact` by every generated agent.

For a **greenfield/brainstorm** workspace, skip the heavy analysis: write a short
`openspec/project.md` + `project-context.md` derived from `prd.md`.

## Seed established specs (optional, existing projects)
Where the current behavior is clear and worth pinning, capture a few **established** capability
specs under `openspec/specs/{capability}/spec.md` (`### Requirement:` + `#### Scenario:`) so future
feature changes have a baseline to delta against. Don't try to spec the whole system — capture the
load-bearing capabilities.

## Continue provisioning
When the docs exist, **return to `references/0-provision.md` step 4** (CLAUDE.md → generate the
team with `project-context.md` in their `persistent_facts` → openspec scaffold → scripts → write
`workspace.json` `phase = "ready"`). If this turn is getting long, it's fine to write
`workspace.json` (still `phase = "documenting"`) and halt; the next turn resumes here, sees the docs
exist, and proceeds to team generation.
