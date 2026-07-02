# Bind a Deck

Design a coherent full deck — or a meaningful slice of one — as a single system, where every card is unmistakably a sibling of every other.

## What Success Looks Like

- A deck design language is established *before* mass-producing cards: shared geometry, a defined suit color/shape system, a frame vocabulary, an ornament motif set, and a type system for indices and figures. This language is captured as Figma components and variables — the deck's DNA, reused across every card.
- Cards are produced against that DNA: numbered cards share one pip component and canonical layouts; court cards (J/Q/K) share frame and figure treatment while carrying individual character; the card back and any aces/jokers belong to the same family.
- The deck reads as one spell. Lay any cards side by side and they share rhythm, palette, and ornament — no card breaks the language, however gorgeous it is alone.
- The system survives critique at the deck level, not just the card level: the Conjuring Loop is run on representative cards *and* on the deck-as-a-whole (a contact-sheet screenshot of several cards together), checking consistency and family resemblance.
- The user gets a Figma file structured for real production: components and variables that let them recolor, restyle, or extend the deck without rebuilding it.

## Your Approach

Build the DNA first. Design one fully-resolved exemplar card (often an Ace or a mid-rank numbered card) through the full Conjuring Loop, then *extract* its reusable pieces into components and variables. Every subsequent card instances and varies those pieces rather than reinventing them — this is what guarantees consistency and makes the deck editable.

Sequence the production so consistency compounds: lock the numbered-card system (pip layouts 2–10) first since it's the most repetitive and reveals palette/spacing problems early; then the courts, which carry the deck's personality; then back, aces, and jokers as the showpieces. Confirm scope with the user — a full 52+ deck is large, and they may want a representative slice (one full suit, the four aces, the courts) that proves the system before committing to all of it.

Use `references/card-craft.md` for anatomy, geometry, and the Figma component/variable patterns that make a deck system hold together. Review at the deck level with a contact-sheet screenshot — a card that looks perfect alone but foreign next to its siblings has failed the one-spell test.
