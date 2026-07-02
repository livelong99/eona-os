# Cinematography Knowledge Base — Google Flow / Veo 3 (Higgsfield-grade)

The binding craft reference for every agent in this workflow. Read it before
acting. Goal: copy-paste prompts that read like a cinematographer wrote them.
This tool writes prompts only — no media, no API.

---

## 0. The three rules that make output look directed (not generic)

1. **One camera move per shot.** Name exactly one move; never stack moves.
2. **Every video prompt carries an explicit AUDIO line.** Veo generates native
   synchronized audio — diegetic SFX, ambient bed, and any dialogue must be
   written out, or you get generic noise.
3. **Consistency through verbatim repetition.** Repeat an identical identity +
   wardrobe + lighting + lens block, word-for-word, in every shot (our text-only
   substitute for Flow "Ingredients" / Higgsfield Soul-ID).

---

## 1. Named camera moves (the closed vocabulary — pick ONE per shot)

Isolate the camera instruction on its own labeled line; specify speed + start/end.

| Move | Prompt phrasing | Effect / when |
| ---- | --------------- | ------------- |
| Push-in / Dolly in | "slow forward push" / "rapid surge forward" | Builds tension, narrows focus |
| Dolly out / Pull back | "controlled pull back" | Reveals context, establishes space |
| 360 / Half orbit | "full 360 orbit" / "half orbit" | Hero reveal, product showcase |
| Crane / Jib | "crane ascent" / "overhead descent" | Scale, gravitas intro |
| Tracking | "leading tracking shot" / "parallel side track" | Follows subject, keeps it sharp |
| Handheld | "handheld documentary" / "high-tension handheld" | Raw realism, intensity |
| Rack focus | "rack focus foreground to background" | Shifts attention without moving |
| Dutch angle | "dutch tilt" / "extreme dutch tilt" | Unease, disorientation |
| Whip pan | "whip pan" | Energetic transition / simulated cut |
| Crash zoom | "crash zoom in/out" | Sudden emphasis, shock beat |
| Dolly zoom (vertigo) | "compression zoom" | Background compresses, subject fixed — dread |
| FPV / drone | "FPV drone" | Kinetic immersive flight-through |
| Hyperlapse | "hyperlapse" | Compressed time through space |
| Static | "locked-off static frame" | Stillness, composition-forward |

Higgsfield's preset library (steal as move names): Super Dolly, Double Dolly,
Bullet Time, Snorricam, Arc Left/Right, Crane Over The Head, Object POV, Eyes In,
Through Object, Car Grip/Chase, Robo Arm, Low Shutter, Timelapse.

## 2. Camera bodies (distinct signatures)

- **ARRI Alexa 35 / Mini LF** — natural color, gentle highlight roll-off, wide
  dynamic range; the filmic, flattering narrative default.
- **RED (V-Raptor / Monstro)** — high-contrast, punchy, crisp; strong on darker skin tones.
- **Sony Venice** — clean high-ISO, low-light latitude; native anamorphic home.
- **Anamorphic** — oval bokeh, horizontal flares, 2.39:1 widescreen feel.
- **16mm film** — visible grain, organic texture, indie/documentary warmth.

## 3. Lenses + depth-of-field cues

- **24mm** wide — expansive environment, slight edge distortion, deep focus.
- **35mm** — natural docu / walk-and-talk.
- **50mm** — "human eye" normal perspective.
- **85mm** — flattering portrait compression, creamy shallow background.
- **100mm macro** — extreme detail, razor-thin focus plane.
- DoF language: "very shallow depth of field," "creamy bokeh," "deep focus," "rack focus."

## 4. Lighting (named setups trigger distinct renders)

Three-point · Rembrandt (triangle of light on the cheek) · chiaroscuro ·
high-key / low-key · motivated (light from a visible in-scene source) ·
golden hour · blue hour · neon · volumetric / god-rays · hard flash · soft window light.

## 5. Color grades / film stocks

Teal-and-orange (blockbuster) · bleach bypass (desaturated high-contrast grit) ·
Kodak Vision3 / Portra 400 (filmic grain, warm skin) · editorial / fashion ·
film-noir B&W · VHS. Stack: *camera body + lens + film stock + lighting* = a signature.

## 6. Atmosphere / texture cues

Volumetric haze · drifting dust motes · rain on glass · lens flare · light bloom ·
film grain · fog · smoke · practical light spill · shallow steam.

---

## 7. Google Flow + Veo 3 mechanics

### Audio (mandatory on every video prompt) — three layers, one cue each
- **Dialogue (lip sync):** quote the exact line + attribute it.
  `Speaker: <identity>. Line: "<exact words>." Delivery: <tone, pace, accent>. Natural lip sync, no extra speech after the line.`
  Avoid multiple speakers in very short clips.
