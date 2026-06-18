"use client";

// GlassCard — frosted glass surface, reskinned for Wave 3 dark-glass + glow.
//
// Props are backward-compatible with Wave 2 consumers:
//   glow:      boolean — persistent glow (maps to --glow-md for a richer halo)
//   elevation: 1–4    — remapped to Wave 3 glow scale (1–2 → sm, 3 → md, 4 → lg)
//   as:        tag    — layout element (unused in motion.div but kept for compat)
//
// SPRING_GENTLE layout animation and motion.div wrapper preserved for
// list reordering / card positioning consumers.

import { motion } from "framer-motion";
import { SPRING_GENTLE } from "@/lib/aurora";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** Persistent violet glow around the card border. */
  glow?: boolean;
  /**
   * Elevation shadow tier (Wave 2 compat). Remapped to Wave 3 glow scale:
   *   1 → --glow-sm   2 → --glow-sm   3 → --glow-md   4 → --glow-lg
   */
  elevation?: 1 | 2 | 3 | 4;
  /** Optional override for the wrapping element tag (layout only). */
  as?: "section" | "article" | "aside" | "div";
}

// Wave 3: elevation tiers remapped to the --glow-* scale.
const ELEV_GLOW: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--glow-sm)",
  2: "var(--glow-sm)",
  3: "var(--glow-md)",
  4: "var(--glow-lg)",
};

const ELEV_GLOW_HOVER: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--glow-md)",
  2: "var(--glow-md)",
  3: "var(--glow-lg)",
  4: "var(--glow-xl)",
};

export function GlassCard({
  children,
  className = "",
  glow = false,
  elevation = 1,
}: GlassCardProps) {
  const restingShadow = [
    glow ? "var(--glow-md)" : ELEV_GLOW[elevation],
    "var(--glass-edge)",
  ].join(", ");

  const hoverShadow = [
    glow ? "var(--glow-lg)" : ELEV_GLOW_HOVER[elevation],
    "var(--glass-edge)",
  ].join(", ");

  return (
    <motion.div
      layout
      // Layout uses slow spring; box-shadow has its own fast micro-transition.
      transition={{
        ...SPRING_GENTLE,
        boxShadow: { duration: 0.2, ease: "easeOut" },
      }}
      initial={false}
      whileHover={{ boxShadow: hoverShadow }}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border: glow
          ? "1px solid rgba(124,92,255,0.30)"
          : "1px solid var(--glass-border)",
        boxShadow: restingShadow,
        borderRadius: "var(--radius-xl)",
      }}
      className={[
        "relative overflow-hidden",
        "transition-[border-color] duration-200",
        // Hover: tint border to violet accent.
        !glow && "hover:border-[rgba(124,92,255,0.30)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </motion.div>
  );
}
