"use client";

import { motion } from "framer-motion";
import { SPRING_GENTLE } from "@/lib/aurora";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** Persistent violet glow around the card border. */
  glow?: boolean;
  /**
   * Elevation shadow tier (Wave 2). Drives --elev-* shadow scale.
   * Defaults to 1 (resting). Pass 2–4 to pre-elevate the card.
   */
  elevation?: 1 | 2 | 3 | 4;
  /** Optional override for the wrapping element tag (layout only). */
  as?: "section" | "article" | "aside" | "div";
}

const ELEV_SHADOW: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--elev-1)",
  2: "var(--elev-2)",
  3: "var(--elev-3)",
  4: "var(--elev-4)",
};

/**
 * GlassCard — frosted glass surface for the Obsidian Aurora / Spatial OS system.
 *
 * Wave 2 additions:
 * - `elevation` prop: 1–4 shadow tier (--elev-* scale with violet rim at 3–4).
 * - `--glass-edge` inset shadow: 1px top highlight for the "lifted panel" feel.
 * - Hover border tints to the Wave 2 violet signature (rgba(124,92,255,.35)).
 * - Layout transitions via SPRING_GENTLE; root <MotionConfig reducedMotion="user">
 *   handles prefers-reduced-motion at the tree level.
 */
export function GlassCard({
  children,
  className = "",
  glow = false,
  elevation = 1,
}: GlassCardProps) {
  const elevShadow = ELEV_SHADOW[elevation];

  return (
    <motion.div
      layout
      transition={SPRING_GENTLE}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: `blur(var(--glass-blur))`,
        WebkitBackdropFilter: `blur(var(--glass-blur))`,
        border: "1px solid var(--glass-border)",
        // Edge-light (top inset highlight) + elevation shadow + optional glow.
        boxShadow: [
          elevShadow,
          "var(--glass-edge)",
          glow ? "var(--glow-spread)" : undefined,
        ]
          .filter(Boolean)
          .join(", "),
        borderRadius: "var(--radius-xl)",
      }}
      className={[
        "relative overflow-hidden",
        "transition-[border-color,box-shadow] duration-200",
        // Hover: Wave 2 violet border tint + nudge elevation when not glowing.
        !glow &&
          "hover:border-[rgba(124,92,255,0.35)] hover:shadow-[var(--elev-2),var(--glass-edge)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </motion.div>
  );
}
