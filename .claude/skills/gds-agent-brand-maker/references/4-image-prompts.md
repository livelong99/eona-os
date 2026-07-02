# Stage 4: Image Prompt Generation

**Goal:** Translate the locked `design-brief.md` into a complete, model-tuned image-prompt suite for the Deckheads app, packaged so each prompt is **executable verbatim in Google Flow**. Every prompt is shaped by the target model's rules in `assets/model-prompt-rules.json` — never improvised from memory. Prompt **precision over brevity**: a longer, crystal-clear prompt beats a vague one, because the prompt *is* the deliverable.

> The generated prompts are the deliverable — keep them detailed and executable verbatim. But write efficiently: skip process narration, assemble the artifact directly, write it to file, and stop. Don't over-explain what you're doing.

## Inputs

- `${HERMES_VAULT_PATH:-/Users/perkypanda/Documents/Obsidian/Vault}/30_Resources/Brands/{brand-identifier}/design-brief.md` — the locked Director's Brief from Stage 3 (canonical logo description, color block, brand name/tagline, Negative Constraint Matrix).
- `assets/model-prompt-rules.json` — the per-model prompt-rules registry (the source of truth for HOW to write each model's prompts).

## Step 4A — Pick the Target Model

Read the registry and choose the image model with the user. Default guidance (confirm, don't assume):

- **Nano Banana Pro** (`gemini-3-pro-image-preview`) for the **final** brand assets — anything with a wordmark, legible text, or multi-element composition, and any 2K/4K deliverable. Pro is the standout for typography; use it for `logo.png`, `icon.png`, and any asset carrying the wordmark.
- **Nano Banana** (`gemini-2.5-flash-image`) for **cheap, fast ideation** — quick concept passes and throwaway variations.

Rule of thumb: ideate on Flash, produce final brand assets on Pro. Apply whatever the registry says under each model's `when_to_use`. Open the registry entry for the chosen model and keep its `prompt_structure`, `consistency_techniques`, `text_rendering`, `negative_prompt_guidance`, `banned_terms`, and `parameters` in view while you write — you will quote from them.

## Step 4B — Build the 7-Asset Suite

First, **self-critique the Director's Brief against the Negative Constraint Matrix** — no banned cliché or "AI-look" token (`4k`, `masterpiece`, `glossy`, `hyperdetailed`, `octane render`, `trending on artstation`) survives into any prompt.

Build **7 prompts** covering the full Expo/Deckheads asset spec. Every prompt:
- follows the target model's `prompt_structure` from the registry, in that block order;
- embeds the **canonical logo description** from `design-brief.md` **verbatim** (the consistency anchor — paste it identically, never paraphrase between assets);
- pins **every** color with exact hex from the Universal Color Block;
- quotes brand text verbatim in straight quotes;
- applies the model's `consistency_techniques` (reference image as the #1 lever, fixed `--seed`, pinned model) and `parameters` (aspect ratio, resolution stated in-prompt for Pro).

Use exactly these topological layout blocks for the asset-specific composition (filename → composition):

1. **icon.png** — "A 1:1 square composition. Central subject occupies exactly the inner 70% of the canvas. 15% pure background margin on all edges. No text."
2. **android-icon-foreground.png** — "Transparent-style composition. Subject scaled down to occupy only the central 40% of the canvas for a massive safe zone. Edges entirely empty."
3. **android-icon-background.png** — "Edge-to-edge full-bleed coverage. No central subjects, no focal points. Continuous abstract brand pattern."
4. **android-icon-monochrome.png** — "Inner 70%. High-contrast masking. Solid pure black (#000000) silhouette on pure white (#FFFFFF). No internal lines or gradients."
5. **splash-icon.png** — "Vertical 9:16 composition. Subject centered vertically and horizontally, occupying 30% of screen width. Vast empty negative space above and below."
6. **favicon.png** — "Ultra-minimalist layout for extreme downscaling. Fills 90% of the canvas, 5% margin. Heavy, thick strokes."
7. **logo.png** — "Horizontal 16:9 composition. Geometric mark occupies the left 30%, typography the right 60%, sharing one baseline."

**Translate each block into the model's preferred phrasing.** The registry says Nano Banana / Pro have NO negative-prompt field and that naming a thing to forbid it can summon it — so convert every "no X" into a positive end-state (registry `negative_prompt_guidance`): "No text" → "a clean background with the mark only"; "no shadows" → "flat, evenly lit, on a solid background". Quote brand text verbatim; pin every color with hex.

### Generated-prompt template (write each of the 7 like this)

Assemble each prompt in the registry's `prompt_structure` order, with these load-bearing components all present so it runs verbatim in Flow:

- **Operation verb** — "Create / Render a production-ready …" (the asset type, up front).
- **Subject** — the **canonical logo description block, pasted verbatim** from `design-brief.md`.
- **Exact text** — every string in straight quotes, with typography (family, weight, case, letter-spacing). (Skip for text-free assets; say so positively — "the mark only, no lettering".)
- **Composition / canvas** — the asset's topological block above, plus the aspect ratio in words (Pro reads it from prompt text, not a flag).
- **Color / brand spec** — every hex with its role; "no gradients, single flat fill" where the brief says flat.
- **Style / media** — the Universal Style Block (named medium/movement).
- **Lighting / camera** — only for photographic/3D assets; omit for flat vector (state "flat, no photographic lighting").
- **Material / texture** — name the physical makeup where relevant (e.g. "matte vector, no bevel, no specular highlight").
- **Mood** — one short tone phrase tied to the brand (e.g. "premium, controlled, a faint edge of danger").
- **Reference-image roles** — "Use Image 1 as the strict logo reference; reproduce its exact proportions, colorway, and letterforms — do not redraw or restyle." (Once the first clean render exists.)
- **Negative / banned terms** — expressed positively per the registry, plus an explicit hard-constraint sentence: "Do not alter the spelling, do not add gradients, do not change the fill color."
- **Aspect ratio + resolution** — stated in words ("1:1 square canvas, output at 4K").
- **Per-model consistency line** — the technique from the registry: fixed `--seed`, pinned `NANOBANANA_MODEL`, reference image reused.

#### Full worked example — `icon.png` (Nano Banana Pro)

> **Prompt (paste into Google Flow, model: Nano Banana Pro):**
> Create a production-ready 1:1 square app-icon image for the card-game brand "DECKHEADS". Subject — render this mark exactly: the orbital mark, two solid discs (one large deep-indigo #2B2A6B, one small signal-orange #FF6A3D) joined by a single thin elliptical ring in deep-indigo #2B2A6B at roughly 2px optical weight, implying a locked orbit; flat vector, crisp edges, zero drop shadows. The mark only — no wordmark, no lettering on this icon. Composition — center the mark so it occupies exactly the inner 70% of the canvas with an even ~15% solid-background margin on all four edges; perfectly centered, balanced optical weight, 1:1 square canvas. Color — discs and ring exactly #2B2A6B and #FF6A3D as specified, on a flat solid deep-indigo #1A1840 background; single flat fills, no gradients, no glow, no shadow. Style — flat vector illustration, scalable logo aesthetic in the spirit of Swiss International geometric design; matte finish, no 3D bevel, no specular highlight, no photographic texture. Mood — premium, controlled, with a faint edge of danger. Reference — use the attached Image 1 as the strict reference for the mark's exact proportions, colorway, and ring weight; reproduce it, do not redraw or restyle. Output at 2K. Constraints — keep the mark proportions and the two hex colors exactly; do not add any text; do not add gradients, shadows, or a frame; keep the background a single flat fill.
> **Reference to upload:** the first clean logo render (once it exists) as Image 1.
> **Flow settings:** aspect 1:1, resolution 2K. **Scripted alt (optional):** `export NANOBANANA_MODEL=gemini-3-pro-image-preview && gemini --yolo "/generate '<this prompt>' --count=1 --seed=42 --aspect=1:1"`.

Write the other six the same way, swapping in each filename's topological block and adjusting text/aspect — `logo.png` carries the full wordmark lockup and uses Pro's typography strengths (quote "DECKHEADS", name the font, demand "perfectly legible, crisp edges").

Save the suite to `${HERMES_VAULT_PATH:-/Users/perkypanda/Documents/Obsidian/Vault}/30_Resources/Brands/{brand-identifier}/asset-prompts.md`, each prompt labeled with its output filename and the exact invocation (model, `--seed`, flags / Flow settings) to run it.

## Step 4C — Hand Off to Google Flow

Generation happens in **Google Flow**, which hosts both Nano Banana and Nano Banana Pro. Forge delivers a Flow-ready packet, not a CLI/API call. For each asset, give the user:

- The **exact prompt** to paste into Flow, with the target model named (Nano Banana for ideation vs Pro for finals).
- The **reference images to upload as ingredients** — once the first clean logo render exists, it becomes the reference that holds the mark identical across the remaining assets (Flow maintains uploaded ingredients across generations; this is the registry's #1 consistency lever). Generate `logo.png` (or a clean mark render) **first**, then feed it as Image 1 into the other six.
- The **aspect ratio / resolution** to set in Flow, with the canonical color and text locks restated inside the prompt.

For revisions, instruct the user to **iterate on the existing image in Flow with a single-delta instruction** ("keep everything identical, change only X") rather than regenerating from scratch (registry: edit, don't regenerate; one delta per edit). Save the packet to `asset-prompts.md`; as the user brings rendered assets back, store them in the brand folder and offer a comparison view.

## What Good Looks Like

Seven prompts (and, on approval, seven assets) that are unmistakably the same brand — identical mark, identical palette, identical wordmark — each correctly composed for its export target. Every prompt is executable verbatim by any operator, with model, seed, flags, aspect, resolution, and the canonical anchor spelled out. Nothing references the base-design library that wasn't carried through the Director's Brief.

## Done When

- All 7 prompts are written in the chosen model's `prompt_structure` order, each embedding the canonical logo description verbatim and pinning every hex.
- Every "no X" is phrased positively per the registry; no banned/AI-look token appears.
- Each prompt names its model, aspect, resolution, seed, and reference-image plan.
- `asset-prompts.md` is saved to the brand folder with one labeled packet per asset.

**Transition → Stage 5 (marketing campaign video).** Offer the campaign. The finalized `logo.png` becomes the locked key-frame for video consistency, and the canonical logo description + Universal Color/Style Blocks carry forward verbatim as Stage 5's brand-block.
