# Phase 2 · Research the Stack

For every sub-component in the tree, find the best React Native path to replicate it — module, library, or first-party API — backed by evidence, not habit.

## What Success Looks Like

- Every sub-component in the Phase 1 tree has a research entry: a primary recommendation, the alternatives considered, the rationale for the choice, and a maintenance-health snapshot (recent releases, open-issue posture, RN version compatibility, new-architecture support).
- Recommendations are driven by what the sub-component actually needs — its animation spec, gesture behavior, and visual effects — not by a default stack. A static badge needs no library; a spring-physics card flip needs the right one.
- Where the mockup uses something with no clean native equivalent (backdrop blur, CSS blend modes, complex keyframes), the entry says so honestly and names the closest achievable approach plus the visual cost.
- The merged research dossier is saved to `{agent.conversion_report_output_path}` and summarized for the user before building begins.

## Your Approach

Dispatch **one web research agent per sub-component**, in parallel. Group trivially similar sub-components (e.g. four icon buttons) under one researcher rather than spawning redundant agents — parallelism should match the real research surface, not the raw leaf count.

Each researcher's brief: the sub-component's spec from the tree, the question "what is the best-maintained, most faithful way to build this in React Native today," and the requirement to return evidence — package names, repo health, code examples — not opinions.

If subagents are unavailable, research the sub-components yourself in spec-priority order: animated and interactive pieces first, static layout last.

Consolidate before recommending: if three researchers each picked a different animation library, converge on one for the project — a coherent stack beats three locally-optimal choices.

## Hand-off

Phase 3 receives the research dossier alongside the component tree. Every "build new" decision downstream should be traceable to a dossier entry.
