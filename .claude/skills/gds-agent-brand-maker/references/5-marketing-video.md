# Stage 5: Marketing Campaign Video

**Goal:** Produce detailed, model-tuned prompts for a short marketing campaign video that is unmistakably on-brand, packaged so each shot is **executable verbatim in Google Flow**. Prompts are shaped by the video model's rules in `assets/model-prompt-rules.json` (default: `omni-flash`), and brand consistency is anchored on the finalized logo/key-frame from Stage 4. Prompt **precision over brevity** — each shot is a complete director's brief.

> The generated shot prompts are the deliverable — keep them detailed and executable verbatim. But write efficiently: skip process narration, assemble the artifact directly, write it to file, and stop. Don't over-explain what you're doing.

## Inputs

- `${HERMES_VAULT_PATH:-/Users/perkypanda/Documents/Obsidian/Vault}/30_Resources/Brands/{brand-identifier}/design-brief.md` — Director's Brief (style, palette, canonical mark).
- `${HERMES_VAULT_PATH:-/Users/perkypanda/Documents/Obsidian/Vault}/30_Resources/Brands/{brand-identifier}/logo.png` (or chosen hero asset) — the locked key-frame for image-to-video consistency.
- `assets/model-prompt-rules.json` → the video model entry (default: `omni-flash`). Open it and keep its `prompt_structure`, `shot_and_camera_language`, `image_to_video`, `consistency_techniques`, `marketing_best_practices`, `banned_or_risky_terms`, and `parameters` in view.

## Step 5A — Confirm Model & Format

Generation happens in **Google Flow**, which hosts **Omni Flash** (Gemini Omni Flash). No CLI/API or fal.ai fallback is needed — Forge produces Flow-ready prompts and the user generates in Flow. Confirm the campaign format with the user (placements and aspect ratios) before building.

## Step 5B — Plan the Campaign

Decide the campaign shape with the user — usually a hero spot plus a few cutdowns. For each clip honor the model's duration cap (≈10s) and pick the aspect ratio per placement (9:16 social/Shorts, 16:9 landing hero, 1:1 feed). One idea per clip: hook in the first 1–2s, brand/logo payoff at the end. Sketch the campaign as a shot list before writing prompts (clip → placement → aspect → one-line idea → where the logo lands).

## Step 5C — Build the Prompts

For each clip, write a prompt following the video model's `prompt_structure` from the registry — for Omni Flash that is: **Goal → Input Role → Subject/Scene → Action/Motion → Camera → Lighting/Mood/Style → Text → Audio → Constraints**, in that order. Hard requirements drawn from the registry:

- **Lead with the locked key-frame as image-to-video.** Assign the logo/hero image an explicit role and say what NOT to copy (background, sample text, palette bleed).
- **Paste the brand block verbatim** (canonical mark description, hex colors, finish, typeface) from `design-brief.md` into Input-Role + Constraints of *every* clip — this is the cross-shot consistency anchor.
- **Always direct the camera explicitly** — flat, motionless output is the #1 amateur tell. Pull a cue from the registry's `shot_and_camera_language`.
- **State audio intent every time**, even if silent.
- **Keep one lighting/grade descriptor string** identical across all clips for a unified campaign look (e.g. "teal-and-orange cinematic grade, low-key, shallow depth of field").
- Render critical/legal text in post rather than in-model where the registry flags text as unreliable (non-Latin / thin fonts especially).
- Respect the model's `banned_or_risky_terms` (no named real public figures, no restricted speech edits, etc.).

### Generated-prompt template (write each shot like this)

Assemble each shot as one paragraph in the `prompt_structure` block order, with all load-bearing components present so it runs verbatim in Flow:

- **Goal** — video type, length, aspect, energy ("10s vertical 9:16 social hero, premium with an edge of danger").
- **Input Role** — the locked logo/key-frame as Image A, its job, and explicit exclusions ("use ONLY for the mark and the two brand colors; do NOT copy its background or any sample text").
- **Subject + Scene** — ~20-word concrete description of subject, environment, atmosphere.
- **Action / Motion** — what the subject does and how the scene breathes.
- **Camera** — one explicit cinematic cue from the registry's shot language (push-in, oner, locked-off 35mm, slow overhead).
- **Lighting / Mood / Style** — the **single campaign grade string**, reused identically across all clips.
- **Palette (locked hex)** — restate the Universal Color Block hexes so color can't drift.
- **Text** — typography, position, timing if on-screen (English/Latin best); otherwise "no on-screen text, title added in post".
- **Audio** — explicit intent every time (branded sting, ambient only, or silent).
- **Negative / banned terms** — positive exclusions + a hard "preserve" line for the mark and colors.
- **Aspect ratio + duration** — stated ("9:16, ~10s").
- **Per-model consistency line** — reuse the same locked first-frame image and the same grade string across every clip; refine in single-category turns.

