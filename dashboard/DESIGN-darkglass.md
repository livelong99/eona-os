# Dark-Glass — Wave 3 Design Language

> **Single source of truth for the Wave 3 dashboard rebuild.** Every U worker
> reads this first and converges on it. The dashboard becomes a **rich dark,
> glass, glowing** product: a deep near-black canvas, frosted-glass surfaces with
> soft inner light and an outer **glow shadow**, a **top centered dock** for
> navigation (the left sidebar is removed), and large **cascade** screen
> headings. Built from 8 named 21st.dev components fetched via the Magic MCP and
> adapted to our tokens.

Non-negotiables: **dark + glass + glow** everywhere; **top dock** is the only
primary nav; motion is purposeful (framer-motion, from `lib/aurora.ts`); all
motion degrades under the root `<MotionConfig reducedMotion="user">`;
implementation is production-grade (typed props, a11y, GPU-only animation).

---

## 1. The 21st.dev component map (fetch via `mcp__magic__21st_magic_component_builder`)

| # | 21st ref | Lands as | Owner |
|---|----------|----------|-------|
| 1 | `easemize/pixel-perfect-hero` | App **background** layer (behind all content) | U1 |
| 2 | `badtzx0/dock` | **Top centered Dock** — primary nav, replaces Sidebar | U1 |
| 3 | `jatin-yadav05/animated-ai-chat` | **ChatView** composer + message stream | U3 |
| 4 | *(glowing shadow)* | **`--glow-*` token scale**, applied to glass | U1 |
| 5 | `aayush-duhan/cascade-text` | **CascadeHeading** — every screen title | U1 |
| 6 | `edwinvakayil/new-card` | **ToolCard** in Launchpad | U4 |
| 7 | `reapollo/table-of-contents` | **MDViewer** — notes/artifacts | U3 |
| 8 | `isaiahbjork/agent-plan` | **AgentPlan** — Cockpit plan-state pane | U2 |

Fetch each, then **adapt to our tokens** (dark palette, glass, glow, our
`lib/aurora.ts` springs). Never paste raw output. Use
`21st_magic_component_inspiration` to find complementary pieces (e.g. a glass
input, a stat pill) where useful.

---

## 2. Material & tokens (names frozen in globals.css; U1 owns values)

- **Canvas:** deep near-black `--background` (#07080c-ish), with the
  pixel-perfect-hero background layer behind everything (subtle, low-contrast).
- **Glass:** `--glass-bg` (translucent dark), `--glass-border` (hairline, faint
  violet/white), `--glass-blur`, plus `--glass-edge` (inner top highlight). Glass
  surfaces read as floating panes.
- **Glow shadow (the signature):** a frozen scale `--glow-sm | --glow-md |
  --glow-lg | --glow-xl` — soft, colored (accent violet/teal) outer glow under
  glass cards and the dock. Hover/active raise the glow tier.
- **Accent:** `--accent` (violet) primary; teal/indigo secondary stops.
- **Radius:** `--radius-sm/md/lg/xl` (existing).
- Keep status semantics: emerald (live/success), amber (running), rose (error),
  sky (info).

The Wave-2 spatial tokens (`--perspective`, `--z-*`, `--tilt-*`) may stay for
3D accents but are **not** the organizing idea anymore — **glass + glow** is.

---

## 3. Shell (U1)

- **No left sidebar.** A **top centered horizontal Dock** (`badtzx0/dock`):
  glass pill, magnify-on-hover icons, active indicator, tooltips. One dock item
  per primary view; the Command Bridge (⌘K) stays as an overlay, reachable from a
  dock item and the keyboard.
- **Background:** `pixel-perfect-hero` as a fixed layer behind content (replaces
  AuroraField as the primary backdrop; grain may stay for texture).
- **Content area:** a single scrolling stage below the dock; each view owns its
  scroll. Generous gutters.
- **View transitions:** keep a tasteful framer-motion crossfade/lift between
  views (from `lib/aurora.ts`); dark-glass, not the Wave-2 dolly if it fights the
  new look.
- **Headings:** every screen title uses **CascadeHeading** (`cascade-text`).

---

## 4. Per-surface intent

- **Mission Control (U2):** glass cards (glow on hover) for agents + workflows.
- **Cockpit (U2):** keep the live RunEvent timeline; add the **AgentPlan**
  (`agent-plan`) pane showing the run's plan/checklist state. Preserve all run
  wiring verbatim.
- **Kanban (U2):** glass columns, glowing task cards.
- **Chat (U3):** the **animated-ai-chat** experience — animated composer,
  streaming message bubbles on glass. Preserve `sendMessageStream`/voice wiring.
- **Memory (U3):** glass-framed knowledge graph (keep the data wiring; the
  visualization can stay or simplify to fit dark-glass).
- **Prompt Foundry (U3):** glass split panels.
- **Goal Mode (U3):** wire to the live goal run (B2); show the judge-loop turns +
  verdicts streaming into a glass panel.
- **MD viewer (U3):** **table-of-contents** component renders vault notes &
  tool artifacts (headings rail + body), reused by Memory and the Workbench.
- **Launchpad (U4):** **new-card** tool tiles (glow), "My Runs" rail.
- **Workbench (U4) — NEW:** the bespoke per-tool driving surface. A **step-rail**
  from the tool manifest's `steps[]`, a main pane that streams RunEvents from the
  launched run (`POST /v1/tools/{id}/launch`), and an **artifact stage** (render
  artifacts via MDViewer / iframe / file cards). This is where a tool actually
  runs.
- **Trust Rail (U4):** dark-glass reskin of the approval surface (keep wiring).

---

## 5. Motion & a11y

- Import all motion from `lib/aurora.ts`; no inline magic numbers.
- Animate `transform`/`opacity`/`box-shadow(glow)` only; throttle pointer work
  with rAF; `will-change` only while animating.
- Reduced motion: dock magnify/parallax/cascade stop → static; glow stays as a
  static shadow; transitions become fades.
- Keyboard: dock fully keyboard-navigable, visible focus rings; ⌘K Command
  Bridge keyboard-driven; all interactive glass has focus states.
- Contrast: ensure text on dark glass meets AA; glow never reduces legibility.

---

## 6. Worker rules of the road

- Compose U1's primitives (Dock, CascadeHeading, GlowCard, ToolCard,
  ChatComposer, MDViewer, AgentPlan, GlassCard); don't re-roll them per view.
- Props must stay assignable to `components/ui/contracts.ts`. Need a change? Ask
  the lead — it changes in the contract, not ad hoc.
- Stay inside owned files (plan's ownership map). Keep each component's **export
  name + props** stable so the shell + other views keep importing them.
- Data layer (`lib/hermes.ts`, `lib/types.ts`, `lib/cockpit.ts`) is read-only
  except the small additions the contract pre-declares (e.g. tool-launch client).
- `tsc` + `eslint` clean on owned files; production-grade React (typed, a11y, no
  `any`, no `console.log` in shipped paths).
