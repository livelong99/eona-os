# Phase 1 — Design (per feature)

Reached for the **active feature** (`workspace.json.active_feature`) when its phase is
`designing`. Produce the feature's design as an **OpenSpec change** under
`openspec/changes/{slug}/`, gating on the user for anything you can't decide. You write the
design yourself (you are the Architect); use the team for input, not authorship.

Let `{slug}` = the active feature's slug and `{change}` = `openspec/changes/{slug}/`.

## Inputs
`openspec/project.md` + `openspec/specs/**` (established truth), the PRD/docs (`prd.md`,
`docs/**`, `README*`), `{change}/proposal.md` (the feature intent), and the real codebase
(your cwd). For an ingested repo, ground every decision in the actual stack/structure.

## Produce the design (OpenSpec change)
Using `bmad-create-architecture` as the *method*, author the OpenSpec change:
- `{change}/proposal.md` — refine `## Why / ## What Changes / ## Impact`.
- `{change}/design.md` — technical decisions: approach, components touched, data/API contracts,
  cross-cutting concerns (auth, errors, perf, security), trade-offs. For UI features, bring in
  the **UX Designer** + **Frontend Dev** (spawn via `Task`) for the experience + interface design.
- `{change}/specs/{capability}/spec.md` — the requirement **deltas** in OpenSpec format:
  `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements`, each
  `### Requirement: <name>` ("The system SHALL …") with at least one `#### Scenario:` (WHEN/THEN).
Favor boring, proven technology. Keep the change minimal and coherent.

## Q&A gate (when you need the user)
Whenever a decision genuinely depends on the user, **do not guess** — write the open questions to
`{change}/qna.json` (schema `engine/schemas/brainstorm_qna.schema.json`), set the feature's
`phase = "design-qna"` in `features[]`, write `workspace.json`, and **halt**. Tag each question
with the most relevant teammate (`agent`) and a `why`. On the next turn the answers arrive in an
`ANSWERS (JSON)` block — apply them, mark them answered, and continue.

## Hand to review
When the design draft is complete and no blocking questions remain, set the feature's
`phase = "design-review"` (do NOT mark the design gate approved yet), and proceed to
`references/2-design-review.md` **in the same turn** to run the agent review before halting.

One stage per turn: either (a) halt at `design-qna` for answers, or (b) finish the draft + run
the agent review and halt at `design-review` for the user's approval.
