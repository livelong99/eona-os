"use client";

// CascadeHeading — animated screen title (Wave 3).
//
// Structure reproduced from aayush-duhan/cascade-text (21st.dev):
//   • framer-motion container with staggerChildren per letter
//   • Each letter is a motion.span with hidden→visible (y offset + opacity)
//   • Spaces preserved as non-breaking spaces to avoid layout collapse
//
// Adaptations:
//   (a) Styling → dark-glass tokens; text gradient: foreground → accent
//   (b) Wiring → CascadeHeadingProps from contracts.ts (text, subtitle, level, className)
//   (c) Spring → SPRING_CASCADE from lib/aurora (replaces inline spring values)
//   (d) Reduced motion → static render via useReducedMotion(); no stagger, no y offset

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { SPRING_CASCADE } from "@/lib/aurora";
import type { CascadeHeadingProps } from "./contracts";

// Container: orchestrates stagger across letter children.
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

// Each letter enters from below with a spring.
const letterVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: SPRING_CASCADE,
  },
};

// Reduced-motion: static — no enter animation.
const staticVariants: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
};

export function CascadeHeading({
  text,
  subtitle,
  level = 1,
  className = "",
}: CascadeHeadingProps) {
  const prefersReduced = useReducedMotion();
  const Tag = level === 2 ? "h2" : "h1";

  // Split text into individual characters for the cascade effect.
  const chars = Array.from(text);

  const usedContainer = prefersReduced ? staticVariants : containerVariants;
  const usedLetter = prefersReduced ? staticVariants : letterVariants;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* Heading — gradient text, letter-stagger cascade */}
      <Tag className="leading-tight">
        <motion.span
          className="inline-flex flex-wrap overflow-hidden"
          variants={usedContainer}
          initial="hidden"
          animate="visible"
          aria-label={text}
          style={{
            // Size tokens: h1 is large, h2 is medium
            fontSize: level === 1 ? "clamp(1.75rem, 4vw, 2.5rem)" : "clamp(1.25rem, 3vw, 1.75rem)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {chars.map((char, i) => (
            <motion.span
              key={i}
              variants={usedLetter}
              className="inline-block"
              // Preserve spaces — collapse prevents them from disappearing.
              style={{
                whiteSpace: char === " " ? "pre" : "normal",
                // Gradient applied per-letter via bg-clip-text
                background: "linear-gradient(135deg, var(--foreground) 0%, rgba(124,92,255,0.9) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
              aria-hidden="true"
            >
              {char === " " ? " " : char}
            </motion.span>
          ))}
        </motion.span>
      </Tag>

      {/* Subtitle — muted, renders immediately (no stagger) */}
      {subtitle && (
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--muted)" }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
