---
name: intake-and-rules
description: Phase 1 of the forging — identify the game, branch known vs custom, run the custom-game brainstorming Q&A loop, and produce the canonical rules file that the whole pipeline is judged against.
---

# Phase 1 · Intake & Rules Capture

**Outcome:** a confirmed game id, a created working directory, and a `<game-id>.rules.md` file — the canonical, unambiguous specification of how this game is played. Everything downstream (config authoring, compliance) is judged against this file, so its quality is the foundation of the whole forging.

## What "good" looks like

- The game id is `com.deckheads.<kebab-name>`, confirmed with the owner.
- The working directory exists at `{project-root}/_bmad-output/game-forge/<game-id>/`.
- The rules file captures *every* rule needed to play and to win — not a summary. A reader who has never seen the game could adjudicate a turn from it.
- For known games, the rules file is a draft skeleton with sources noted, to be finalized by Research. For custom games, it is complete and self-sufficient before you leave this phase.

## Step 1 — Identify and branch

Determine whether authoritative rules exist on the web:

- **Known game** (e.g. a retail or classic card game with published rules): branch *known*. Capture the game's name, publisher if relevant, and that the rules will be sourced in Research. Write a draft rules file with the section skeleton below and a `## Sources` list to be filled in Phase 2.
- **Custom game** (the owner's own design, or a variant with no canonical published rules): branch *custom*. Do **not** proceed to Research for rules — run the brainstorming Q&A loop below first.

When unsure, ask the owner directly: "Is this a published game I can look up, or your own design I should capture from you?"

## Step 2 (custom only) — Brainstorming Q&A loop

For a custom game, the rules file can only come from the owner. Run a focused, iterative Q&A until you can fill every section of the rules file with no gaps and no contradictions. Drive it — ask one tight cluster of questions at a time, reflect back what you've understood, and keep going until the spec is airtight.

Cover, at minimum:

- **Goal & win condition** — how does a player win? Is there a score, a target, a last-player-standing, a round limit?
- **Components** — what cards/decks/tokens exist? How many of each? What attributes does a card carry (suit, value, color, type, text)?
- **Setup** — starting hands, starting zones, what's dealt/shuffled, initial values.
- **Turn structure** — phases of a turn, what a player may/must do, how turn order advances.
- **Actions** — every move a player can make, its cost, its effect, its preconditions.
- **Interactions & reactions** — can players respond out of turn (blocks, counters, "just say no")? Resolution order?
- **Edge cases** — empty deck, ties, simultaneous wins, illegal-move handling.
- **Numbers** — every concrete value: hand size, costs, payouts, rent tables, thresholds. Vagueness here is the most common cause of an unfaithful config.

Use the `bmad-brainstorming` skill if a structured ideation technique would help the owner think through an underspecified mechanic. Loop until there are zero "we'll figure it out later" items that affect play.

## Step 3 — Write the rules file

Write `{project-root}/_bmad-output/game-forge/<game-id>/<game-id>.rules.md`. This is an Obsidian-compatible project doc — include frontmatter per the project's conventions. Structure the body:

```markdown
# <Game Name> — Canonical Rules

## Overview
One paragraph: theme, player count, what makes it tick.

## Objective & Win Condition
Exactly how a player wins. The terminal condition and the scoring/goal.

## Components
Every card/deck/token, counts, and the attributes each carries.

## Setup
Deal, shuffle, starting zones, initial variable values.

## Turn Structure
Phases of a turn; what is allowed/required in each; how turn order advances.

## Actions
Each action: name, preconditions, cost, effect, targets.

## Reactions & Interrupts
Out-of-turn responses and their resolution order (if any).

## Numbers & Tables
Every concrete value in one place — hand sizes, costs, payouts, rent/lookup tables, thresholds.

## Edge Cases
Empty deck, ties, simultaneous wins, illegal moves.

## Sources       (known games only)
Authoritative URLs / rulebooks the ruleset was captured from.
```

The `## Numbers & Tables` and `## Actions` sections are where compliance failures hide — be exhaustive and exact.

## Gate

Advance to Research when:

- The rules file exists and the game id is confirmed.
- For **custom** games: the Q&A loop is complete — every section is filled, no play-affecting ambiguity remains. The compliance phase will judge the config against *this file*, so an incomplete spec here means an unfaithful game later.
- For **known** games: the skeleton + sources are in place for Research to finalize.

Report: the game id, the branch taken, and (for custom) a one-line confirmation that the rules are airtight. Then load `references/research-dispatch.md`.
