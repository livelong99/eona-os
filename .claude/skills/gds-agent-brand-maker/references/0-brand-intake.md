# Stage 0: Brand Intake Q&A

**Goal:** Before any creative work, gather the brand details and personal preferences that let Forge tailor its choices to *this* user and *this* brand. The intake is the briefing every later stage is anchored to — the Core Tension (Stage 1), the metaphors (Stage 2), the mockup directions (Stage 3), the model prompts (Stage 4), and the campaign video (Stage 5) all trace back to the answers captured here.

## What This Stage Achieves

A recorded **`brand-intake.md`** in the brand folder capturing the user's answers to **at least 10** distinct questions. It is the creative brief of record: a different operator could read it cold and know exactly who the brand is for, what the user wants, and where Forge intends to push back.

> Keep the artifact tight — only what's needed for the next stage. Capture answers as crisp bullets, not paragraphs; no padding, no restating the questions back at length.

Output: `${HERMES_VAULT_PATH:-/Users/perkypanda/Documents/Obsidian/Vault}/30_Resources/Brands/{brand-identifier}/brand-intake.md`.

## Step-by-Step Procedure

1. **Pre-fill from what you already have.** Read every kickoff arg, doc, color reference, and existing mockup the user supplied. For each of the question topics below, mark it as `KNOWN` (answer it yourself from the source), `PARTIAL` (you have a hint, confirm it), or `UNKNOWN` (must ask). Never re-ask a `KNOWN` topic — confirm it in one line instead ("I've got the name as *DECKHEADS*, all caps — correct?").
2. **Batch the gaps.** Ask only the `PARTIAL` + `UNKNOWN` topics, in groups of **3–4 at a time**, so it reads as a conversation, not a form. For each question, offer 2–4 concrete example options the user can react to rather than invent from scratch.
3. **Cover ≥10 distinct topics total** (KNOWN + asked). If pre-fill already satisfies 10, still ask 2–3 sharpening questions so the brief is genuinely personalized, not a template echo.
4. **Capture verbatim, then annotate.** Record what the user actually said. Where a preference reads as a likely cliché, append a `⚠ cliché-risk` note (do not argue yet — that's Stage 1/2's job).
5. **Resolve deferrals immediately.** "You decide" is a valid answer: propose a sensible default, write it as `[Forge's call — revisit]`, and move on. Never stall waiting for an answer the user has handed to you.
6. **Write `brand-intake.md`** in the brand folder and confirm the folder/identifier with the user.
7. **Transition** to Stage 1, carrying the brief forward.

## Running Heuristics

- **Adapt, don't interrogate.** The Q&A should feel like a sharp creative director taking a brief, not a web form.
- **Preferences are inputs, not overrides.** Forge's anti-cliché mandate still stands. If a stated preference is a predictable cliché (e.g. "a shield for my security app", "an upward arrow for my finance app"), capture it faithfully, flag it `⚠ cliché-risk`, and surface the tension during Stage 1's Cynic Protocol and Stage 2 sparring — never silently obey, never silently ignore.
- **One question, one decision.** Don't bundle "what colors, and what font, and what vibe?" into a single ask. Split them so each answer is clean.
- **Headless mode:** answer every topic from the provided brief/docs and reasoned defaults; mark each default `[Forge's call — headless]`; never block on input.

## Question Battery (ask ≥10; adapt to context)

Each question carries example options so the user can react. Skip/confirm any topic already supplied.

