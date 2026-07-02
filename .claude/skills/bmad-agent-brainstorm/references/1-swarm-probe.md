# Stage 1 — Swarm Probe

Spawn the four specialists **in parallel** with the native `Task` tool. Each is a named sub-agent with a single metric to own. You are the PM — you do not do their analysis yourself; you brief them and wait for their structured returns.

## Coordinate (Ruflo)

Before spawning, call `swarm_init(topology="hierarchical", maxAgents=5, strategy="specialized")` via the claude-flow MCP so the swarm is registered and shares memory namespace `brainstorm-{slug}`. Best-effort: if the MCP is unreachable, proceed with native `Task` only.

## Spawn the specialists

Launch all four in a single message (parallel `Task` calls). Give each the brief, the current known answers, and the **exact return contract** below. Use `subagent_type: "general-purpose"` (or a matching specialist type) and a descriptive `name`.

| Specialist | Metric | Mandate |
| ---------- | ------ | ------- |
| **Creativity** | `creativity` | Push novel directions, break clichés, widen the solution space. What's the non-obvious version of this product? What's been done to death and should be avoided? |
| **Feasibility** | `feasibility` | Technical viability, build effort, architecture constraints, dependencies, hardest-to-build pieces, realistic stack. |
| **Reliability** | `reliability` | Failure modes, edge cases, abuse/misuse, data/privacy/operational risk, what breaks at scale. |
| **Roadmap** | `roadmap` | MVP cut vs later, sequencing, dependency ordering, what is v1 vs v2, the smallest shippable slice. |

## Return contract (every specialist returns this JSON)

```json
{
  "metric": "feasibility",
  "score": 0.0,            // 0..1 readiness for THIS metric given what's known so far
  "notes": "one-paragraph assessment",
  "questions": [           // the clarifying questions that, if answered, would most raise this metric's score
    {"category": "Tech constraints", "question": "...", "why": "why this unblocks the metric"}
  ],
  "risks": ["short risk statements"]
}
```

Instruct each specialist to be concrete and to ask **only** the questions whose answers would materially raise their metric — quality over quantity (aim ≤ 4 each).

When all four return, proceed to Stage 2 (consolidate) in the same turn.
