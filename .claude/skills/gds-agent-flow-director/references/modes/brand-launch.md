# Mode Playbook — Brand Launch
> Loaded when mode = brand-launch. Read `knowledge-base.md` + `reference-brief.md` first.

## Focus
A restrained, premium identity film that earns the mark through silence and motion: tease the brand in fragments, reveal it in one decisive beat, state the ethos, and resolve to a clean, sound-synced lockup. Confidence over noise — every frame protects the brand's geometry and palette.

## Reference analysis (do FIRST)
Analyze every uploaded image before writing a single prompt. Extract: logo geometry (silhouette, proportions, counters, stroke weights, construction grid), brand palette as exact hexes, the product itself (form, material, finish), and the typeface/wordmark (family, weight, width, tracking). Carry the reference-brief's brand/product block VERBATIM into every prompt — never paraphrase brand facts. Every output block must name which uploaded image to upload to Flow as an Ingredient / reference frame, so the model sees the real mark and palette.

## Specialist team (spawn via Task)
| Specialist | Owns |
|---|---|
| Brand Strategist | Ethos, positioning, the single true "why" the film must land |
| Creative Director | The through-line connecting tease → reveal → ethos → lockup |
| Motion Designer | Reveal mechanics (match-cut, morph, particle/light), soft-3D depth, kinetic type; flags what is Veo vs what must be AE/Lottie |
| DP | Camera grammar, lens choice, lighting, frame-safe regions, first/last frame design |
| Sound Designer | Native audio bed, sound-synced lockup stinger, silence-then-impact pacing |
| Copy / Typography | Tagline, on-screen wordmark — kept short and flagged for post type |

## Mandatory trend research (Stage 2)
Always research the current best-recognized brand-launch trends, animations, and effects, then refresh live for this specific subject. Seed direction (2026): restraint over spectacle; kinetic typography (letter-by-letter build, tracking expansion, weight/width morph — do real type in AE, not in-model); soft 3D depth (bevels, soft shadow — not chrome/metal cliché); organic morphing tied to the product's real behavior; quiet micro-motion derived from the logo's own geometry; sound-synced stingers; match cuts that share an anchor across the cut; particle and light reveal systems; platform-native variants (16:9 master + 9:16/1:1 cuts). Treat seeds as a floor, not a ceiling.

## Structure / flow
1. **Tease** — fragments only: a curve, an edge, a color field, a material macro. Never the full mark.
2. **Reveal** — the decisive beat: match-cut / morph / particle-or-light convergence into the full mark. This is the peak.
3. **Ethos** — the why: one line or one image that states what the brand stands for.
4. **Logo lockup** — clean resolution of the mark in a frame-safe region, sound-synced stinger on landing.
5. **CTA / endcard** — tagline or URL, minimal, held.

Length 30–90s as chained 4/6/8s clips. Master 16:9; cut 9:16 (and 1:1 if briefed) — protect central action so every aspect ratio reads.

## Output schema (Stage 5 → flow-prompts.md blocks)
Begin with a `## Look Bible` preamble: palette hexes, lens/lighting grammar, motion vocabulary, audio signature, and the frame-safe region reserved for the real logo (composited in post). Then one block per shot:

```
## Shot N — title
**Image prompt:** <Nano Banana hero still — premium, soft-3D, brand palette>
**Video prompt:** <animation of the still; include an inline AUDIO: line for music + SFX + stinger>
**Settings:** Aspect 16:9 · Resolution <res> · Seed <n> · Flow feature <Frames / Ingredients / Extend>
**Reference:** Upload <which uploaded image> to Flow as Ingredient via <Flow feature>
**Negative:** <positive-phrased exclusions>
**Consistency:** <what must hold across cuts — palette, mark silhouette, center position>
```
Reserve frame-safe regions for the real logo and on-screen wordmark — these are composited in post, not rendered by the model.

## Prompt directions (how brand-launch prompts differ)
- Premium, restrained look: soft 3D (bevels, soft shadow), brand-palette ambiance, material honesty.
- Reveal-oriented camera: push-in / dolly / crane / arc that converges on the mark and settles quickly — motion resolves, it does not wander.
- Encode reveal grammar literally so the model obeys it:
  - match cut → "holding the same silhouette and center position across the cut"
  - morph → "color and frame position stay constant while form transforms"
  - particle → "converge into a soft light burst at frame center"
- Audio is music + SFX-driven with a stinger landing exactly on the lockup; specify the stinger beat.
- Keep on-screen text short or omit it, and reserve a frame-safe region for post type.
- Build the Nano Banana hero still FIRST, then animate it via first/last-frame or Ingredients.
- Phrase all negatives positively (describe the clean result, not the forbidden artifact).

## Creativity bar (bold but positive)
- **Anti-cliché — ban the obvious:** generic swoosh/logo-spin, lens-flare reveals, and "particles-forming-the-logo" done generically. If it looks like every other launch, it fails.
- **Domain-shift seeds:** tie the reveal mechanic to a distant domain that matches the brand's core tension (e.g. tension/release, growth/restraint, precision/warmth) — borrow that domain's physics for the morph or particle behavior.
- **Guardrails:** every shot must be reference-true (logo and palette exact), on-brief and on-brand, trend-grounded, Flow-executable (flag real-logo and real-type work as post), and purposeful — no effect without a reason.
