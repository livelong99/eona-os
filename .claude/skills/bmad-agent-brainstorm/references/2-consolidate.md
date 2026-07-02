# Stage 2 — Consolidate (write artifacts, halt)

Fold the four specialists' returns into the two artifacts, then end the turn. The dashboard renders these files and collects the user's answers.

## Write `qna.json`

Schema: `engine/schemas/brainstorm_qna.schema.json`. Consolidate every specialist's `questions` into one deduped, categorized list. Tag each question with the asking specialist (`agent`) so the UI can attribute it.

```json
{
  "project": "Smart Pantry",
  "slug": "smart-pantry",
  "brief": "<the original brief>",
  "phase": "clarifying",
  "round": 1,
  "questions": [
    {"id": "q1", "agent": "Feasibility", "category": "Tech constraints",
     "question": "...", "why": "...", "answer": "", "answered": false, "round": 1}
  ],
  "summary": "what we know so far + the biggest open unknowns",
  "open_count": 7,
  "answered_count": 0
}
```

Rules:
- Stable `id`s (`q1`, `q2`, …) — never renumber an existing question across rounds; only append new ones.
- Dedupe overlapping questions from different specialists into one, attributed to the most relevant agent.
- Keep the set tight — the questions with the highest readiness leverage first.

## Write `readiness.json`

Schema: `engine/schemas/brainstorm_readiness.schema.json`. One entry per metric. `creativity/feasibility/reliability/roadmap` scores come straight from the specialists. `completeness` is **your** PM judgement: how fully specified the product is overall.

```json
{
  "metrics": [
    {"key": "creativity",  "label": "Creativity",  "score": 0.6, "threshold": 0.8, "notes": "..."},
    {"key": "feasibility", "label": "Feasibility", "score": 0.5, "threshold": 0.8, "notes": "..."},
    {"key": "reliability", "label": "Reliability", "score": 0.4, "threshold": 0.8, "notes": "..."},
    {"key": "roadmap",     "label": "Roadmap",     "score": 0.5, "threshold": 0.8, "notes": "..."},
    {"key": "completeness","label": "Completeness","score": 0.3, "threshold": 0.9, "notes": "..."}
  ],
  "overall": 0.46,
  "dev_ready": false,
  "blocking": ["feasibility", "reliability", "roadmap", "completeness"]
}
```

`overall` = mean of scores. `dev_ready` = true only when **every** metric is at/above its `threshold`. `blocking` = the metric keys still below threshold.

## Halt

After both files are written, end your turn with a one-paragraph spoken summary for the user: what the swarm surfaced and what you need answered next. Do **not** start the PRD — that only happens once `dev_ready` is true (Stage 4). Honor the step-gate: one stage per turn.
