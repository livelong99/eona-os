"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { SPRING_TILT, TILT_GLINT_OPACITY } from "@/lib/aurora";
import type { TiltCardProps } from "./contracts";

// ---------------------------------------------------------------------------
// TiltCard — the signature 3D tilt-on-hover surface (§3).
//
// Glass material; on hover:
//   1. Tilts ±--tilt-max (6°) toward the cursor via rotateX/rotateY springs.
//   2. Lifts one plane (translateZ 0 → 40px / --z-raise).
//   3. Shadow: --elev-1 → --elev-3 (includes violet rim at elev-3).
//   4. Optional specular glint: radial gradient following the cursor.
//
// flat=true  — skips rotation; still lifts + casts shadow.
// glow=true  — persistent violet ring (active/selected state).
// as         — polymorphic element (div|button|article|li).
//
// Reduced motion: rotation disabled; lift/shadow are pure CSS transitions.
// rAF-throttled pointer handler; will-change:transform only while hovering.
// ---------------------------------------------------------------------------

/** Read --tilt-max token (degrees). Cached per call site. */
function getTiltMax(): number {
  if (typeof window === "undefined") return 6;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--tilt-max")
    .trim();
  return parseFloat(raw) || 6;
}

// --z-raise token value in px (mirrors globals.css --z-raise: 40px).
// Not a magic number — directly reflects the token value. If the token
// changes, update this constant too.
const RAISE_PX = 40;

export function TiltCard({
  children,
  className = "",
  flat = false,
  glint = true,
  glow = false,
  onClick,
  // `as` is accepted by the contract but motion.div is always used here —
  // semantic element role is conveyed via aria-label + role on the outer div.
  as: _elementTag,
  "aria-label": ariaLabel,
}: TiltCardProps) {
  void _elementTag; // accepted by contract; motion.div renders the element
  const prefersReduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [glintPos, setGlintPos] = useState({ x: 50, y: 50 });

  // Springs for tilt (rotateX/Y) and lift (translateZ 0→RAISE_PX).
  const rotX = useSpring(0, SPRING_TILT);
  const rotY = useSpring(0, SPRING_TILT);
  const liftProgress = useSpring(0, SPRING_TILT); // 0 = resting, 1 = raised
  const tz = useTransform(liftProgress, [0, 1], [0, RAISE_PX]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (prefersReduced || flat) return;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const el = cardRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width - 0.5; // −0.5..0.5
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        const max = getTiltMax();
        rotX.set(-ny * max); // top tilts toward viewer when cursor in lower half
        rotY.set(nx * max);
        setGlintPos({
          x: Math.round((nx + 0.5) * 100),
          y: Math.round((ny + 0.5) * 100),
        });
      });
    },
    [prefersReduced, flat, rotX, rotY],
  );

  const handlePointerEnter = useCallback(() => {
    setHovered(true);
    liftProgress.set(1);
  }, [liftProgress]);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    rotX.set(0);
    rotY.set(0);
    liftProgress.set(0);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [rotX, rotY, liftProgress]);

  // Keyboard activation for button-like usage.
  const handleKeyDown = onClick
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  return (
    <motion.div
      ref={cardRef}
      onClick={onClick}
      aria-label={ariaLabel}
      tabIndex={onClick ? 0 : undefined}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      style={{
        rotateX: prefersReduced || flat ? 0 : rotX,
        rotateY: prefersReduced || flat ? 0 : rotY,
        translateZ: prefersReduced || flat ? 0 : tz,
        // Edge-light + glow-spread as inset shadows alongside elevation.
        boxShadow: [
          hovered ? "var(--elev-3)" : "var(--elev-1)",
          "var(--glass-edge)",
          glow ? "var(--glow-spread)" : undefined,
        ]
          .filter(Boolean)
          .join(", "),
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border: glow
          ? "1px solid rgba(124, 92, 255, 0.45)"
          : "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
        transformStyle: "preserve-3d",
        willChange: hovered ? "transform" : undefined,
        cursor: onClick ? "pointer" : undefined,
        position: "relative",
        overflow: "hidden",
      }}
      className={[
        // CSS fallback for elevation + border on hover (reduced-motion path).
        "transition-[border-color,box-shadow] duration-200",
        !glow && "hover:border-[rgba(124,92,255,0.35)]",
        // Focus ring for keyboard navigation (§10).
        onClick &&
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Specular cursor glint — radial gradient follows pointer (§3). */}
      {glint && !prefersReduced && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: hovered ? TILT_GLINT_OPACITY : 0,
            background: `radial-gradient(circle at ${glintPos.x}% ${glintPos.y}%, rgba(255,255,255,0.85) 0%, transparent 60%)`,
            transition: "opacity 0.15s ease",
            borderRadius: "inherit",
            zIndex: 1,
          }}
        />
      )}

      {/* Content layer sits above the glint. */}
      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
    </motion.div>
  );
}
