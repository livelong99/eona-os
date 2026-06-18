import type { Transition, Variants } from "framer-motion";

// ---------------------------------------------------------------------------
// Spring vocabulary — one shared set used across the whole dashboard.
// Import these instead of inlining spring values in components.
// framer-motion@12: SpringOptions dropped the `type` discriminant; use
// Transition with type:"spring" explicitly or pass as plain SpringOptions.
// ---------------------------------------------------------------------------

/** Gentle layout transitions: cards repositioning, list reorder. */
export const SPRING_GENTLE: Transition = {
  type: "spring",
  stiffness: 120,
  damping: 20,
  mass: 1,
};

/** Snappy micro-interactions: button press, badge pop. */
export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 28,
  mass: 0.8,
};

/** Slow cinematic motion: page-level enter, aurora orb drift. */
export const SPRING_SLOW: Transition = {
  type: "spring",
  stiffness: 60,
  damping: 18,
  mass: 1.4,
};

// ---------------------------------------------------------------------------
// Spatial / Cinematic OS vocabulary (Wave 2) — see dashboard/DESIGN-spatial.md.
// CONTRACT (Phase 0): these NAMES are frozen so every worker imports the same
// motion. Worker W1 (Foundation) owns the final tuned values.
// ---------------------------------------------------------------------------

/** 3D tilt + card lift — responsive, settles cleanly, no wobble (§3). */
export const SPRING_TILT: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 26,
  mass: 0.7,
};

/** Parallax follow — lightly damped, fast (pointer-tracking) (§2). */
export const PARALLAX: Transition = {
  type: "spring",
  stiffness: 180,
  damping: 28,
  mass: 0.6,
};

/** Opacity for the specular cursor glint overlay on TiltCard. */
export const TILT_GLINT_OPACITY = 0.18;

/** View→view "camera dolly" (depth, not pan) (§5). */
export const VIEW_SWOOP: Transition = {
  type: "spring",
  stiffness: 80,
  damping: 19,
  mass: 1.2,
};

/**
 * Depth-aware container/child variants for staggered list/section entrance.
 * Parent uses `LAYER_VARIANTS` as `variants` with initial="hidden"
 * animate="visible"; children use `LAYER_ITEM`.
 */
export const LAYER_VARIANTS: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const LAYER_ITEM: Variants = {
  hidden: { opacity: 0, y: 12, z: -40 },
  visible: { opacity: 1, y: 0, z: 0, transition: SPRING_GENTLE },
};

/** View-transition variants for the shell's AnimatePresence (§5). */
export const VIEW_VARIANTS: Variants = {
  initial: { opacity: 0, z: 60, scale: 1.02 },
  enter: { opacity: 1, z: 0, scale: 1, transition: VIEW_SWOOP },
  exit: { opacity: 0, z: -80, scale: 0.98, transition: VIEW_SWOOP },
};

// ---------------------------------------------------------------------------
// Named transitions (non-spring, duration-based) for CSS-driven elements.
// ---------------------------------------------------------------------------

/** 150 ms — hover colour, opacity micro-state. */
export const TRANSITION_MICRO: Transition = {
  duration: 0.15,
  ease: "easeOut",
};

/** 250 ms — panel open/close, card expand. */
export const TRANSITION_STANDARD: Transition = {
  duration: 0.25,
  ease: [0.4, 0, 0.2, 1], // material ease-in-out
};

/** 400 ms — route / view transition. */
export const TRANSITION_PAGE: Transition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1], // expo-out feel
};

// ---------------------------------------------------------------------------
// Dark-Glass vocabulary (Wave 3) — see dashboard/DESIGN-darkglass.md.
// These supplement (never replace) the Wave 2 exports above.
// ---------------------------------------------------------------------------

/** Dock icon magnify spring — snappy, zero wobble. */
export const SPRING_DOCK: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
};

/** Cascade text letter/word entrance stagger. */
export const SPRING_CASCADE: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 22,
  mass: 0.9,
};

/** Glow opacity/opacity micro-fade (200 ms). */
export const TRANSITION_GLOW: Transition = {
  duration: 0.2,
  ease: "easeOut",
};

/**
 * View crossfade for dark-glass shell — a gentle lift-in/fade rather than the
 * Wave 2 camera dolly. page.tsx uses this; VIEW_VARIANTS kept for U2/U3.
 */
export const VIEW_FADE: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: TRANSITION_STANDARD },
  exit: { opacity: 0, y: -6, transition: TRANSITION_MICRO },
};

// ---------------------------------------------------------------------------
// CSS variable helpers — reference tokens without hard-coding values.
// ---------------------------------------------------------------------------

/** Returns `var(--<name>)` for use in inline styles. */
export const cssVar = (name: string): string => `var(--${name})`;

/** Raw CSS var names for the Obsidian Aurora token set. */
export const AuroraTokens = {
  // base palette
  background: "--background",
  surface: "--surface",
  surface2: "--surface-2",
  border: "--border",
  foreground: "--foreground",
  muted: "--muted",
  accent: "--accent",
  // aurora color stops
  violet: "--aurora-violet",
  teal: "--aurora-teal",
  indigo: "--aurora-indigo",
  // glass
  glassBg: "--glass-bg",
  glassBorder: "--glass-border",
  glassBlur: "--glass-blur",
  glassEdge: "--glass-edge",
  // grain + glow (legacy)
  grainOpacity: "--grain-opacity",
  glowAccent: "--glow-accent",
  glowSpread: "--glow-spread",
  // glow scale (Wave 3)
  glowSm: "--glow-sm",
  glowMd: "--glow-md",
  glowLg: "--glow-lg",
  glowXl: "--glow-xl",
  // dock (Wave 3)
  dockBg: "--dock-bg",
  dockBorder: "--dock-border",
  // spatial (Wave 2)
  perspective: "--perspective",
  zField: "--z-field",
  zBack: "--z-back",
  zBase: "--z-base",
  zRaise: "--z-raise",
  zOver: "--z-over",
  elev1: "--elev-1",
  elev2: "--elev-2",
  elev3: "--elev-3",
  elev4: "--elev-4",
  tiltMax: "--tilt-max",
  tiltGlow: "--tilt-glow",
  parallaxBudget: "--parallax-budget",
  radiusSm: "--radius-sm",
  radiusMd: "--radius-md",
  radiusLg: "--radius-lg",
  radiusXl: "--radius-xl",
} as const;

export type AuroraTokenKey = keyof typeof AuroraTokens;
