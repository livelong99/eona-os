---
name: research-dispatch
description: Phase 2 of the forging — dispatch two parallel research subagents (web aesthetics + authoritative rules, and code mapping onto v3) and finalize the rules file from what they return.
---

# Phase 2 · Research Dispatch

**Outcome:** two dossiers and a finalized rules file. The **web dossier** gives the game's authoritative rules (for known games) and its visual identity (for card art direction). The **code dossier** gives a concrete map of how this game's mechanics land on the v3 primitive set, anchored in the actual engine code. Both feed everything downstream.

## Dispatch both in parallel

Spawn the two subagents in a **single message**, both `run_in_background: true`, then wait for both to report before advancing. They share nothing, so serializing them wastes time. Give each a clear name and tell it exactly what artifact to produce and where.

Use the `Agent` tool (general-purpose or Explore subagent types are fine). Brief them precisely:

### Subagent A — Web Researcher (brand, aesthetics, rules)

Brief it to produce `{project-root}/_bmad-output/game-forge/<game-id>/web-dossier.md` covering:

- **Visual identity** — the game's brand, palette (with hex where discoverable), typography feel, iconography, card-layout conventions, the era/mood of the real product. This is the art direction Pip will work from in Phase 3.
- **Authoritative rules** (known games only) — the definitive ruleset from primary sources (official rulebook, publisher site, well-regarded rules references). Capture exact numbers — costs, hand sizes, payout/rent tables, win thresholds. Cite every source URL.
- A short **"fidelity watch-list"** — the rules most often gotten wrong or most easily mis-encoded (e.g. tie-breaks, reaction timing, set-completion bonuses).

For **custom** games, the rules already live in the rules file from Intake — point the web researcher at aesthetics only (theme, palette, mood), or skip it if the game is visually abstract.

### Subagent B — Code Researcher (v3 mapping)

Brief it to produce `{project-root}/_bmad-output/game-forge/<game-id>/code-dossier.md`. It must read the **actual current engine**, not work from assumptions, because the v3 schema is still evolving. Point it at:

- `deckheads_app/src/types/game/v3/` — the config shape: `equipment` (zones, variables w/ scopes, lookups), `delta` (the closed op union), `rule` (trigger/guard/do), `phase`, `termination`, `visuals`, and the `GameConfigV3` root.
- `deckheads_app/src/games/bundled/v3/` — existing worked examples (`nhie`, `cards-of-chaos`, `trump`, `monopoly-deal`). Monopoly Deal is the richest reference (property sets, rent via lookup, reactive "just say no", attachments as moves into a slot zone).
- `deckheads_app/src/engine/expressions/{tokenize,parse,evaluate}.ts` — the formula DSL (operators, aggregates, `$refs`) available to express conditions and values.
- `deckheads_app/src/engine/v3/validate/` — what `validateConfigV3` enforces (operator allowlist, bounds), so the config is authored to pass.

Ask it to return a **mapping brief**: for each mechanic in the rules file, which primitive(s) express it (which zones, variables, lookups, formulas, deltas, rules, phases, termination shape), and which existing bundled game has the closest precedent to copy from. Flag any mechanic it could **not** map to an existing primitive — those are the risk areas for Phase 4.

## Finalize the rules file

When both dossiers return:

- Merge the web researcher's authoritative ruleset into `<game-id>.rules.md` (known games), filling the `## Numbers & Tables`, `## Actions`, and `## Sources` sections exactly. Resolve any conflict between sources in the owner's favor or flag it.
- Fold the fidelity watch-list into `## Edge Cases` so the compliance reviewer later checks those explicitly.
- The rules file is now **frozen as the spec** for compliance. Note its finalization in the working dir.

## Gate

Advance to Card Art when both dossiers exist and the rules file is finalized (authoritative ruleset captured with exact numbers; art direction in hand). Report: a one-line summary of the art direction, and any mechanic the code researcher flagged as hard-to-map (so the owner knows the Phase-4 risk up front). Then load `references/card-art.md`.
