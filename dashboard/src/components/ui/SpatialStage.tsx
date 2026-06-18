"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useReducedMotion } from "framer-motion";
import type { SpatialStageProps } from "./contracts";

// ---------------------------------------------------------------------------
// Context — shared normalized pointer position for ParallaxLayer + TiltCard
// descendants. Values are in the range −0.5..0.5 from the stage center.
// ---------------------------------------------------------------------------

export interface SpatialPointer {
  /** −0.5 (left) … 0.5 (right) */
  x: number;
  /** −0.5 (top) … 0.5 (bottom) */
  y: number;
}

interface SpatialStageContextValue {
  /** True when the stage is in static mode or reduced-motion is active. */
  isStatic: boolean;
  /**
   * Subscribe to pointer updates. Calls `cb` immediately with the current
   * position, then on every subsequent move. Returns an unsubscribe fn.
   */
  subscribe: (cb: (p: SpatialPointer) => void) => () => void;
}

const DEFAULT_POINTER: SpatialPointer = { x: 0, y: 0 };

export const SpatialStageContext = createContext<SpatialStageContextValue>({
  isStatic: true,
  subscribe: () => () => undefined,
});

/** Consume the nearest SpatialStage's subscription interface. */
export function useSpatialPointer(): SpatialStageContextValue {
  return useContext(SpatialStageContext);
}

// ---------------------------------------------------------------------------
// SpatialStage — perspective root + pointer source
// ---------------------------------------------------------------------------

/**
 * SpatialStage provides the 3D perspective context for any
 * ParallaxLayer / TiltCard descendants. Mount one per view (or major section).
 *
 * - Sets `perspective: var(--perspective)` + `transform-style: preserve-3d`
 *   so nested translateZ/rotateXY read as real depth.
 * - Tracks the normalized pointer (−0.5..0.5) from the stage center via a
 *   rAF-throttled `pointermove` listener, then fans out to subscribers.
 * - `static` prop or `prefers-reduced-motion`: pointer tracking is skipped;
 *   elevation / translateZ still render as static depth cues.
 */
export function SpatialStage({
  children,
  className = "",
  static: isStaticProp = false,
}: SpatialStageProps) {
  const prefersReduced = useReducedMotion();
  const isStatic = isStaticProp || !!prefersReduced;

  const stageRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<SpatialPointer>(DEFAULT_POINTER);
  const rafRef = useRef<number | null>(null);
  const subscribersRef = useRef<Set<(p: SpatialPointer) => void>>(new Set());

  const subscribe = useCallback((cb: (p: SpatialPointer) => void) => {
    subscribersRef.current.add(cb);
    // Immediately push current value so late subscribers are up-to-date.
    cb(pointerRef.current);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  useEffect(() => {
    if (isStatic) return;

    const el = stageRef.current;
    if (!el) return;

    function handleMove(e: PointerEvent) {
      if (rafRef.current !== null) return; // already scheduled
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const rect = el!.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        const next: SpatialPointer = { x, y };
        pointerRef.current = next;
        subscribersRef.current.forEach((cb) => cb(next));
      });
    }

    function handleLeave() {
      // Reset to center so cards/layers spring back when pointer exits.
      const center: SpatialPointer = { x: 0, y: 0 };
      pointerRef.current = center;
      subscribersRef.current.forEach((cb) => cb(center));
    }

    el.addEventListener("pointermove", handleMove, { passive: true });
    el.addEventListener("pointerleave", handleLeave, { passive: true });

    return () => {
      el.removeEventListener("pointermove", handleMove);
      el.removeEventListener("pointerleave", handleLeave);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isStatic]);

  // Context value is stable: isStatic is a boolean primitive; subscribe is
  // memoised with useCallback. No ref reads at render time.
  const ctxValue: SpatialStageContextValue = { isStatic, subscribe };

  return (
    <SpatialStageContext.Provider value={ctxValue}>
      <div
        ref={stageRef}
        className={className}
        style={{
          perspective: "var(--perspective)",
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </div>
    </SpatialStageContext.Provider>
  );
}
