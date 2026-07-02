# Stage 4 — PRD Draft (dev-ready)

Reached only when `readiness.json.dev_ready` is true. Synthesize everything — the brief, the full answered `qna.json`, and the specialists' notes in Ruflo memory — into a single refined PRD the architect can pick up and implement.

## Write `prd.md`

Follow the bmad-prd template spine (`.claude/skills/bmad-prd/assets/prd-template.md`). Include, at minimum:

```markdown
---
title: <Project Name>
created: <YYYY-MM-DD>
status: draft
source: brainstorm
slug: <slug>
---

# PRD: <Project Name>

## 1. Vision            — what it is, what it does, why it matters
## 2. Target User & JTBD — primary user, jobs-to-be-done, non-users (v1)
## 3. Glossary          — every domain noun, defined once
## 4. Features          — each with FR-N functional requirements + testable consequences
## 5. Non-Functional Requirements — reliability/perf/security pulled from the Reliability + Feasibility findings
## 6. Non-Goals         — explicit out-of-scope
## 7. MVP Scope         — in/out, from the Roadmap findings
## 8. Success Metrics   — primary + counter-metrics
## 9. Open Questions    — anything still genuinely unknown
## 10. Readiness        — the final per-metric scorecard + one-line justification each
```

Ground every section in the actual Q&A — do not invent. Pull the creative direction from the Creativity findings, the build constraints/NFRs from Feasibility + Reliability, and the MVP cut from Roadmap.

## Finalize

1. Set `qna.json.phase = "prd-ready"` (if not already) and write it.
2. Write `prd.md`.
3. End the turn presenting the PRD to the user for **final approval**. Tell them: review `prd.md`, and when satisfied, use **Promote to workspace** in the dashboard — that copies the whole session folder (Ruflo state + artifacts + PRD) into a workspace for the architect/dev phase.

Do not promote yourself — promotion is a user-gated dashboard action.
