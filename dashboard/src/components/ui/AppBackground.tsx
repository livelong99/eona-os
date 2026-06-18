"use client";

// AppBackground — fixed full-viewport canvas layer (Wave 3).
//
// Structure: kokonutd/shape-landing-hero anatomy.
//   • ElegantShape — outer motion.div enters from {opacity:0, y:-150, rotate:rotate-15}
//     with duration:2.4s custom ease [0.23,0.86,0.39,0.98].
//   • Inner motion.div: perpetual y:[0,15,0] float (12s easeInOut infinite).
//   • Shape pill: rounded-full, linear-gradient from colour→transparent,
//     backdrop-blur, 1px border rgba(255,255,255,0.12), soft box-shadow.
//   • Five shapes at varied absolute positions, aurora palette colours.
//   • Deep #06070d base, top-center radial violet glow, top+bottom vignette.
//   • Reduced motion: useReducedMotion hook → shapes render static at final pose.

import { motion, useReducedMotion } from "framer-motion";
import type { AppBackgroundProps } from "./contracts";

interface ElegantShapeProps {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  /** CSS colour string for the left stop of linear-gradient to right. */
  gradient?: string;
}

function ElegantShape({
  className = "",
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = "rgba(255,255,255,0.08)",
}: ElegantShapeProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: -150, rotate: rotate - 15 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={
        prefersReduced
          ? { duration: 0 }
          : {
              duration: 2.4,
              delay,
              ease: [0.23, 0.86, 0.39, 0.98],
              opacity: { duration: 1.2 },
            }
      }
      className={`absolute ${className}`}
    >
      {/* Inner div — perpetual gentle float (skipped when reduced-motion) */}
      <motion.div
        animate={prefersReduced ? {} : { y: [0, 15, 0] }}
        transition={{
          duration: 12,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
        style={{ width, height }}
        className="relative"
      >
        {/* Shape pill */}
        <div
          className="absolute inset-0 rounded-full backdrop-blur-[2px]"
          style={{
            background: `linear-gradient(to right, ${gradient}, transparent)`,
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 32px 0 rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        />
      </motion.div>
    </motion.div>
  );
}

// ── AppBackground ─────────────────────────────────────────────────────────────

export function AppBackground({ className = "" }: AppBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-0 pointer-events-none overflow-hidden ${className}`}
      style={{ background: "#06070d" }}
    >
      {/* Radial violet glow — top-center ambient light */}
      <div
        className="absolute inset-x-0 top-0 h-[60%]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,92,255,0.12) 0%, transparent 70%)",
        }}
      />

      {/* Shape 1 — large violet pill, top-left */}
      <ElegantShape
        delay={0.3}
        width={600}
        height={140}
        rotate={12}
        gradient="rgba(124,92,255,0.15)"
        className="left-[-10%] md:left-[-5%] top-[15%] md:top-[20%]"
      />

      {/* Shape 2 — medium teal pill, bottom-right */}
      <ElegantShape
        delay={0.5}
        width={500}
        height={120}
        rotate={-15}
        gradient="rgba(0,212,170,0.12)"
        className="right-[-5%] md:right-[0%] top-[70%] md:top-[75%]"
      />

      {/* Shape 3 — small indigo pill, bottom-left */}
      <ElegantShape
        delay={0.4}
        width={300}
        height={80}
        rotate={-8}
        gradient="rgba(79,70,229,0.15)"
        className="left-[5%] md:left-[10%] bottom-[5%] md:bottom-[10%]"
      />

      {/* Shape 4 — small violet pill, top-right */}
      <ElegantShape
        delay={0.6}
        width={200}
        height={60}
        rotate={20}
        gradient="rgba(124,92,255,0.12)"
        className="right-[15%] md:right-[20%] top-[10%] md:top-[15%]"
      />

      {/* Shape 5 — tiny teal pill, top-center-left */}
      <ElegantShape
        delay={0.7}
        width={150}
        height={40}
        rotate={-25}
        gradient="rgba(0,212,170,0.10)"
        className="left-[20%] md:left-[25%] top-[5%] md:top-[10%]"
      />

      {/* Top + bottom vignette fades */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, #06070d 0%, transparent 20%, transparent 80%, #06070d 100%)",
        }}
      />
    </div>
  );
}
