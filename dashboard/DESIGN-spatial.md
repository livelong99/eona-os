# Spatial / Cinematic OS — Wave 2 Design Language

> **This is the single source of truth for the Wave 2 redesign.** Every worker
> (W1–W5) reads this first and converges on it. The goal: the dashboard should
> feel like a **depth-first operating system** — surfaces float in 3D space,
> respond to the cursor like physical objects, and transition like a camera move.
> Built on the existing **Obsidian Aurora** tokens (glass + drifting aurora +
> film grain), pushed into space.

Non-negotiable: **physics-grounded, never gratuitous.** Motion always has a
reason (state change, focus, depth cue). All motion respects the root
`<MotionConfig reducedMotion="user">` — when reduced, depth/elevation stay as
static cues; parallax/tilt/drift stop.

---

## 1. The depth model (z-planes)

Everything lives on one of five conceptual planes, back→front. Use the
`--z-*` tokens (see globals.css) for translateZ and the `--elev-*` shadow scale.

| Plane | Token | Contents | Parallax factor |
|-------|-------|----------|-----------------|
| **Field** | `--z-field` (−120) | AuroraField orbs, grain | 0.02 (barely moves) |
| **Backdrop** | `--z-back` (−60) | section backgrounds, deep panels | 0.06 |
| **Surface** | `--z-base` (0) | the working content plane (most cards) | 0.10 |
| **Raised** | `--z-raise` (40) | hovered/active cards, popovers | 0.16 |
| **Overlay** | `--z-over` (120) | Command Bridge, modals, Trust Rail drawer | fixed (no parallax) |

Rule: a surface that gains focus **rises one plane** (translateZ + bumps its
`--elev-*`). It never teleports — it springs (see §4).

The app root sets `perspective: var(--perspective)` (1200px) on the main content
container so child `translateZ`/`rotateX/Y` read as real depth. Use
`transform-style: preserve-3d` on stages that nest 3D children.

---

## 2. Parallax

Background and mid layers shift opposite to the cursor to fake depth.
- Driver: a single shared hook/pattern — track normalized pointer (−0.5..0.5)
  from the stage center, multiply by the plane's parallax factor (§1) × a
  px budget (`--parallax-budget`, 24px). Apply as `translate3d`.
- W1 ships `ParallaxLayer` (wraps children, takes a `depth` 0..1) and
  `SpatialStage` (provides the perspective context + pointer source). Views
  compose these — they do **not** re-implement pointer math.
- Reduced motion: ParallaxLayer renders a static `translateZ` only.

---

## 3. The signature interaction — 3D tilt cards

The hero primitive is **`TiltCard`**. On hover, a card tilts toward the cursor
in 3D and lifts a plane. This is the "physical object" feel that defines the OS.

- **Perspective:** inherited from the stage (`--perspective` 1200px).
- **Max tilt:** `±6°` on each axis (`--tilt-max`, 6deg). Subtle — not a toy.
- **Lift:** on hover, `translateЗ(var(--z-raise))` + shadow `--elev-1 → --elev-3`.
- **Glint:** an optional specular highlight (radial gradient following the
  cursor) at low opacity over the glass — `--tilt-glow`.
- **Spring:** `SPRING_TILT` (see aurora.ts) — responsive but settles, no wobble.
- **Reduced motion:** no rotation; hover still raises elevation (static).
- Tilt is **opt-in per card** (don't tilt dense lists; do tilt feature cards,
  agent cards, tool tiles, kanban cards).

---

## 4. Motion vocabulary (use the named transitions — never inline magic numbers)

From `lib/aurora.ts`. W1 defines values; everyone imports.

| Name | Use |
|------|-----|
| `SPRING_GENTLE` | layout reflow, list reorder |
| `SPRING_SNAPPY` | buttons, badges, toggles |
| `SPRING_SLOW` | page/cinematic enters, orb drift |
| `SPRING_TILT` *(new)* | 3D tilt + card lift |
| `VIEW_SWOOP` *(new)* | the view→view camera transition (§5) |
| `PARALLAX` *(new)* | parallax follow (lightly damped, fast) |
| `TRANSITION_MICRO/STANDARD/PAGE` | css-ish duration transitions |

Layer-enter variants (new, exported as `LAYER_VARIANTS`): `hidden`/`visible`
with a depth-aware rise (`y: 12, z: -40, opacity: 0` → settled) so any list can
stagger children into place with one shared variant.

---

## 5. View→view transitions ("camera moves")