- **Diegetic SFX:** anchor to a *visible* action + direction.
  `Add <sound> exactly when <visible action> happens. Keep it <subtle/crisp>.` Never invent sound with no visible cause.
- **Ambience / room tone:** concrete, not generic. "quiet wet-alley room tone," "soft cafe ambience, distant cups, low conversation, not distracting."
- **Music:** sparingly — "very soft low bed" or "no music, only natural room tone." Mood only, never a named artist/song.

### Consistency — "Ingredients" + the text-only substitute
Flow's Ingredients-to-Video passes 1–3 reference images to hold a character /
product / style. **Constraint: Veo will NOT accept a first frame + reference
images simultaneously** — choose first-frame (optionally + last-frame) OR 1–3
reference images, not both. Since we only write prompts, we enforce consistency by
repeating the identity + wardrobe + lighting + lens block VERBATIM in every shot.

### Flow modes — when to use each
| Mode | Use when |
| ---- | -------- |
| Text-to-Video | Net-new shot; max latitude, lowest consistency |
| Image-to-Video (frames) | You have a hero still to animate with high adherence |
| First & Last Frame | Controlled transition between a defined start and end image |
| Ingredients-to-Video | Hold the *same* character/product/style across shots |

### Seeds · negatives · aspect · resolution · timestamps
- **Seed:** emit a fixed integer (`Seed: 73412`); reuse it for reproducibility / a brand "hero seed."
- **Negatives:** phrase as what you *want* ("a desolate landscape with no buildings"), not "don't." Use to suppress artifacts (warped hands, extra fingers, subtitles, text overlays, flicker).
- **Aspect:** 16:9 or 9:16 — pick by deliverable, don't flip mid-project.
- **Resolution / length:** 720p or 1080p; 4 / 6 / 8 s clips.
- **Timestamp prompting** (multi-beat in one clip): `[00:00–00:02] … [00:02–00:04] …`, each segment with its own SFX/emotion cue.

---

## 8. Prompt templates

### (a) HERO IMAGE prompt
```
[Shot size + lens], [SUBJECT: identity + exact wardrobe + distinguishing features],
[pose/expression], [ENVIRONMENT], [LIGHTING style + direction],
[camera body + film stock + color grade], [DoF cue], [atmosphere/texture].
Negative: warped hands, extra fingers, text, watermark, distorted face.
Seed: <int>
```

### (b) VIDEO (shot) prompt
```
[ONE named camera move + speed] — [Shot size + lens].
SUBJECT: <verbatim identity + wardrobe block>.
ACTION: <single beat>.
SCENE: <environment, continuity with hero>.
LIGHTING + GRADE: <repeat exact lighting + camera body + film stock words>.
AUDIO:
 - Dialogue: Speaker: <name>. Line: "<exact words>." Delivery: <tone>. Natural lip sync, no extra speech.
 - SFX: <sound> exactly when <visible action>. Keep it <subtle/crisp>.
 - Ambience: <concrete room tone / bed>. Music: <none, or soft low bed>.
Negative: warped hands, text, subtitles, flicker, no extra dialogue.
Flow mode: <Ingredients/Image/Text>-to-Video | Seed: <int> | <16:9|9:16> | <720p|1080p> | <4|6|8>s
```

### Gold-standard example (push-in dialogue beat)
> Slow forward push (dolly in) — medium close-up, 85mm. SUBJECT: "Mara," early-30s,
> close-cropped platinum hair, charcoal wool overcoat with silver lapel pin, scar over
> left eyebrow. ACTION: she lifts her eyes to camera and speaks once, breath visible in
> cold air. SCENE: rain-slick neon Tokyo alley at night. LIGHTING + GRADE: motivated
> pink-cyan neon camera-left, wet-streetlight rim behind; ARRI Alexa 35, Kodak Vision3,
> teal-and-orange, very shallow DoF. AUDIO — Dialogue: Speaker: Mara. Line: "They were
> never going to let us leave." Delivery: low, steady, weary. Natural lip sync, no extra
> speech. SFX: a single distant transformer buzz and soft rain hiss on pavement.
> Ambience: quiet wet-alley room tone; Music: none. Negative: warped hands, text,
> subtitles, extra dialogue, flicker. Flow mode: Ingredients-to-Video (reference: hero
> image of Mara). Seed: 73412 | 16:9 | 1080p | 8s

---

## 9. Vision critic rejection triggers (auto-fail any shot that has)
- More than one camera move.
- A missing or vague audio line ("spooky sounds").
- Drifted identity/wardrobe wording vs the Look Bible block.
- "Don't"-style negatives instead of positive phrasing.
- First-frame + reference-image conflict.
- Subject/material that contradicts the researched reference.
