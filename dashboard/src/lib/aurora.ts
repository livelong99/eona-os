import type { Transition } from "framer-motion";

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
  // grain + glow
  grainOpacity: "--grain-opacity",
  glowAccent: "--glow-accent",
  glowSpread: "--glow-spread",
} as const;

export type AuroraTokenKey = keyof typeof AuroraTokens;
