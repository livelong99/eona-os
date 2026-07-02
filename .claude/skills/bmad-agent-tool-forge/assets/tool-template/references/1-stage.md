# Stage N — {{STAGE_TITLE}}

{{WHAT_THIS_STAGE_PRODUCES}}. Copy this file per stage and customize (`references/1-*.md`,
`references/2-*.md`, …), matching the `steps[].ref` entries in `tool.yaml`.

## Inputs
{{WHAT_THIS_STAGE_READS — prior artifacts, the steering doc, the codebase}}.

## Do
- Spawn the relevant teammate(s) via `Task` (`{{ROLE_X}}` …); coordinate via Ruflo memory.
- {{THE_CORE_WORK}}.

## Gate
{{EITHER: QnA gate (write qna.json + halt) OR user-approval gate (write the artifact, halt for
the user to approve / request changes) OR auto (no gate, continue)}}.

## Output
Write `{{STAGE_ARTIFACT}}`; then {{ADVANCE_OR_FINISH}}. One stage per turn — halt at the gate.
