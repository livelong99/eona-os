# Mode Playbook — Digital Marketing Posts & Videos
> Loaded when mode = social-posts. Read `knowledge-base.md` + `reference-brief.md` first.

## Focus
Multi-format social (static, carousel, reel) across IG/TikTok/LinkedIn/Shorts; one brief → a content batch. You write copy-paste prompts + copy only; you generate no media. Every block must drop straight into Google Flow / Veo 3, Nano Banana, Midjourney, or Flux, plus the caption/CTA copy the post ships with.

## Reference analysis (do FIRST)
Analyze every uploaded image — product shots, brand assets, people/talent. Extract and lock: product (form, materials, key features), palette (exact hues + roles), brand (logo, type, voice cues), identity (faces, wardrobe, styling). Carry this extracted block VERBATIM into every downstream prompt so the whole batch reads as one series. Each post explicitly names WHICH uploaded image to upload to Flow / Nano Banana as the reference image, so series consistency survives across formats and channels.

## Specialist team (spawn via Task)
| Specialist | Owns |
|---|---|
| Social Strategist | Pillar/brief → channel mix, format choice (static vs carousel vs reel), batch/calendar shape, per-platform native fit |
| Hook & Copywriter | First-3s hook, on-screen text, caption, CTA, Social-SEO keywords, hashtags |
| Short-form Video/Motion Director | Veo/Flow prompts, beat breakdown, transitions, SFX, 9:16 framing |
| Carousel/Graphic Designer | Nano Banana/MJ/Flux image prompts, slide deck, panoramic/seamless layouts, in-image text, cross-slide style consistency |
| Channel Specialist | TikTok raw vs IG polished vs LinkedIn dwell-time; per-platform specs, durations, safe zones |

## Mandatory trend research (Stage 2)
ALWAYS research current social trends before writing. Seed set (2026), refresh live:
- **Hook formulas:** curiosity gap, loss-aversion, movement hook, ASMR, confessional, direct-address.
- **Reels:** ASMR / quiet content, "seeing if the algorithm prefers ___", episodic series, authentic > polished.
- **Transitions:** line-by-line text reveals, zoom-on-keyword, pattern interrupts.
- **Carousels:** seamless panoramic spreads, mixed media, bold 5–8 word cover slide, completion-rate-driven sequencing.
- **Platform-native:** TikTok authentic/lo-fi, IG curated + original audio, LinkedIn dwell-time + insight density.
- **Model rule:** carousel + in-image text → **Nano Banana**; cinematic hero → **Midjourney**; photoreal 4K → **Flux**.

## Structure / flow
- **Short video (7–30s):** hook (0–2s) → value (2–20s, 1–3 beats; each beat = one ~8s Veo clip) → CTA (overlay text). Cut on the beat boundaries.
- **Carousel:** hook slide (5–8 word headline carries ~80% of the weight) → 5–7 value slides → soft CTA mid-deck + hard CTA on the final slide.
- **Batch:** one pillar → ~10 posts spread across channels. Reels 9:16 (1080×1920); carousels 4:5 (1080×1350); 1:1 (1080×1080) or 16:9 as the post needs.

## Output schema (Stage 5 → flow-prompts.md blocks)
Open with a `## Content Direction` preamble (pillar, batch logic, channel split, locked style reference). Then one block PER POST:

`## Post N — Platform · Format`
- **Hook** — formula name + the exact words.
- **Image prompt** — model-tagged (Nano Banana / MJ / Flux); aspect front-loaded; any in-image text quoted with a font-style note.
- **Video prompt** — (reels only) Veo per beat, timestamped, AUDIO inline, 9:16.
- **On-screen text** — per slide or per beat, listed in order.
- **Caption** — Social-SEO, channel-native voice.
- **Hashtags** — mix of broad + niche.
- **Reference** — which uploaded image to upload as the consistency reference.
- **Settings** — aspect / format / duration.

For carousels, list slide-by-slide image prompts that all cite ONE locked style reference so the deck stays seamless.

## Prompt directions
- **Veo:** [Cinematography] + [Subject] + [Action] + [Context] + [Style & Audio] + SFX + quoted dialogue. Keep on-screen text OUT of the Veo prompt (Veo renders text unreliably) — deliver overlays in the **On-screen text** field instead.
- **Nano Banana:** [Subject] + [Action] + [Location] + [Composition] + [Style]; quote + font-style any in-image text; state the aspect; pass reference images for cross-slide consistency.
- Match tone to the channel: TikTok raw and direct, IG polished and aspirational, LinkedIn insight-led and dwell-worthy.

## Creativity bar (bold but positive)
- **Anti-cliché:** ban generic stock-graphic posts; ban hooks that don't earn the scroll-stop.
- **Domain-shift seeds:** offer one fresh hook or format angle for the pillar drawn from outside the obvious category.
- **Guardrails:** every post stays reference-true, on-brief, trend-grounded + platform-native, executable as-written, and purposeful (drives a save / share / dwell).
