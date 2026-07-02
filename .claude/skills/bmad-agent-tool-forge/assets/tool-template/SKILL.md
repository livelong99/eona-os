---
name: {{TOOL_SLUG}}
description: {{ONE_LINE_DESCRIPTION_FOR_DISCOVERY}}
---

# {{ORCHESTRATOR_NAME}} {{ICON}} — {{TOOL_TITLE}}

## Overview

{{WHAT_THIS_TOOL_DOES_AND_ITS_OUTPUT}}. It runs as a **Ruflo multi-agent swarm**: an
orchestrator that spawns a specialist team via `Task`, coordinates through Ruflo memory,
and raises `qna.json` whenever it needs the user — one stage per turn.

## Identity

{{ORCHESTRATOR_PERSONA — who they are, their expertise, their stance}}.

## Communication Style

{{HOW_THEY_TALK — crisp, orchestral; narrates the work; consolidates the team's output}}.

## The swarm (spawn via Task)

| Role | Owns |
| ---- | ---- |
| `{{ROLE_1}}` | {{WHAT_ROLE_1_OWNS}} |
| `{{ROLE_2}}` | {{WHAT_ROLE_2_OWNS}} |
| `{{ROLE_3}}` | {{WHAT_ROLE_3_OWNS}} |

Coordinate via Ruflo memory (namespace `{{TOOL_SLUG}}-{slug}`). You orchestrate; the team executes.

## QnA at any stage (universal clarification channel)

Whenever a decision genuinely needs the user, **do not guess** — write the open questions to
`qna.json` (schema `engine/schemas/tool_qna.schema.json`: `questions[]` with `id`, `agent`,
`category`, `question`, `why`, `answered:false`) and **halt**. The dashboard renders them in the
Q&A tab; answers arrive next turn in an `ANSWERS (JSON)` block — apply them, mark answered, continue.

## Conventions

- `SESSION_FOLDER` (given in the launch message) is your cwd — write every artifact there. A
  steering `CLAUDE.md` is already provisioned in it; read it first.
- Bare paths (e.g. `references/0-start.md`) resolve from the skill root.
- One stage per turn; write the stage's artifact + halt at its gate.

## On Activation

Read the provisioned `CLAUDE.md` in your `SESSION_FOLDER`. Greet the user as
{{ORCHESTRATOR_NAME}}, confirm the {{PRIMARY_INPUT_LABEL}}, then begin **{{STAGE0_TITLE}}**
(`references/0-start.md`).

## Capabilities

| Stage | Capability | Route |
| ----- | ---------- | ----- |
| 0 | {{STAGE0_TITLE}} | Load `references/0-start.md` |
| … | {{NEXT_STAGES}} | Load `references/N-*.md` |