The shell (W2) wraps the active view in `AnimatePresence` keyed by `ViewId`.
- Outgoing view: recedes + fades (`z: -80, opacity: 0, scale: 0.98`).
- Incoming view: comes forward (`z: 60 → 0, opacity: 0 → 1, scale: 1.02 → 1`).
- Timing: `VIEW_SWOOP` (a slow-ish spring, ~`SPRING_SLOW` family).
- Direction can be subtle; do not slide the whole viewport sideways (nausea).
  The feel is a **dolly** (depth), not a pan.
- Reduced motion: cross-fade only.

---

## 6. Surfaces & material

- **Glass** stays the primary material (`GlassCard` / `--glass-*`). In Wave 2,
  glass gets **edge light** (a 1px top highlight via inset shadow) and reads its
  elevation from `--elev-*`.
- **Aurora wash:** section backdrops carry a faint violet→teal gradient
  (`--aurora-violet`→`--aurora-teal`) at low alpha. Keep it subtle behind glass.
- **Grain** overlay stays globally (Grain.tsx) for OLED tactility.
- **Borders:** hairline `--border`; on raise, border tints violet
  (`rgba(124,92,255,.35)`).
- **Radius scale:** sm 10px, md 14px, lg 18px, xl 24px (cards xl, chips full).

---

## 7. Type & spacing

- Type scale (rem): 0.6875 (micro/labels, tracking +0.16em uppercase) · 0.8125
  (body-sm) · 0.875 (body) · 1.125 (title) · 1.5 (view heading) · 2.25 (hero).
- Generous gutters: view padding `px-8 py-7`, card padding `p-4`/`p-5`.
- Numbers/IDs/code in `--font-mono`. Headings in `--font-sans`, semibold.
- One accent (`--accent` violet) for primary action; tier/status keep their
  semantic colors (emerald/amber/rose/sky).

---

## 8. Color & status (unchanged semantics)

- Primary/agent accent: violet `--accent`. Aurora stops violet/teal/indigo.
- Live/success: emerald · running/warn: amber · error: rose · info: sky.
- Backgrounds: `--background` deepest, `--surface`/`--surface-2` panels.

---

## 9. Per-surface intent (so workers stay coherent)

- **Mission Control (W3):** a *constellation* of floating `TiltCard`s on a
  `SpatialStage` — agents + workflows as objects you can almost grab.
- **Cockpit (W3):** the live timeline as a depth-stacked stream; newest event
  rises from below into the base plane. Preserve all RunEvent wiring.
- **Kanban (W3):** columns are back-plane troughs; cards lift toward you on
  hover (`TiltCard`), drag feels weighty.
- **Memory (W4):** the hero — the galaxy becomes a **3D parallax star-field**;
  nodes sit on different planes, the field tilts/parallaxes with the cursor,
  hovered node rises to Overlay with its label.
- **Chat (W4):** message planes float in; assistant streams onto a raised glass.
- **Prompt Foundry / Goal (W4):** spatial split panels with depth between
  input and output.
- **Command Bridge (W2):** an Overlay-plane palette that *descends* from above
  (⌘K), backdrop blurs and recedes.
- **Trust Rail (W5):** an Overlay drawer from the right; an approval card rises
  with weight (this is a consequential moment — motion conveys gravity).
- **Launchpad (W5):** agent-tools as a grid of `TiltCard` tiles (logo + name +
  stage chips), launching one swoops into its surface.

---

## 10. Accessibility & performance

- Everything degrades under `prefers-reduced-motion` (root `MotionConfig`):
  depth becomes static elevation, parallax/tilt/drift stop, transitions become
  fades.
- Animate only `transform`/`opacity` (GPU). Never animate layout-affecting
  props in hot paths. Parallax/tilt use `transform: translate3d/rotate3d`.
- Respect keyboard: Command Bridge is fully keyboard-driven; focus rings visible
  (violet). Tilt/parallax are pointer-only enhancements — never required to use.
- Target 60fps; throttle pointer handlers with rAF; `will-change: transform`
  only on actively-animating elements.

---

## 11. Worker rules of the road

- Import motion from `lib/aurora.ts`; import depth tokens via CSS vars — **no
  inline magic numbers** for spring/tilt/elevation.
- Compose W1 primitives (`SpatialStage`, `ParallaxLayer`, `TiltCard`, `GlassCard`,
  `Toolbar`, `Stat`, `EmptyState`) — don't re-roll them per view.
- Stay inside your owned files (see the plan's ownership map). Need a new shared
  primitive/token/type? Ask the lead — it gets added to the Phase-0 contract,
  not edited in place.
- Data layer (`hermes.ts`, `types.ts`, `cockpit.ts`, `mock.ts`) is read-only.
