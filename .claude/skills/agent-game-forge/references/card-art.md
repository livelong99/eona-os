---
name: card-art
description: Phase 3 of the forging — delegate deck design to Pip (agent-card-conjurer), run the owner review loop, and export the approved faces and backs as asset files the config will reference.
---

# Phase 3 · Card Art

**Outcome:** an approved deck — every distinct card face plus the back(s) — exported as asset files in `{project-root}/_bmad-output/game-forge/<game-id>/assets/`, ready to be wired into the config's `visuals` manifest in Phase 4.

## Delegate design to Pip

Forge does not draw cards — **Pip** (`agent-card-conjurer`) does, through its Figma Conjuring Loop. Forge's job is to brief Pip well, own the owner-review loop, and get the result out of Figma as files.

Hand Pip:

- **The art direction** from the web dossier — palette (hex), typography feel, iconography, the era/mood, card-layout conventions of the real game. Anchor it to the project's established **"Studio Black"** language where the game has no strong identity of its own (matte black, chartreuse `#E8FF00`, glossy thin-3D cards) so the deck sits coherently beside the existing games.
- **The card inventory** from the rules file — the exact set of distinct faces (e.g. every property in each color set, each money denomination, each action) and how many of each the deck needs, plus the back design(s).
- **Which fields are data vs. art** — so layouts can later bind to config fields (a property card's name/rent vs. its fixed ornament).

Invoke Pip by name and let it run its loop (design → behold → critique → enrich). Pip owns visual richness; Forge owns whether the deck *matches the game and the rules*.

## Owner review loop

The owner is the judge of taste. After Pip produces a deck pass:

1. Show the owner the rendered cards (Pip captures screenshots).
2. Gather **precise** change requests — "the rent band needs to read at thumbnail size", "wrong red for the RED set", not "make it nicer".
3. Feed them back to Pip; repeat.

Loop until the owner approves the deck. Do not advance on your own taste — advance on the owner's sign-off.

## Decide face strategy per deck

Not every game needs bespoke art for every card. Match the v3 `visuals` model (read `deckheads_app/src/types/game/v3/visuals.ts` for the current shape) and the hybrid approach the project uses:

- **Image faces** — bespoke pre-rendered SVGs per distinct card (rich games like Monopoly Deal). Pip designs these; export each as its own asset.
- **Template faces** — config-driven layouts that bind to card fields (text-forward decks like Never Have I Ever / Cards Against Humanity, where the "art" is mostly type + theme). Here Pip designs *one* layout + theme, not N cards; the config renders each card from data.
- **Atlas / built-in** — standard-52 / Persian style decks reuse the engine's built-in manifests rather than new art.

Pick the lightest strategy that's faithful to the game. A 100-card text deck does not need 100 hand-drawn faces — it needs one strong template and a theme.

## Export assets

Get the approved design out of Figma as files Forge controls:

- Export faces and backs (Pip can download assets from Figma; SVG preferred for vector decks, PNG/WebP where raster is required).
- Place them under the working dir `assets/`, named so the config can reference them predictably (e.g. `assets/<group>-<key>.svg`, `assets/back.svg`).
- For template-face decks, export the layout's component pieces and record the theme tokens (palette, fonts) for the config's `theme` block.
- If the `mockup/cards/` HTML→SVG harness (`card-templates.mjs` → `build-cards.mjs` → `to-svg.mjs`) is the faster route for a Studio-Black-style deck, it is a legitimate export path — but design intent still comes from the Pip-led, owner-approved direction.

## Gate

Advance to Config Authoring when the deck is owner-approved and the assets are exported as files in the working dir, with a clear face strategy (image / template / atlas) decided per the rules. Report: the face strategy chosen and the asset count. Then load `references/config-authoring.md`.
