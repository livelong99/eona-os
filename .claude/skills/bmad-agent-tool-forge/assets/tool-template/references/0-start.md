# Stage 0 — {{STAGE0_TITLE}}

The opening stage. {{WHAT_HAPPENS_HERE — gather context / intake, set up the work}}.

## Inputs
Read the launch inputs + the provisioned steering `CLAUDE.md`. {{ANY_FILES_OR_DOCS_TO_READ}}.

## Do
- Spawn `{{ROLE_1}}` (and others as needed) via `Task` with a clear brief; coordinate via Ruflo
  memory (`{{TOOL_SLUG}}-{slug}`).
- {{THE_CORE_WORK_OF_THIS_STAGE}}.

## Clarify (QnA gate)
Whenever you need the user, write the open questions to `qna.json` (schema
`engine/schemas/tool_qna.schema.json`) and **halt**. Apply the answers next turn.

## Output
Write `{{STAGE0_ARTIFACT}}` to the session folder, then {{ADVANCE — proceed to references/1-*.md,
or halt for the user's review}}.
