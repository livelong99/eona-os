# Stage 1: Deconstruction & Anti-Bias

**Goal:** Strip the brand down to its true, indivisible tension, then explicitly ban the predictable AI clichés so the rest of the process can't drift back to them. This stage is the anti-median spine of the whole pipeline: a generative model defaults to the statistical average for any brief, so before ideating we name that average and forbid it.

## What This Stage Achieves

A recorded **`deconstruct-antibias.md`** in the brand folder holding two artifacts the whole pipeline depends on:

1. **The Core Tension** — a fundamental, indivisible truth about the brand, usually a physical or emotional opposition (e.g. *Chaos vs. Order*, *Permeable vs. Solid*, *Scattered vs. Condensed*, *Hidden vs. Revealed*). Not a tagline, not an adjective, not a feature.
2. **The Negative Constraint Matrix** — the explicit, itemized list of banned lowest-common-denominator visuals for this brand and its industry.

Output: `${HERMES_VAULT_PATH:-/Users/perkypanda/Documents/Obsidian/Vault}/30_Resources/Brands/{brand-identifier}/deconstruct-antibias.md`.

> Keep the artifact tight — only what's needed for the next stage. One Core Tension line plus a focused banned list; no long rationale prose.

## Step-by-Step Procedure

1. **Ingest.** Re-read `brand-intake.md` plus every doc, brief, URL, and existing mockup the user provided. Pull forward the intake's "what it is + what makes it different" line and its must-never / cliché-risk flags.
2. **Strip (Deconstruct pass).** Delete marketing speak (*synergy, innovation, trust, seamless, empower*) and aesthetic adjectives (*sleek, modern, minimalist, clean, bold*). These describe nothing visual — they're noise. Write down what genuine, concrete truth is left underneath.
3. **Name the Core Tension.** From that residue, state the single opposition that actually drives the brand as `A vs. B`. Pressure-test it (see heuristics). State it plainly to the user in one sentence.
4. **Be the Cynic (Anti-Bias pass).** Holding the Core Tension and the industry, predict the **~10 most statistically likely AI outputs** — the visuals a lazy generator reaches for first. Include objects/symbols, palettes, compositions, *and* the "AI-look" render tokens.
5. **Write the Negative Constraint Matrix** as a flat banned list, folding in the intake's must-nevers and cliché-risk flags. These are off the table for the rest of the pipeline.
6. **Write `deconstruct-antibias.md`**, confirm the Core Tension reads as true to the user, and move straight into Stage 2 (no pause needed).

## Deconstruction Heuristics

- **A real tension is an opposition, not a value.** "Trustworthy" is an adjective; *Exposed vs. Protected* is a tension. If your candidate has no built-in opposite, keep digging.
- **Physical/emotional beats abstract.** *Scattered vs. Condensed* gives you geometry to draw; "efficiency" gives you nothing.
- **The "so what" test.** Say the tension aloud and ask "so what would that look like?" If no image comes, it's still a slogan.
- **One tension, not three.** Resist listing several. The single most load-bearing opposition is the seed Stage 2 maps onto distant domains.

## Cynic Heuristics (predicting the median)

- Ask literally: "If I typed *'{industry} logo'* into a generic image model, what are the first ten things it would draw?" Those are your bans.
- Cover four axes, not just objects: **symbols/objects**, **palette**, **composition/treatment**, and **AI-look render tokens** (`4k`, `masterpiece`, `glossy`, `hyperdetailed`, `octane render`, `trending on artstation`).
- Be specific and recognizable. "Avoid generic stuff" is useless; "no upward-right arrow, no navy-and-gold, no Greek column" is a constraint.

## Worked Mini-Example

> **Brand:** DECKHEADS — a competitive digital card game, "premium with an edge of danger."
>
> **Strip:** drop "epic", "next-gen", "immersive". What's left: players assemble a private deck (order, control, identity) and then collide it with an opponent's in a high-variance clash (chaos, risk, reveal).
>
> **Core Tension:** **Control vs. Chaos** — the curated deck (player's order) versus the unpredictable draw and clash (the game's chaos).
>
> **Negative Constraint Matrix (the cynic's ~10):**
> - Objects: literal playing-card fan, single spade/heart suit, dice, poker chips, a crown, dueling swords, a hooded card-shark figure.
> - Palette: casino green-felt + gold; "gamer" black-and-neon-purple gradient; RGB rainbow.
> - Composition: card bursting out of frame mid-throw; glossy 3D bevel on every letter; lens-flare sparkle.
> - AI-look tokens: `hyperdetailed`, `4k`, `epic`, `octane render`, `trending on artstation`.
> - Carried from intake must-never: no gambling/casino imagery.

## Anti-Cliché Checklist (before writing the file)

- [ ] Core Tension is an `A vs. B` opposition, survives the "so what would it look like?" test, and is *slightly uncomfortable* (a real friction, not a comfortable slogan).
- [ ] Matrix names **specific** objects, a **specific** banned palette, **specific** compositions/treatments — nothing vague.
- [ ] Every intake must-never and `⚠ cliché-risk` flag has been folded into the Matrix.
- [ ] The "AI-look" render-token bans are listed explicitly so they can't sneak into Stage 4/5 prompts.

## What Good Looks Like

The Core Tension feels true and a little uncomfortable — a genuine opposition, not a slogan. The Negative Constraint Matrix names specific, recognizable clichés (objects, symbols, palettes, compositions, render tokens), not "avoid generic stuff." The user understands these clichés are now off the table for the entire pipeline.

## Done When

- A single Core Tension is stated as `A vs. B` and the user agrees it rings true.
- The Negative Constraint Matrix lists ≥10 specific banned visuals across all four axes.
- `deconstruct-antibias.md` is written to the brand folder.

**Transition → Stage 2 (no pause).** Carry the Core Tension forward as the thing to map onto distant domains, and the Negative Constraint Matrix as the veto list Stage 2 uses to reject any metaphor that smuggles a cliché back in.
