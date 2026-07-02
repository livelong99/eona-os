# Create / Switch a Feature

A **feature** is a unit of work (a new capability or an enhancement) that runs its own
design → sprint → implement cycle, maintained as an **OpenSpec change** under
`openspec/changes/{feature-slug}/`.

## Create a feature
When the user asks to create a feature (e.g. "Create a feature: Add CSV export — …"):

1. Pick a kebab-case `slug` (a short verb-led OpenSpec change id, e.g. `add-csv-export`).
2. Scaffold the change at `openspec/changes/{slug}/`:
   - `proposal.md` — `## Why` (the user's intent / problem), `## What Changes` (bullet list),
     `## Impact` (affected specs/capabilities + code areas). Draft from the user's request +
     `openspec/project.md` + the codebase; keep it a proposal, not a full design yet.
   - `tasks.md` — leave a `## 1. …` skeleton (filled during sprint planning).
   - `specs/` — created later with the requirement deltas.
3. Append the feature to `workspace.json.features[]`:
   `{ slug, title, description, phase: "designing", change_dir: "openspec/changes/{slug}",
   gates: {}, sprint: { stories: [] }, created: <ts> }`, set `active_feature = slug`, set
   top-level `phase = "working"`, write `workspace.json`.
4. Immediately begin the design → load `references/1-design.md` for this feature (same turn).

## Switch the active feature
When the user asks to switch/resume a feature: set `workspace.json.active_feature = "{slug}"`
(it must already exist in `features[]`), write `workspace.json`, and resume that feature at its
current `phase` (dispatch per the activation rules). Do not restart completed work.

## Greenfield seed
For a brainstorm/greenfield workspace, provisioning seeds a first feature (`mvp` /
`core-product`) from `prd.md` so the user can start designing immediately — same shape as above.

Operate on **one feature per turn**; everything you write goes inside that feature's
`openspec/changes/{slug}/` and its `features[]` entry.