#### Full worked example — Shot 1, hero spot (Omni Flash, 9:16, ~10s)

> **Prompt (paste into Google Flow, model: Omni Flash):**
> Goal: a 10-second vertical 9:16 social hero spot launching the card game "DECKHEADS"; premium, controlled, with a faint edge of danger. Input Role: Reference Image A is the locked brand key-frame — use it ONLY as the source of truth for the orbital mark (two solid discs, large deep-indigo #2B2A6B and small signal-orange #FF6A3D, joined by one thin elliptical deep-indigo ring) and the two brand colors; do NOT copy its background, reflections, or any sample text. Subject + Scene: the orbital mark floats in a dark, near-empty volumetric studio, faint signal-orange rim light catching the small disc, slow drifting dust. Action / Motion: the small orange disc accelerates along its elliptical ring around the large indigo disc, the orbit tightening as if held under tension, then snapping into a perfectly still locked position on the final frame. Camera: one continuous shot, slow push-in on a locked-off 35mm, settling on a centered hero framing of the locked mark. Lighting / Mood / Style: low-key cinematic lighting, teal-and-indigo grade with a single warm signal-orange accent, shallow depth of field, premium tech-ad mood. Palette (locked): deep-indigo #2B2A6B, signal-orange #FF6A3D, near-black ground #1A1840 — no other hues. Text: the wordmark "DECKHEADS" in uppercase bold geometric sans-serif fades in centered under the mark at second 8, crisp white, perfectly legible. Audio: native synchronized audio — a quiet tense low drone that builds to a single resolved synth hit landing exactly as the orbit snaps locked; no voiceover. Constraints: preserve the mark proportions and the two brand hexes exactly; keep this same teal-and-indigo grade for every sibling clip; no extra symbols, no playing-card imagery, no casino imagery, no incorrect logos, no on-screen text other than the wordmark.
> **First frame / ingredient to upload:** the finalized `logo.png` (or clean mark render) as Image A.
> **Flow settings:** aspect 9:16, duration ~10s. **Scripted alt (optional):** fal MCP `run(app_id: "fal-ai/veo-3", input: { prompt: "<this prompt>", image_url: "<logo.png URL>", duration: "10s", aspect_ratio: "9:16" })`.

Write each cutdown the same way: keep the Input-Role brand block, the locked grade string, and the palette identical; change only Goal (aspect/length), Subject/Action, and Camera per placement.

Save to `${HERMES_VAULT_PATH:-/Users/perkypanda/Documents/Obsidian/Vault}/30_Resources/Brands/{brand-identifier}/video-prompts.md`, each clip labeled with placement, aspect ratio, duration, and the exact invocation (Omni Flash conversational in Flow, or the fal MCP `app_id` + input map fallback).

## Step 5D — Hand Off to Google Flow

Deliver a Flow-ready packet per clip: the structured prompt, the **first-frame / ingredient image to upload** (the finalized logo or hero asset — Flow's Frames-to-Video and Ingredients keep brand identity locked), the aspect ratio, and the audio intent. Tell the user to iterate in Flow in single-category turns (lighting → camera → action → audio) and to reuse the same locked first frame and grade-descriptor string across every clip for a unified campaign. Save the packet to `video-prompts.md`; store returned clips in the brand folder.

## What Good Looks Like

A campaign that opens on the real brand mark and holds its colors, logo, and grade across every clip. Each prompt is a complete director's brief any operator can run, with placement, aspect, duration, audio intent, the verbatim brand block, and invocation spelled out. The look is unified across cutdowns, and no clip drifts off-brand.

## Done When

- A shot list is agreed (hero + cutdowns), each clip ≤ the duration cap with the right aspect per placement.
- Every shot is written in the registry's `prompt_structure` order, with the verbatim brand block in Input-Role + Constraints, an explicit camera cue, locked palette hexes, the single shared grade string, and an explicit audio line.
- Each shot names its model, aspect, duration, first-frame image, and invocation; banned/risky terms are respected.
- `video-prompts.md` is saved to the brand folder with one labeled packet per clip.
