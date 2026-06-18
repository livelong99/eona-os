"use client";

// GlowCard — base dark-glass surface with a colored outer glow (Wave 3).
//
// The glow shadow is the Wave 3 signature: a soft, colored (violet/teal) outer
// halo under glass surfaces. Resting tier is configurable; hover raises one tier.
// Active prop locks the raised tier permanently (selected/focused state).
//
// Token map:
//   glow "sm" → --glow-sm    hover → --glow-md
//   glow "md" → --glow-md    hover → --glow-lg
//   glow "lg" → --glow-lg    hover → --glow-xl
//   glow "xl" → --glow-xl    hover → --glow-xl (ceiling)

import type React from "react";
import type { GlowCardProps, GlowTier } from "./contracts";

const GLOW_VAR: Record<GlowTier, string> = {
  sm: "var(--glow-sm)",
  md: "var(--glow-md)",
  lg: "var(--glow-lg)",
  xl: "var(--glow-xl)",
};

const GLOW_HOVER_VAR: Record<GlowTier, string> = {
  sm: "var(--glow-md)",
  md: "var(--glow-lg)",
  lg: "var(--glow-xl)",
  xl: "var(--glow-xl)",
};

export function GlowCard({
  children,
  className = "",
  glow = "sm",
  active = false,
  onClick,
  as: Tag = "div",
  "aria-label": ariaLabel,
}: GlowCardProps) {
  // If onClick present and Tag is div, upgrade to button for keyboard semantics.
  const Element = (onClick && Tag === "div" ? "button" : Tag) as React.ElementType;

  const restingShadow = [
    active ? GLOW_HOVER_VAR[glow] : GLOW_VAR[glow],
    "var(--glass-edge)",
  ].join(", ");

  const hoverShadow = [GLOW_HOVER_VAR[glow], "var(--glass-edge)"].join(", ");

  return (
    <Element
      onClick={onClick}
      aria-label={ariaLabel}
      // cursor-pointer only when interactive
      className={[
        "relative overflow-hidden",
        "transition-[box-shadow,border-color] duration-200",
        onClick ? "cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border: active
          ? "1px solid rgba(124,92,255,0.35)"
          : "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: restingShadow,
        // Focus ring via outline (Tailwind focus-visible not available on dynamic element)
        outlineColor: "var(--accent)",
        outlineOffset: "2px",
      }}
      // Hover: raise glow tier via inline style swap (CSS transition handles animation).
      // Only apply when not already active (active keeps raised tier statically).
      onMouseEnter={
        !active && onClick
          ? (e: React.MouseEvent<HTMLElement>) => {
              (e.currentTarget as HTMLElement).style.boxShadow = hoverShadow;
            }
          : undefined
      }
      onMouseLeave={
        !active && onClick
          ? (e: React.MouseEvent<HTMLElement>) => {
              (e.currentTarget as HTMLElement).style.boxShadow = restingShadow;
            }
          : undefined
      }
    >
      {children}
    </Element>
  );
}