1. **Logo type** — what form fits best? *Wordmark (text only) · lettermark (initials) · pictorial mark (icon) · abstract mark · mascot/character · combination (icon + text) · emblem/badge.* "Unsure" is fine — Forge will recommend from the rest of the brief.
2. **Name & tagline** — exact spelling and capitalization of the brand name, plus any tagline or one-liner to render. (Get this letter-perfect; it becomes quoted text in every Stage 4/5 prompt.)
3. **What it is & what makes it different** — what the product/game actually is and does, in one sentence; and the single thing that makes it unlike everything else in its space.
4. **Audience & platform** — who it's for (*age, subculture, fandom, sophistication*) and where the mark shows up most: *app icon · app-store listing · in-game UI · social · merch · packaging.*
5. **Personality / tone** — pick a few: *playful · premium · edgy · wholesome · retro · futuristic · gritty · elegant · bold · minimal.* What feeling should it give in the first half-second of seeing it?
6. **Color direction** — any must-use colors (*with hex if known*), any must-avoid colors, or "you decide"? Any emotional goal for the palette (*energetic · calm · luxe · trustworthy · dangerous*)?
7. **Style leaning** — drawn toward *flat vector · 3D/render · hand-drawn · pixel/retro · gradient-rich · clean line art*? (Forge may push back if a leaning trends cliché — that's the job.)
8. **Symbolism & must-haves / must-nevers** — anything the mark must include or must never include? Symbols, objects, or ideas central to the brand; anything off-limits (cultural, legal, personal).
9. **Likes & anti-references** — brands or logos you admire (*and specifically why*), and any you do NOT want to resemble. The "why" matters more than the "what".
10. **Existing assets & hard constraints** — current logo, brand fonts, locked colors, or files to reuse/evolve? Hard constraints (*legal trademarks, platform icon specs, accessibility/contrast, single-color print*)?
11. **Asset priorities** — which deliverables matter most: *app icon · wordmark/horizontal logo · full icon suite · marketing video*? Any priority aspect ratios or placements?
12. **Marketing-video vibe** (feeds Stage 5) — desired energy and pacing (*calm reveal vs. rapid montage*), music/audio mood, and the single key message or call-to-action the campaign must land.

## Worked Mini-Example (how a batch should read)

> **Forge:** Three quick ones to anchor the brand. (1) *DECKHEADS* — all-caps, one word, no space? (2) Who's it for — are we talking lapsed Hearthstone players, tabletop veterans, or first-time mobile-card players? (3) First-glance feeling: should it land as *premium and dangerous*, *playful and inviting*, or *retro-arcade*?
>
> **User:** All caps, yes. Lapsed digital-CCG players, mid-20s to 40s. Premium and a little dangerous.
>
> **Forge (records):**
> - *Name:* "DECKHEADS" — uppercase, single word. (confirmed)
> - *Audience:* lapsed digital-CCG players, ~25–40, competitive nostalgia.
> - *Tone:* premium with an edge of danger — not cute, not retro-arcade.

## Anti-Cliché Checklist (run before writing the file)

- [ ] Did the user name an obvious industry symbol (shield/lock/arrow/gear/lightbulb/swoosh)? → captured **and** flagged `⚠ cliché-risk`.
- [ ] Did a "style leaning" map onto a known AI-default look (glossy 3D gradient app icon, generic flat-pastel startup)? → flagged for Stage 1.
- [ ] Are the admired anti-references recorded with their *reason*, not just the name?
- [ ] Is every must-never explicitly listed so it can seed the Negative Constraint Matrix?

## What Good Looks Like

`brand-intake.md` reads like a tight creative brief: at least 10 topics answered (or explicitly deferred to Forge with a noted default), preferences captured verbatim, and every cliché-risk preference flagged for sparring. A different operator could pick it up and understand exactly who this brand is for, what the user wants, and where Forge intends to challenge them.

## Done When

- ≥10 distinct topics are recorded (answered or `[Forge's call]`).
- Brand name + tagline are captured letter-perfect (they become quoted prompt text downstream).
- At least the must-haves and must-nevers are explicit (they seed Stage 1's matrix).
- `brand-intake.md` is written to the brand folder and the `{brand-identifier}` is confirmed.

**Transition → Stage 1.** Hand `brand-intake.md` to Deconstruction & Anti-Bias as the brief. Specifically pass forward: the one-sentence "what it is + what makes it different" (raw material for the Core Tension) and the full must-never / cliché-risk list (seed for the Negative Constraint Matrix).
