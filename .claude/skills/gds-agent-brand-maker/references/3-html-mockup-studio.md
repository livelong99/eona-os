# Stage 3: Basic Logo + Branding Mockup

**Goal:** Render the **one** locked metaphor from Stage 2 as a single, basic, browsable HTML brand preview the user can react to and finalize — *before* any generation prompt is written. The mockup is the brand-research artifact and the contract for everything downstream. The user **sees** their brand here instead of describing it; nothing gets generated until they've signed off.

> **Keep it basic and fast.** This stage produces ONE lightweight `mockup.html` that previews the brand's core identity — not an interactive studio, not multiple directions, not elaborate generative SVG art. Target a compact file that generates in a couple of minutes. Do NOT gold-plate.

## What This Stage Achieves

1. A self-contained **`mockup.html`** the user opens in a browser — a basic preview of the single locked direction, iterated until they finalize it.
2. A short **`design-brief.md`** (the "Director's Brief") derived from the approved mockup — the single source of truth Stage 4 and Stage 5 build every prompt from.

Output both to `${HERMES_VAULT_PATH:-/Users/perkypanda/Documents/Obsidian/Vault}/30_Resources/Brands/{brand-identifier}/`.

## Step 3A — Lock the One Direction

Take the **single locked metaphor** from Stage 2 — you are rendering ONE direction only, not exploring several. Pin its two rigid blocks before you build:

- **Universal Style Block** — a non-negotiable aesthetic definition naming a *real medium and/or design movement* (e.g. *"Flat vector, crisp edges, zero drop shadows, in the spirit of Suprematism"*). Never use the banned "AI-look" keywords (`4k`, `masterpiece`, `glossy`, `hyperdetailed`, `octane render`, etc.).
- **Universal Color Block** — strict palette with semantic role + exact hex (e.g. *"Signal orange #FF5733 — primary mark; charcoal #1A1A1A — ground; bone white #F4F1EA — type"*). Every color gets a role and a hex; no "a warm orange".

Fit-check the direction against the metaphor **and** the Negative Constraint Matrix from Stage 1 before building. Keep this step tight — a few lines per block, not an essay.

## Step 3B — Build the Basic Mockup

Write a single, lightweight, self-contained `mockup.html` (HTML5 + vanilla CSS, **no external dependencies, no CDN, no web-font fetch** — it must render identically offline). Use plain CSS shapes, grid/flexbox, web-safe or system fonts, and the exact proposed hex colors. Keep the markup small and the file compact.

Include **only the basics**, for the one locked direction:

- The **logo mark** blocked out in CSS or **minimal** SVG (a simple geometric mark is fine — NO elaborate generative or illustrative SVG art) — an approximation of structure and color, not the final render, but faithful.
- The **wordmark / logotype** — the brand name set in the proposed type style (system-font stand-in is fine; label the intended family).
- A **color palette strip** — a few swatches with hex labels covering the Universal Color Block.
- A **primary type treatment** — the brand name (and tagline if any) showing the intended weight/case/letter-spacing.
- **At most one or two simple applications** — e.g. an app-icon tile, and/or a simple card or header lockup. Keep these plain CSS; do not build device frames or full asset-suite previews.

Keep it to a single clean page. No interactive controls, no multiple columns of "directions", no animations, and no JS beyond trivial (ideally none). Give the user a clickable `file://` link to open it.

### Build checklist
- [ ] Single lightweight file; opens offline with zero network requests (no `<link>` to a CDN/font host).
- [ ] One direction only — no "Direction 1 / 2 / 3".
- [ ] Logo mark, wordmark, palette strip, type treatment, and at most one or two simple applications — nothing more.
- [ ] Minimal/simple SVG only; no elaborate generative art.
- [ ] Every color in the CSS is one of the Universal Color Block hexes — no stray values.
- [ ] Brand name spelled exactly as captured in `brand-intake.md`.

## Step 3C — Spar & Finalize (HITL)

Present the mockup as a starting point, not a verdict. Run a short, productive Q&A that references what's literally on screen — *"Does the amber accent carry enough weight against the charcoal? Tighten the wordmark letter-spacing or keep it airy?"* Refine and **update `mockup.html` in place** each round (regenerate the file, keep the link stable), until the user finalizes the direction.

Sparring heuristics: lead with a specific observation, not an open "what do you think?"; offer concrete A-or-B choices; when the user reaches for a banned cliché, name it and elevate. Keep edits surgical and the file small. In headless mode, skip the back-and-forth and lock the direction as-is.

## Step 3D — Lock the Director's Brief

Once finalized, write a **short** `design-brief.md` — a tight summary of the locked direction capturing everything downstream prompts need, **no ambiguity, no reliance on memory of the conversation**. Keep it compact; it is a companion to the mockup, not a long document:

- Final **Universal Style Block** and **Universal Color Block** (every color: role + exact hex).
- **Canonical logo description** — the verbatim, reusable description of the mark: exact shapes, exact colors (hex), exact font family/weight/case, exact layout (mark-above-wordmark, baseline sharing, spacing). This single block becomes the consistency anchor pasted *identically* into every Stage 4 image prompt and Stage 5 video brand-block.
- **Brand name** (exact spelling/case) and **tagline** text, in quotes, ready to drop into prompts.
- A few **composition/layout** notes (which inform Stage 4's per-asset blocks).
- Carry-forward of the **Negative Constraint Matrix** (what must never appear).

### Canonical logo description — worked mini-example
> *"DECKHEADS wordmark lockup: the word "DECKHEADS" in uppercase Space Grotesk Bold, tight even letter-spacing, single fill deep-indigo #2B2A6B. To its left, the orbital mark — two solid discs (large #2B2A6B, small signal-orange #FF6A3D) joined by one thin elliptical ring (#2B2A6B, 2px optical weight) implying a locked orbit. Mark and wordmark share one baseline; mark occupies the left 28%, wordmark the right. Flat vector, crisp edges, zero drop shadows. Transparent background."*

This is the block Stage 4 pastes verbatim into every prompt and Stage 5 pastes into every shot's brand-block — write it so a stranger could reproduce the mark from words alone.

## What Good Looks Like

The user has *seen* their brand, not described it. `mockup.html` is a small, clean file that renders offline and clearly communicates the mark, wordmark, color, and type for the one locked direction. `design-brief.md` is short but complete enough that a different operator could write all of Stage 4/5's prompts from it alone, with no access to the chat. Every banned cliché stayed out.

## Done When

- The user has finalized the single locked direction (or headless locked it as-is).
- `mockup.html` is a lightweight, self-contained file that opens offline and shows the logo mark, wordmark, palette, type treatment, and one or two simple applications.
- `design-brief.md` is written (short) with a verbatim canonical logo description, full color block (roles + hexes), exact brand name/tagline, brief composition notes, and the carried-forward Negative Constraint Matrix.

**Transition → Stage 4 (Image Prompt Generation).** Hand `design-brief.md` forward as the sole source of truth. The canonical logo description becomes the consistency anchor embedded in every image prompt; the Universal Color/Style Blocks and Negative Constraint Matrix become the locks. In headless mode, build the basic mockup and lock the brief without pausing.
