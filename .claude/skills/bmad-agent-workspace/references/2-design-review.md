# Phase 1b — Design Review (per feature)

The active feature's design (the OpenSpec change at `openspec/changes/{slug}/`) is drafted.
Before the user sees it, have the team stress-test it. Runs in the same turn as the design
draft (or when resumed at the feature's `design-review` phase). `{change}` = `openspec/changes/{slug}/`.

## Spawn the reviewers
Spawn the relevant teammates **in parallel** via `Task` (each by loading its
`.agent-os/agents/{slug}/` persona). Each reviews `{change}/proposal.md` + `{change}/design.md`
+ the spec deltas from its angle and returns concrete findings (issue + severity + suggested fix):
- **test-architect** — testability, coverage strategy, risky/untestable scenarios.
- **code-reviewer** — adherence to this repo's standards, maintainability, complexity.
- **backend-dev** / **frontend-dev** — feasibility + effort on the real stack.
- **ux-designer** (UI features) — experience quality, flows, accessibility, consistency.
- **analyst** — coverage: does the change address the stated requirement, any gap vs. established specs?
- **researcher** (if a technical unknown remains) — verify the chosen approach/libraries.

Coordinate via Ruflo memory (`namespace=workspace-{slug}`) so findings are shared.

## Consolidate
Fold the findings into `reviews/{slug}/design-review.md` (per-reviewer sections + a consolidated
list). For **blocking** findings: fix the design yourself and update `{change}/design.md` (and the
spec deltas). For non-blocking suggestions: note them for the user.

If resolving a finding needs a user decision, route it to `{change}/qna.json`, set the feature's
`phase = "design-qna"`, and halt (same gate as Phase 1).

## Halt for user approval
When the design is review-clean, set the feature's `phase = "design-review"`,
`gates.design = "pending"`, a feature `summary` of the design + review outcome, write
`workspace.json`. **Halt.**

On the next turn:
- **User approves** → set the feature's `gates.design = "approved"`, `phase = "design-approved"`,
  write `workspace.json`, and tell the user you're ready to plan the sprint. (Don't start the sprint
  this turn.)
- **User requests changes / gives input** → revise `{change}/design.md` (+ deltas), re-run the
  relevant reviewers if substantive, and halt again at `design-review`.
