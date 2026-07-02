# Card Craft — Shared Technique Library

The reusable knowledge every Pip capability draws on. Load this alongside any capability prompt.

## Anatomy of a Rich Card

A collector-grade card face is built in ordered layers, back to front. Each layer is a chance for detail; each must stay subordinate to legibility.

1. **Ground** — the base fill or texture: paper grain, linen weave, subtle gradient, foil sheen. Sets the material story.
2. **Border & frame** — the architecture: outer bleed margin, inner keyline, corner ornament, frame molding. This is where deck identity lives most strongly.
3. **Field ornament** — filigree, guilloché, engraving lines, damask, rosettes. The "engraved banknote" richness. Built from components so it repeats cleanly and tiles without seams.
4. **Central figure / pip arrangement** — the court figure, the suit medallion, or the canonical pip layout for numbered cards.
5. **Indices** — corner rank + suit, top-left and bottom-right (rotated 180°). The single most legibility-critical element. Often a third mini-index for fanned-hand reading.
6. **Finish** — highlights, inner shadows, embossing, foil-stamp accents, edge vignette that ties the layers into one object.

## Legibility Laws (non-negotiable)

- Corner indices must read at arm's length and when only the top-left corner is visible in a fan.
- Suit color must distinguish suits instantly — honor the deck's color system; if two suits share a hue, the pip shape must carry the difference.
- Ornament never crowds the indices or the central figure's silhouette. Negative space is a design element, not wasted space.
- Court figures keep a clear silhouette — readable as King/Queen/Jack before the detail registers.

## Standard Card Geometry

- Poker card ratio is 2.5 × 3.5 in → **825 × 1125 px at 300 DPI**, or **250 × 350 px** for screen work. Confirm the target with the user.
- Standard corner radius ≈ 1/16 of the short edge. Bleed margin ≈ 36 px at print scale.
- Indices sit within the corner safe zone, clear of the bleed.

## Figma Construction Patterns

- **Components for everything repeated:** one pip component instanced across the deck; one frame component variant-swapped per suit; index as a component with text + suit-glyph slots.
- **Variables/styles for the palette:** define the deck's colors as Figma variables so a palette change ripples through every card. Same for the type styles used in indices and figures.
- **Auto-layout for index stacks** so rank-over-suit alignment stays exact across ranks.
- **Group by anatomy layer** with clear names (`ground`, `frame`, `ornament`, `figure`, `indices`, `finish`) so the file is editable by a human afterward.

## The Conjuring Loop (design → behold → critique → enrich)

The quality engine behind every capability. One pass is never enough.

1. **Design** the card (or pass) in Figma.
2. **Behold** — `get_screenshot` the canvas and actually look at the render.
3. **Critique with merciless eyes** — sweep against: legibility laws, richness vs. clutter, deck-language consistency, composition balance, ornament quality, finish. List concrete deficiencies (element, problem, fix). "It's fine" is not a critique.
4. **Enrich** — address every deficiency.
5. Repeat until a fresh critique pass finds nothing worth fixing. Then run `{agent.on_card_certified}` if set, and reveal the hidden secret detail to the user.

For higher stakes, fan out the critique to parallel reviewer subagents with different lenses (legibility critic, ornament critic, deck-consistency critic). If subagents are unavailable, run the lenses yourself in one cold pass against the screenshot — judging the image, not your memory of building it.

## Richness Without Clutter — the test

Before adding any detail, ask: does it deepen the card's story or just fill space? Rich decks (Tarot, transformation decks, art decks) layer *meaningful* motifs — suit symbolism echoed in the filigree, a narrative in the court figures. Cheap "busy" decks pile unrelated decoration. Always choose the former.
