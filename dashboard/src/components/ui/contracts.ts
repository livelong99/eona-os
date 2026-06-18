// Primitive prop-API CONTRACT (Phase 0) — Spatial / Cinematic OS, Wave 2.
//
// These interfaces FREEZE the public API of the shared spatial kit so view
// workers (W3/W4/W5) compose against stable signatures while the Foundation
// worker (W1) builds the implementations in this directory. W1 MUST implement
// components whose props are assignable to these interfaces; if a prop needs to
// change, it changes here first (lead-owned), never ad hoc in a view.
//
// Type-only module — no runtime. See dashboard/DESIGN-spatial.md for behaviour.

import type { ReactNode } from "react";

/** Conceptual depth planes (§1). Maps to the --z-* / --elev-* tokens. */
export type DepthPlane = "field" | "back" | "base" | "raise" | "over";

/**
 * SpatialStage — provides the 3D perspective context + a pointer source for
 * any ParallaxLayer/TiltCard descendants. One per view (or per major section).
 */
export interface SpatialStageProps {
  children: ReactNode;
  className?: string;
  /** Disable pointer-driven parallax/tilt for this subtree (still 3D-capable). */
  static?: boolean;
}

/**
 * ParallaxLayer — translates with the stage pointer by `depth` × budget (§2).
 * depth 0 = locked, 1 = full --parallax-budget travel.
 */
export interface ParallaxLayerProps {
  children: ReactNode;
  className?: string;
  /** 0..1 parallax factor. */
  depth?: number;
  /** Resting plane (sets translateZ + base elevation). */
  plane?: DepthPlane;
}

/**
 * TiltCard — the signature 3D tilt-on-hover surface (§3). Glass material,
 * lifts a plane and tilts ±--tilt-max toward the cursor; optional cursor glint.
 */
export interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Turn off the 3D tilt (still a glass card with hover elevation). */
  flat?: boolean;
  /** Show the specular cursor glint. Default true. */
  glint?: boolean;
  /** Persistent violet glow (e.g. active/selected). */
  glow?: boolean;
  onClick?: () => void;
  /** Render as a button (keyboard/focus) vs a div. Default infers from onClick. */
  as?: "div" | "button" | "article" | "li";
  /** Forwarded for keyed lists / layout animations. */
  "aria-label"?: string;
}

/** Toolbar — a glass header strip for a surface (title slot + actions slot). */
export interface ToolbarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned actions (buttons, pills). */
  actions?: ReactNode;
  /** Optional leading icon node. */
  icon?: ReactNode;
  className?: string;
}

/** Stat — a single metric chip/tile (label + value, optional trend/accent). */
export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Semantic accent. */
  tone?: "default" | "accent" | "emerald" | "amber" | "rose" | "sky";
  className?: string;
}

/** EmptyState — centered placeholder for a surface with no data yet. */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  /** Optional primary action. */
  action?: ReactNode;
  className?: string;
}

/** A single command/result in the Command Bridge palette. */
export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  /** Group heading this item sorts under (e.g. "Go to", "Run", "Tools"). */
  group?: string;
  /** Lucide-style icon node. */
  icon?: ReactNode;
  /** Invoked on select. */
  run: () => void;
  /** Extra search aliases. */
  keywords?: string[];
}

/**
 * CommandPalette — the Overlay-plane omnibox shell (W1 builds the shell; W2's
 * CommandBridge supplies items + wiring). Descends from above on open (§9).
 */
export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
  /** Optional async source for query-driven results (e.g. memory search). */
  onQueryChange?: (q: string) => void;
}

// ===========================================================================
// Dark-Glass primitives (Wave 3) — CONTRACT. U1 builds the implementations
// (adapting the named 21st.dev components); U2/U3/U4 compose against these.
// See dashboard/DESIGN-darkglass.md. Props must stay assignable to these.
// ===========================================================================

/** Glow elevation tier — maps to the --glow-* token scale. */
export type GlowTier = "sm" | "md" | "lg" | "xl";

/** A primary-nav destination shown in the top Dock (21st: badtzx0/dock). */
export interface DockItem {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onSelect: () => void;
}

/** Dock — top centered horizontal nav (replaces the sidebar). */
export interface DockProps {
  items: DockItem[];
  /** Optional trailing action (e.g. ⌘K Command Bridge launcher). */
  trailing?: ReactNode;
  className?: string;
}

/** GlowCard — the base dark-glass surface with a colored outer glow. */
export interface GlowCardProps {
  children: ReactNode;
  className?: string;
  /** Resting glow tier (raises on hover). Default "sm". */
  glow?: GlowTier;
  /** Persistent (selected/active) — glow doesn't reset on mouse-leave. */
  active?: boolean;
  onClick?: () => void;
  as?: "div" | "button" | "article" | "li" | "section";
  "aria-label"?: string;
}

/** CascadeHeading — animated screen title (21st: aayush-duhan/cascade-text). */
export interface CascadeHeadingProps {
  text: string;
  /** Smaller subtitle rendered under the cascade title. */
  subtitle?: ReactNode;
  /** Heading level for a11y (visual size is fixed by the design). Default 1. */
  level?: 1 | 2;
  className?: string;
}

/** AppBackground — fixed canvas layer (21st: easemize/pixel-perfect-hero). */
export interface AppBackgroundProps {
  className?: string;
}

/** A tool tile in the Launchpad (21st: edwinvakayil/new-card). */
export interface ToolCardProps {
  id: string;
  title: string;
  blurb?: string;
  /** Stage chips: { label, hitl }. */
  stages?: { label: string; hitl?: boolean }[];
  onLaunch: (id: string) => void;
  className?: string;
}

/** One section in the MD table-of-contents viewer. */
export interface MDHeading {
  id: string;
  text: string;
  level: number;
}

/** MDViewer — markdown reader with a TOC rail (21st: reapollo/table-of-contents). */
export interface MDViewerProps {
  /** Raw markdown to render. */
  markdown: string;
  /** Optional title shown above the body. */
  title?: string;
  className?: string;
}

/** One step in a coding/tool plan (21st: isaiahbjork/agent-plan). */
export interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

/** AgentPlan — checklist/plan-state pane for the Cockpit. */
export interface AgentPlanProps {
  steps: PlanStep[];
  className?: string;
}

/** ChatComposer — animated chat input (21st: jatin-yadav05/animated-ai-chat). */
export interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Optional leading control (e.g. mic button). */
  leading?: ReactNode;
  className?: string;
}
