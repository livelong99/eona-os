# Stage 6 — Review

**Goal:** after the user generates media in Flow and uploads it (the dashboard review
uploader saves files to `assets/` as `shot-1.*`, `shot-2.*`, … matching the block
numbers), grade each against the creative direction and rewrite any failing block in
place so the next generation is better.

## Do

1. Read `direction.md`, `flow-prompts.md`, and the mode playbook. Spawn a
   vision-capable `critic`.
2. Read every uploaded file in `assets/` (match by block number). For each, inspect
   against the direction + the mode's bar:
   - **Fidelity to the reference** — subject/product matches `reference-brief.md`
     (form, material, color); no identity drift.
   - **Direction adherence** — composition, grade/palette, motion/format per
     `direction.md`.
   - **Trend + intent** — did it deliver the intended beat/section/post/scene and the
     trend technique; one camera move (film); artifacts (warped hands, text, flicker).
3. Give each block a **pass** or **fail** with specific fixes. For any **fail**,
   rewrite that block's prompts in place (update `flow-prompts.md` / `.txt`) and
   record the rewrite.

## Output — `review.json` (the dashboard parses this)

```json
{
  "shots": [
    { "n": 1, "title": "<block title>", "verdict": "pass", "notes": "specific", "rewritten_image_prompt": "", "rewritten_video_prompt": "" },
    { "n": 2, "title": "<block title>", "verdict": "fail", "notes": "identity drift; grade too warm", "rewritten_image_prompt": "<full rewrite>", "rewritten_video_prompt": "<full rewrite with audio>" }
  ]
}
```

(The `shots` array holds one entry per block regardless of mode — Shot / Section /
Post / Scene. For non-video modes put the rewritten prompt(s) in the
`rewritten_image_prompt` field.) Also write a human-readable `review.md`, and apply
every rewrite to `flow-prompts.md` + `.txt`. The user can re-upload and re-run.

Gate (`hitl: true`).
