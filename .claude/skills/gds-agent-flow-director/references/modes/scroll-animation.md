# Mode Playbook — Scroll Animation
> Loaded when mode = scroll-animation. Read `knowledge-base.md` + `reference-brief.md` first.

## Focus
Scroll-triggered web motion: scrubbed image/video sequences, parallax, pinned/stacking, 3D-on-scroll, text-mask reveals. The tool emits, per section, an AI asset prompt + a scroll-interaction spec — it generates no media itself.

## Reference analysis (do FIRST)
Analyze every uploaded image (product, brand, screens, style refs); extract palette, product, style into a verbatim REFERENCE BLOCK. Carry that block VERBATIM into every asset prompt so generated frames stay reference-true. Each section must name WHICH uploaded image to upload to Flow/Whisk as the reference frame seeding its generated sequence (consistent first→last frame, same product, same palette).

## Specialist team (spawn via Task)
| Specialist | Owns |
|---|---|
| Web-motion / Interaction Designer | Storyboard, scroll-beat map, choreography, which pattern per section |
| Sequence / Hero AI Artist | Veo/Whisk/Flow prompts for scrubbed frame sequences; frame count, loopability, consistent first→last frame |
| 3D / Lottie / Vector Artist | Three.js scroll states, Lottie/Rive vector motion |
| Frontend Animation Engineer | GSAP ScrollTrigger / Lenis / CSS scroll-driven / canvas; pin/scrub/preload/breakpoints/perf/a11y |
| Copy / Narrative | Scroll-synced text, beat-aligned headlines |

## Mandatory trend research (Stage 2)
Always research current scrollytelling trends before designing. Seeds (2026):
- Pinned scroll-scrubbed image/video sequence (Apple AirPods style, 100–150 frames).
- Subtle, purposeful parallax via native CSS scroll-driven animations.
- Sticky / pinned stacking cards (`position:sticky` on inner content).
- Horizontal scroll sections.
- Text mask / highlight reveals (GSAP SplitText).
- 3D model on scroll (Three.js / R3F).
- Reveal-on-scroll; scroll-velocity skew/blur.

Trend direction: **restraint + performance + accessibility** (`prefers-reduced-motion`, mobile-safe). Refresh live and name exemplar sites.

## Structure / flow
Piece → Sections (scenes) → scroll beats (each pinned to a 0–1 scroll-progress range) → asset per beat → interaction. Storyboard-first. Patterns: `pinned-sequence` | `parallax` | `stacking-cards` | `horizontal` | `text-mask` | `3D-scroll`.

## Output schema (Stage 5 → flow-prompts.md blocks)
Open with a `## Motion Direction` preamble (the through-line, scroll metaphor, pacing, brand palette). Then one block per section:

`## Section N — title`
- **Pattern** — one of the six patterns.
- **Scroll-beat spec** — ordered beats with scroll ranges (e.g. `0.0–0.3`); trigger / scrub / pin / ease per beat; scroll-length (e.g. `500vh`); breakpoints (mobile DROPS the pin); accessibility fallback.
- **Asset prompt** — the Veo/Whisk/Flow prompt to generate the ~120–150-frame sequence: single continuous motion arc, steady framing, loopable, `first = IN state / last = OUT state`; output WebP frames `0001..0150`.
- **Reference** — which uploaded image → Flow/Whisk reference frame.
- **Implementation notes** — canvas draw on scroll, `frameIndex` mapping, preload strategy, perf budget, Web Vitals (LCP/CLS/INP).

## Prompt directions
Asset prompts must read frame-by-frame correct:
`"[subject] [single continuous camera/motion arc], steady framing, smooth even motion start-to-end, ~5s, no cuts, loopable"`.
Defaults: 100–150 frames; `String(i).padStart(4,'0')`; `anticipatePin:1`; `scrub:true` + `ease:"none"` for sequences; Lenis smoothing; mobile = drop the pin; ALWAYS ship a `prefers-reduced-motion` static fallback (last clean frame).

## Creativity bar (bold but positive)
- **Anti-cliché**: ban gratuitous scroll-jacking that hurts usability; ban motion with no narrative purpose; ban parallax-for-parallax's-sake.
- **Domain-shift seeds**: invent one fresh scroll metaphor drawn from the subject's own story, not a stock template.
- **Guardrails**: reference-true · on-brief · trend-grounded · performant + accessible (a11y/mobile) · purposeful (motion serves the narrative).
