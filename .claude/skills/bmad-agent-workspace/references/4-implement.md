# Phase 3 — Implementation (per feature, story loop)

Reached when the user approved the active feature's sprint (its `phase` `sprint-approved` →
`implementing`). Implement the feature's tasks **one at a time, under your review**, never
running ahead of the gate. `{slug}` = active feature; `{change}` = `openspec/changes/{slug}/`.

Read `workspace.json.mode` (`manual` | `auto`) and the feature's `sprint.current_story` each
turn, and the checklist `{change}/tasks.md`.

## Per-story cycle
For the next task/story (first `backlog`/`ready-for-dev` in the feature's `sprint.stories`, or
`sprint.current_story` when resuming):

1. **Spec** — run `bmad-create-story` to flesh out the task into a workable story (context +
   acceptance from the relevant scenario). Status → `ready-for-dev`.
2. **Implement** — spawn the relevant teammate(s) via `Task` (load their `.agent-os/agents/{slug}/`
   persona): `frontend-dev`/`backend-dev` run `bmad-dev-story` (red-green-refactor); for UI work the
   **ux-designer** drives the experience (mockup or pairs directly with frontend-dev);
   `test-architect` authors/extends tests. Status → `in-progress`. Coordinate via Ruflo memory
   (`workspace-{slug}`). Check off the corresponding `- [ ]` items in `{change}/tasks.md`.
3. **Tests/build** — run the project's tests + build (prefer `scripts/test.sh` / `scripts/build.sh`).
   **HARD-STOP:** if red and the team can't fix it within a few bounded attempts, set the story
   `blocked` with a clear `summary`, write `workspace.json`, **halt + surface — even in auto.**
4. **Architect review** — YOU review the diff for quality; spawn `code-reviewer` (+ `test-architect`).
   Write findings to `reviews/{slug}/{story}.md`. Fix any blocking findings.
5. **Settle the story** — status → `review`; record the feature's `sprint.stories[i].review =
   {verdict, findings, file}` and the changed `File List`.
   - **MANUAL mode:** write `workspace.json` and **halt** for the user's review.
   - **AUTO mode:** the review is **non-blocking** (logged); mark the story `approved` and continue
     to the next story in the same turn (loop), still hard-stopping on red.

## Gates (manual mode)
On the next turn:
- **User approves** → story `done`; advance `sprint.current_story`; if none remain, **archive the
  change** (below) and set the feature's `phase = "done"`.
- **User requests changes** → revise per the feedback, re-run tests + review, halt again at `review`.

## Archive on completion (OpenSpec)
When all stories are `done`: fold the change's spec deltas into the **established** specs —
apply each `## ADDED/MODIFIED/REMOVED` block to `openspec/specs/{capability}/spec.md` (create the
capability spec if new), then move the change to `openspec/changes/archive/{slug}/`. Tick every
`tasks.md` item. Set the feature's `phase = "done"`, write `workspace.json`, and summarize what
shipped + the consolidated review log. Top-level `phase` returns to `ready`/`working`.

## Mode toggle
The user toggles mode via a directive. **"switch to auto"** → set `workspace.json.mode = "auto"`
and implement the remaining stories autonomously (halting only on a hard-stop or when all are done).
**"switch to manual"** → set `mode = "manual"` and resume the per-story gate.

## Safety rails (always, both modes)
- **HARD-STOP on red tests/build** (bounded retries → halt + surface).
- In **auto**, per-story review is **non-blocking** but still written to `reviews/{slug}/`.
- **NEVER run `git commit`/`git push`** or any irreversible/outward action without explicit user
  approval. Bash is for building/testing/inspecting only.
