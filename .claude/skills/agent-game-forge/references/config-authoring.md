---
name: config-authoring
description: Phase 4 of the forging — map the rules file onto the v3 closed primitive set, wire the exported assets into the visuals manifest, and drive the config to a green validateConfigV3 before any compliance review.
---

# Phase 4 · Config Authoring & Validate

**Outcome:** `<game-id>.json` — a complete v3 game config that expresses every mechanic in the rules file through the closed primitive set, references the Phase-3 assets, and **passes `validateConfigV3` and its targeted tests**. A config that won't validate has no rules to review, so the gate here is the green validator — not your judgment that it looks complete.

## Ground yourself in the real schema first

The v3 type system is still evolving — do not author from memory. Before writing config, read:

- `deckheads_app/src/types/game/v3/` — `equipment.ts`, `delta.ts`, `rule.ts`, `phase.ts`, `termination.ts`, `visuals.ts`, `config.ts`, `index.ts`. This is the contract.
- The **closest bundled precedent** under `deckheads_app/src/games/bundled/v3/` (from the code dossier). Copy its shape; adapt its content. Monopoly Deal is the richest reference; NHIE/Cards-of-Chaos the simplest.
- `deckheads_app/src/engine/v3/validate/validateConfigV3.ts` and its `__tests__/` — what passes and what gets rejected (operator allowlist, bounds, asset-ref checks).

The code dossier's mapping brief already tells you, per mechanic, which primitive and which precedent to use. Author against that.

## The closed primitive set — what you compose with

A new game is **only** these primitives. There is no new TypeScript verb to add; if a mechanic seems to need one, you have not yet found the composition.

- **Equipment**
  - `zones` — ordered/unordered card-id lists (deck, hand, discard, table, in-front-of-player). Scoped global or per-player.
  - `variables` — numeric or collection state, scoped `global.*`, `player[i].*`, or `card.*` (score, money, flags).
  - `lookups` — static numeric tables (e.g. a rent table indexed by set size). Pure data.
- **Formulas** (sandboxed, integer, no `eval`) — the DSL from `engine/expressions/`: `+ - * / %`, comparisons, `and/or/not`, `in`, ternary, aggregates (`count/sum/min/max`, bounded `filter/any/all`), `$refs` (`$global/$player/$card/$zones/$lookup/$action/$target`), member/index. Every value position accepts literal | `$ref` | nested formula.
- **Conditions** — just boolean formulas. There is no separate condition type.
- **Deltas** (the only state changes) — the closed op set: `set`, `add`, `move {from,to,select,count}`, `transfer {from,to,amount}`, `shuffle`, `draw`. Draw/deal/play/discard/transfer/attach are all `move`/`transfer` variants. Reactive windows (e.g. "just say no") are a guarded trigger + a pending-interaction delta.
- **Rules** — `{ on, if: <condition>, do: [<delta>...] }`. Trigger → guard → ordered deltas. Sequencing of `do` lists is your control flow.
- **Phases / turns** — phases declare allowed moves (= triggers); `turn.order` is a formula → next player; `endIf` is a condition.
- **Termination** — `{ quantifier: no|all|some, collection, predicate }` and/or `{ terminal: <condition>, goal: { score: <formula> } }`. This replaces any win-condition enum.

## Authoring approach

Work mechanic-by-mechanic, straight down the rules file, not section-by-section of the config:

1. **Components → equipment.** Each distinct card becomes data; each pile a zone; each tracked number a variable; each rule table a lookup.
2. **Setup → an initial rule/phase** that deals, shuffles, and sets starting values.
3. **Each action → a rule** (`on` the move, `if` its preconditions, `do` its deltas). Encode exact costs/effects from `## Numbers & Tables`.
4. **Reactions → guarded triggers** with a pending-interaction delta, modeled on Monopoly Deal's reactive window.
5. **Win condition → termination**, using the quantifier/predicate or terminal/goal shape.
6. **Encode every number from the rules file literally.** The single most common fidelity bug is an off-by-one or transcribed-wrong table value. Cross-check each against `## Numbers & Tables`.

## Wire the visuals manifest

Attach the Phase-3 assets per the face strategy decided in Card Art and the current `visuals.ts` shape:

- **Image faces** — point each distinct card at its exported asset; declare the back(s).
- **Template faces** — declare the layout (normalized-rect elements bound to `{field}`), the `enums` (value→art/label), `cardProperties`, and the `theme` tokens captured in Phase 3.
- **Atlas/built-in** — reference the engine's built-in manifest.

Verify every asset path the config references actually exists in the working dir `assets/` — `validateConfigV3`'s asset-ref check (and Phase 6's ZIP packager) will reject dangling references.

## The validation gate

Drive the config to green before leaving this phase:

1. Run `validateConfigV3` against `<game-id>.json` (and the targeted validator tests). Capture output to `validation.log`.
2. Fix every error — unknown operator, out-of-bounds formula, schema mismatch, dangling asset ref — and re-run.
3. Repeat until the validator passes clean. Optionally run a headless sim against the existing bot driver if available, to confirm the game reaches a terminal state.

**Do not advance to compliance on a config that fails or partially passes validation.** The compliance reviewer judges *fidelity*; it presumes the config is structurally valid.

## Gate

Advance to Compliance when `validateConfigV3` passes and any targeted tests are green, with the result recorded in `validation.log`. Report: validator status, and any mechanic that required a non-obvious primitive composition (so the reviewer scrutinizes it). Then load `references/compliance-loop.md`.
