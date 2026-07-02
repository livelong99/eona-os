---
name: compliance-loop
description: Phase 5 of the forging — spawn a fresh, independent reviewer to diff the validated config against the rules file, and loop back to Phase 4 to fix discrepancies until the reviewer certifies zero remain.
---

# Phase 5 · Compliance Loop

**Outcome:** a `compliance-report.md` certifying that the config faithfully reproduces the rules file — **zero open discrepancies**. This is the gate that makes the forging trustworthy: a config can be perfectly valid and still play the wrong game. This phase exists to catch exactly that.

## Why a fresh reviewer

The agent that authored the config is blind to its own gaps — it will "read" the rules into the config it already wrote. So the reviewer must be a **fresh, independent subagent** that has not seen your authoring reasoning. Spawn it with the `Agent` tool, give it only:

- the rules file (`<game-id>.rules.md`) — the spec, the source of truth,
- the config (`<game-id>.json`),
- the web dossier (for the authoritative ruleset + fidelity watch-list on known games),
- and the closed-primitive reference (so it can read what the config actually does).

If subagents are unavailable, you may self-review — but do it adversarially, line by line against the rules file, as if you were trying to *prove the config wrong*.

## What the reviewer checks

Brief the reviewer to compare the config's encoded behavior against the rules file and the researched ruleset, and to produce findings as a precise discrepancy list. It must check:

- **Numbers** — every value in `## Numbers & Tables`: costs, hand sizes, payouts, rent/lookup tables, thresholds — matches the config's variables/lookups/formulas exactly.
- **Actions** — each action's preconditions, cost, effect, and targets are encoded as a rule that does what the rules file says, no more, no less.
- **Turn structure & phases** — allowed moves per phase, turn-order advancement, and `endIf` match.
- **Reactions** — out-of-turn responses and their resolution order are modeled correctly.
- **Win condition** — the termination shape produces a win exactly when the rules say.
- **Edge cases & the fidelity watch-list** — ties, empty deck, simultaneous wins, set-completion bonuses, reaction timing — the rules most often mis-encoded.

Each finding must be precise: **rule → expected behavior per the rules file → what the config currently does**. Vague findings ("rent feels off") are not actionable; demand specifics ("RED 3-card rent should be 6 per `## Numbers & Tables`; lookup `rent.red[2]` encodes 5").

## The loop

1. Spawn the reviewer; collect findings into `compliance-report.md`.
2. If **zero discrepancies** → certify and advance. Record the clean report.
3. If discrepancies → for each, decide:
   - **Config is wrong** → return to Phase 4 (`config-authoring.md`), fix the config, **re-run `validateConfigV3`** (a fix must never break validation), then return here.
   - **Rules file is wrong/ambiguous** → correct it with the owner, note why in the report, and re-check.
4. After fixing, **spawn a fresh reviewer again** — do not let the same reviewer "confirm" its own earlier read, and do not assume a fix is clean without re-review. Re-validation + re-review is the whole point of the loop.
5. Repeat until a fresh review reports zero open discrepancies.

Surface the iteration count and remaining discrepancies each pass so convergence is visible: `Compliance pass #3: 0 discrepancies — certified.`

## Never wave off a discrepancy

A discrepancy is resolved one of two ways: the config is fixed, or the rules file is corrected (with the owner and a reason). "It's close enough" is not a resolution. The compliance gate is binary, like the validator gate.

## Gate

Advance to Delivery only when a fresh compliance review certifies **zero open discrepancies**, recorded in `compliance-report.md`, and the config still passes `validateConfigV3` after the last fix. Report: the number of passes it took and that the config is certified faithful. Then load `references/delivery.md`.
