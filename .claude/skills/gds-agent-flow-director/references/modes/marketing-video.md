# Mode Playbook — Marketing Video
> Loaded when mode = marketing-video. Read `knowledge-base.md` + `reference-brief.md` first.

## Focus
Performance ad. The 3-second hook decides hold-rate and CTR — treat the hook as the highest-leverage asset and over-invest there. Every beat earns the next second. Structure on PAS or AIDA; conversion is the only scoreboard.

## Reference analysis (do FIRST)
Analyze every uploaded image — product shots, brand assets, people. Extract: product (form, label, hero angle), palette (named hex), brand (logo, type, tone). Write the extraction once and carry that block VERBATIM into every shot. Each block must name which uploaded image to upload to Flow as an Ingredient. Flag any product claim, before/after, or real-person likeness as **SHOOT-REAL** — do not generate it; mark it for live capture or stock.

## Specialist team (spawn via Task)
| Role | Owns |
|------|------|
| Performance Strategist | Framework (PAS / AIDA / Hook-Body-CTA), placement + length + aspect, hold-rate & CTR targets, variant test plan |
| Hook Writer | First 2–3s pattern interrupt; 5–10 hook variants per concept |
| Scriptwriter / Copy | VO + on-screen copy to word budget; conversational "ugly-ad" tone, no corporate gloss |
| DP | Camera grammar — crash zoom, whip pan, 360 orbit, dolly; organic-creator vs produced look |
| Motion / Kinetic-Type Designer | Caption spec: 2–4 word chunks @600–900ms, keyword color pops, centered oversized hook |
| CTA / Conversion Specialist | One specific action, urgency, social proof, end-card |

## Mandatory trend research (Stage 2)
ALWAYS research current ad trends before writing. Seed set (2026 — refresh live):
- Pattern-interrupt hooks: crash zoom, color flash, object drop + bold SFX in first frame.
- Result / before-after shown FIRST, story second.
- Question / controversy / curiosity hooks to stop the scroll.
- Kinetic typography slowed down: 2–4 words @600–900ms, keyword color pops, centered oversized hook ~80–120px on 1080×1920.
- "Ugly ads" / selfie aesthetic that does not look like an ad.
- AI + UGC fusion (AI talking heads over real product).
- Meme pacing + hard jump cuts.
- Mass-variant testing (ship many hooks, let the platform pick).

## Structure / flow
Hook → Problem → Solution → Proof → CTA.
- **PAS** for ≤30s pain-led products. **AIDA** for ≥30s cold / education.
- 30s reference: hook 3–5s · body 10–15s · solution/proof 5–8s · CTA 3–5s.
- Word budgets: 15s ≈ 40w · 30s ≈ 75–85w · 60s ≈ 150–170w.
- Lengths: 6 / 15 / 30s. Aspect: 9:16 default, also 1:1, 4:5, 16:9.
- The hook is its own clip — write 5–10 hook variants. Chain 8s clips with first-frame = previous last-frame.

## Output schema (Stage 5 → flow-prompts.md blocks)
Each block: `## Shot N — title` with bold fields:
- **Image prompt** — the establishing/first frame.
- **Video prompt** — motion + inline AUDIO (quoted VO, SFX, music cue) in one paragraph.
- **On-screen text** — caption / kinetic-type spec (chunking, color pops, hook size).
- **Settings** — Aspect · Resolution · Seed · Flow feature.
- **Reference** — uploaded image → Flow Ingredient + which feature.
- **Negative** — positive-phrased exclusions.
- **Consistency** — how this block locks to the look bible / prior frame.

Precede all shots with a `## Look Bible` preamble (palette, type, tone, camera grammar) and end every prompt with the brand suffix. Include a `## HOOK VARIANTS` section listing 5–10 hook lines.

## Prompt directions
- Lead hook shots with the camera move + pattern interrupt (e.g. "crash zoom in on…").
- Quote dialogue verbatim for AI-UGC talking heads.
- Always include SFX / Ambient / music-cue lines in the audio.
- Leave text-safe zones (center + lower third); prompt "do not include captions" and add captions in edit.
- Timestamp blocks; specify hard cuts / jump cuts between them.
- Append the brand suffix to every prompt.
- Phrase negatives positively (say what you want, not "no X").
- Flag claims / before-after / real likeness as **SHOOT-REAL** — never generate.

## Creativity bar (bold but positive)
- **Anti-cliché**: ban generic stock-ad gloss; ban any hook that buries the value past 3s.
- **Domain-shift seeds**: pull one unexpected pattern-interrupt from outside the category that dramatizes the product's specific pain.
- **Guardrails**: reference-true · on-brief · trend-grounded · Flow-executable · purposeful (every beat serves hook-rate or conversion) · claims shoot-real.
