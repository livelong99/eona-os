# Google Flow — Prompt Rules Registry

Tuning rules the Prompt Foundry applies. Flow runs **Imagen** (image) and **Veo** (video). Both reward
concrete, layered, cinematographic description over short tags. Write prose, front-load the subject.

## Shared principles
- **Front-load the subject and action**, then layer context. One clear focal idea per prompt.
- **Be concrete:** named lens/camera, light direction & quality, color palette, materials, textures, era.
- **Specify composition:** framing (close-up/medium/wide), angle, depth of field, rule-of-thirds, foreground/
  background separation.
- **Name a style** explicitly (photoreal, 35mm film, 3D render, anime, illustration) — never leave it implied.
- **Use NEGATIVE** to exclude defects (extra fingers, warped text, watermark, low-res, oversaturation).
- Keep terminology consistent across a set so image and video read as the same world.

## IMAGE (Imagen) — required elements
1. Subject (who/what, count, wardrobe/material detail)
2. Action / pose / expression
3. Setting & time of day
4. Composition (shot size, angle, lens e.g. "35mm", aperture e.g. "f/1.8", DoF)
5. Lighting (source, direction, quality — e.g. "soft window light from camera left, golden hour")
6. Color palette & mood
7. Style & medium (e.g. "editorial photograph", "matte digital painting")
8. Aspect ratio
9. NEGATIVE list

## VIDEO (Veo) — required elements (image elements PLUS)
1. **Camera movement** (static, slow push-in, dolly, orbit, handheld) and speed
2. **Motion** of subject and environment (what moves, how fast)
3. **Duration** and pacing (e.g. 8s, single continuous take)
4. **Shot sequence** if multi-shot: number each shot with its own framing/movement and a continuity note
5. **Audio cue** (optional: ambient, sfx, music mood) if the target supports it
6. **Transitions** between shots (cut, match-cut, dissolve)
7. Consistency anchors (same subject description verbatim across shots)

## Checklist (prompt-judge enforces)
- [ ] Subject front-loaded and unambiguous
- [ ] Composition + lens/camera specified
- [ ] Lighting direction & quality specified
- [ ] Explicit style/medium named
- [ ] Color palette / mood present
- [ ] Aspect ratio set; duration set (video)
- [ ] Camera movement + motion described (video)
- [ ] Multi-shot continuity anchors consistent (video sequence)
- [ ] NEGATIVE list present
- [ ] No secrets; references resolve to existing vault notes
