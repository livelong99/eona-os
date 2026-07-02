# Phase 2 — Sprint Planning (per feature)

Reached when the user approved the active feature's design (its `phase` `design-approved` →
`sprint-planning`). Break the approved change into an implementation plan and get the user's
approval before any code is written. `{slug}` = active feature; `{change}` = `openspec/changes/{slug}/`.

## Inputs
`{change}/design.md` + `{change}/specs/**` (the requirement deltas), `openspec/specs/**`, and the
real codebase. The PM teammate (`.agent-os/agents/pm/`) leads this; you orchestrate and ratify.

## Produce tasks (OpenSpec)
Using `bmad-create-epics-and-stories` + `bmad-sprint-planning` as the *method* (spawn the PM via
`Task`, then ratify), author `{change}/tasks.md` — the implementation checklist in OpenSpec form:
- `## 1. <group>` … `## N. <group>` sections, each with `- [ ] 1.1 <task>` items.
- Each task is small, ordered, and traces to a requirement/scenario in the spec deltas. Group by
  capability or layer; no task depends on a later group.

Mirror the tasks as stories into the **feature's** `sprint.stories` in `workspace.json`
(`id` = `{n.m}`, `title`, `epic` = the group, `status: "backlog"`) so the dashboard renders them.

## Q&A gate
If the breakdown needs a user decision (scope cut, priority, MVP boundary), write the questions to
`{change}/qna.json`, set the feature's `phase = "sprint-qna"`, write `workspace.json`, **halt**.
Apply the answers on the next turn and continue.

## Approval gate
When `tasks.md` + the story list are complete, set the feature's `phase = "sprint-planning"`,
`gates.sprint = "pending"`, and a feature `summary` ("N task groups, M tasks ready for approval").
**Halt** for the user.

On the next turn:
- **User approves** → set the feature's `gates.sprint = "approved"`, `phase = "sprint-approved"`,
  write `workspace.json`, and tell the user implementation is ready. Do NOT start a story this turn
  (next gate: `references/4-implement.md`).
- **User requests changes** → revise `{change}/tasks.md` + the story list, re-ratify with the PM if
  substantive, halt again with `gates.sprint = "pending"`.
