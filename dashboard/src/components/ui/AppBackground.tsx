"use client";

// AppBackground — fixed full-viewport canvas layer (Wave 3).
//
// Structure faithfully reproduced from kokonutd/shape-landing-hero on 21st.dev:
//   • ElegantShape — a motion.div that enters from y:-150 + rotate offset,
//     then runs a perpetual y:[0,15,0] float loop (12s easeInOut infinite).
//     Inner div: rounded-full, bg-gradient-to-r to-transparent, backdrop-blur-[2px],
//     border-2, shadow, + after: radial-gradient inner glow.
//   • Five shapes placed at the same structural positions as the reference.
//   • bg-gradient-to-br ambient field behind the shapes.
//   • Top + bottom vignette fades (from-[#030303] in ref → from-[--background] here).
//
// Adaptations (colors + layout only — shape/motion structure unchanged):
//   (a) bg-[#030303] → var(--background) (#06070d)
//   (b) Gradient colours → violet/teal/indigo on our aurora palette
//   (c) Shape borders → rgba(124,92,255,0.18) matching --glass-border
//   (d) Dropped: badge, h1, p, CTA — backdrop only
//   (e) Layout: fixed inset-0 z-0 pointer-events-none (not min-h-screen flex)
//   (f) Reduced motion: respects root <MotionConfig reducedMotion="user"> in layout.tsx

import { motion } from "framer-motion";
import type { AppBackgroundProps } from "./contracts";

// ── ElegantShape — structure verbatim from kokonutd/shape-landing-hero ────────

interface ElegantShapeProps {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
}

function ElegantShape({
  className = "",
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = "from-white/[0.08]",
}: ElegantShapeProps) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: -150,
        rotate: rotate - 15,
      }}
      animate={{
        opacity: 1,
        y: 0,
        rotate: rotate,
      }}
      transition={{
        duration: 2.4,
        delay,
        ease: [0.23, 0.86, 0.39, 0.96],
        opacity: { duration: 1.2 },
      }}
      className={`absolute ${className}`}
    >
      <motion.div
        animate={{ y: [0, 15, 0] }}
        transition={{
          duration: 12,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
        style={{ width, height }}
        className="relative"
      >
        <div
          className={[
            "absolute inset-0 rounded-full",
            "bg-gradient-to-r to-transparent",
            gradient,
            "backdrop-blur-[2px]",
            "after:absolute after:inset-0 after:rounded-full",
            "after:bg-[radial-gradient(circle_at_50%_50%,rgba(124,92,255,0.15),transparent_70%)]",
          ].join(" ")}
          style={{
            // Adapted: violet-tinted border matches --glass-border
            border: "2px solid rgba(124,92,255,0.18)",
            boxShadow: "0 8px 32px 0 rgba(124,92,255,0.08)",
          }}
        />
      </motion.div>
    </motion.div>
  );
}

// ── AppBackground ──────────────────────────────────────────────────────────────

export function AppBackground({ className = "" }: AppBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-0 pointer-events-none overflow-hidden ${className}`}
      style={{ background: "var(--background)" }}
    >
      {/* ── Ambient gradient field (ref: bg-gradient-to-br from-indigo-500/[0.05] to-rose-500/[0.05])
          Adapted: violet + teal on our aurora palette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(124,92,255,0.05) 0%, transparent 50%, rgba(0,212,170,0.05) 100%)",
          filter: "blur(3px)",
        }}
      />

      {/* ── Five ElegantShapes — same structural positions as the reference ──
          Ref positions preserved exactly; only gradient colours adapted. */}

      {/* Shape 1 — large violet pill, top-left (ref: indigo, left-[-5%] top-[20%]) */}
      <ElegantShape
        delay={0.3}
        width={600}
        height={140}
        rotate={12}
        gradient="from-[rgba(124,92,255,0.15)]"
        className="left-[-10%] md:left-[-5%] top-[15%] md:top-[20%]"
      />

      {/* Shape 2 — medium teal pill, bottom-right (ref: rose, right-[0%] top-[75%]) */}
      <ElegantShape
        delay={0.5}
        width={500}
        height={120}
        rotate={-15}
        gradient="from-[rgba(0,212,170,0.12)]"
        className="right-[-5%] md:right-[0%] top-[70%] md:top-[75%]"
      />

      {/* Shape 3 — small indigo pill, bottom-left (ref: violet, left-[10%] bottom-[10%]) */}
      <ElegantShape
        delay={0.4}
        width={300}
        height={80}
        rotate={-8}
        gradient="from-[rgba(79,70,229,0.15)]"
        className="left-[5%] md:left-[10%] bottom-[5%] md:bottom-[10%]"
      />

      {/* Shape 4 — small violet pill, top-right (ref: amber, right-[20%] top-[15%]) */}
      <ElegantShape
        delay={0.6}
        width={200}
        height={60}
        rotate={20}
        gradient="from-[rgba(124,92,255,0.10)]"
        className="right-[15%] md:right-[20%] top-[10%] md:top-[15%]"
      />

      {/* Shape 5 — tiny teal pill, top-center-left (ref: cyan, left-[25%] top-[10%]) */}
      <ElegantShape
        delay={0.7}
        width={150}
        height={40}
        rotate={-25}
        gradient="from-[rgba(0,212,170,0.10)]"
        className="left-[20%] md:left-[25%] top-[5%] md:top-[10%]"
      />

      {/* ── Top + bottom vignette fades (verbatim from reference structure)
          Ref: bg-gradient-to-t from-[#030303] via-transparent to-[#030303]/80
          Adapted: --background token */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, var(--background) 0%, transparent 20%, transparent 80%, var(--background) 100%)",
        }}
      />
    </div>
  );
}
