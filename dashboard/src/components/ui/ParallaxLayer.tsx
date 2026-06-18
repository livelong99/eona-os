"use client";

import { useEffect, useRef } from "react";
import { motion, useSpring } from "framer-motion";
import { PARALLAX } from "@/lib/aurora";
import { useSpatialPointer } from "./SpatialStage";
import type { ParallaxLayerProps, DepthPlane } from "./contracts";

// ---------------------------------------------------------------------------
// Depth-plane → translateZ mapping (mirrors --z-* tokens from globals.css)
// ---------------------------------------------------------------------------

const PLANE_Z: Record<DepthPlane, string> = {
  field: "var(--z-field)",
  back: "var(--z-back)",
  base: "var(--z-base)",
  raise: "var(--z-raise)",
  over: "var(--z-over)",
};

// Parallax budget comes from the CSS token; we read it once at component
// creation time. Falls back to 24 if the token isn't set (SSR / tests).
function getParallaxBudget(): number {
  if (typeof window === "undefined") return 24;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--parallax-budget")
    .trim();
  return parseFloat(raw) || 24;
}

// ---------------------------------------------------------------------------
// ParallaxLayer
// ---------------------------------------------------------------------------

/**
 * ParallaxLayer translates with the stage pointer at `depth` × budget (§2).
 *
 * - Subscribes to the nearest SpatialStage's pointer position.
 * - Applies `translate3d(dx, dy, planeZ)` via framer-motion springs
 *   (PARALLAX transition) so movement is fluid, not instant.
 * - `depth 0` = locked (no parallax); `depth 1` = full --parallax-budget travel.
 * - `plane` sets the base translateZ (resting depth plane).
 * - Reduced motion or static stage: no pointer-driven translation, only the
 *   static translateZ from `plane` remains as a depth cue.
 */
export function ParallaxLayer({
  children,
  className = "",
  depth = 0.5,
  plane = "base",
}: ParallaxLayerProps) {
  const { isStatic, subscribe } = useSpatialPointer();

  const springX = useSpring(0, PARALLAX);
  const springY = useSpring(0, PARALLAX);

  // Capture budget on mount; stable across renders.
  const budget = useRef(getParallaxBudget());

  useEffect(() => {
    if (isStatic) {
      springX.set(0);
      springY.set(0);
      return;
    }

    const unsub = subscribe((p) => {
      const travel = budget.current * depth;
      springX.set(p.x * travel);
      springY.set(p.y * travel);
    });

    return unsub;
  }, [isStatic, subscribe, depth, springX, springY]);

  return (
    <motion.div
      className={className}
      style={{
        x: springX,
        y: springY,
        translateZ: PLANE_Z[plane],
        transformStyle: "preserve-3d",
        willChange: isStatic ? undefined : "transform",
      }}
    >
      {children}
    </motion.div>
  );
}
