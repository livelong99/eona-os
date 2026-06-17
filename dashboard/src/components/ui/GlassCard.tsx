"use client";

import { motion } from "framer-motion";
import { SPRING_GENTLE } from "@/lib/aurora";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** Persistent violet glow around the card border. */
  glow?: boolean;
  /** Optional override for the wrapping element tag (layout only; always renders motion.div). */
  as?: "section" | "article" | "aside" | "div";
}

/**
 * GlassCard — frosted glass surface for the Obsidian Aurora design system.
 *
 * - Uses CSS vars for glass-bg/glass-border so the token layer controls appearance.
 * - `glow` prop activates the --glow-spread shadow (violet aurora halo).
 * - Layout transitions via SPRING_GENTLE; reduced-motion is handled by the
 *   root <MotionConfig reducedMotion="user"> in layout.tsx.
 */
export function GlassCard({
  children,
  className = "",
  glow = false,
}: GlassCardProps) {
  return (
    <motion.div
      layout
      transition={SPRING_GENTLE}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: `blur(var(--glass-blur))`,
        WebkitBackdropFilter: `blur(var(--glass-blur))`,
        border: "1px solid var(--glass-border)",
        boxShadow: glow ? "var(--glow-spread)" : undefined,
      }}
      className={[
        "relative rounded-xl overflow-hidden",
        "transition-shadow duration-300",
        // Hover: intensify border + add glow when not already glowing
        !glow &&
          "hover:border-[rgba(124,92,255,0.35)] hover:shadow-[0_0_20px_rgba(124,92,255,0.2)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </motion.div>
  );
}
