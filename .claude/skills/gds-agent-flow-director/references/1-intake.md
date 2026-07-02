# Stage 1 — Reference Analysis & Intake

**Goal:** take the product/subject truth from the user's uploaded images, then
clarify only what's missing — through the lens of the selected mode.

## Do

1. Read `knowledge-base.md` and the **mode playbook** (`references/modes/{mode}.md`).
2. **Analyse every uploaded reference image first** (paths are in the Inputs; they're
   readable under the granted dirs). For each image write, in `reference-brief.md`:
   what it is (product / logo / person / packaging / scene / style board) and its
   exact reproducible attributes — form & geometry, materials & finish, **color
   hexes**, logo placement, wardrobe, distinguishing details, lighting cues.
   Copy the uploaded images into `assets/refs/` so they live with the project.
3. Draft `intake.md` — the consolidated, mode-focused brief (subject, goal, audience,
   platform + aspect, approximate length/scope, the hero subject/product that must
   stay consistent, the emotional/conversion target). Pull what you can from the
   images + brief; do not re-ask what the references already answer.
4. For the few things you truly can't infer, write `qna.json` and **halt** (each
   question: `id`, `agent`, `category`, `question`, `why`, `answered:false`). 3–6
   questions max.

## Output

- `reference-brief.md` — the binding product/subject block (carried verbatim downstream).
- `intake.md` — the mode-focused brief.
- `qna.json` — open questions when needed.

Gate (`hitl: true`). The reference-brief is the accuracy floor for every later stage.
