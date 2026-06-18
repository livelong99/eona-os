"use client";

// AgentPlan — vertical checklist of plan steps with status icons + expandable detail.
//
// Structure reproduced from isaiahbjork/agent-plan (21st.dev):
//   • Vertical list of PlanStep rows, each with a status icon column + title
//   • Status icons: pending (circle outline) | running (pulsing Loader2) |
//     done (CheckCircle2, emerald) | error (XCircle, rose)
//   • Each row is clickable to expand/collapse optional detail text
//   • Chevron rotates on expand; detail fades in with framer-motion
//
// Adaptations:
//   (a) Styling → dark-glass tokens (glass-bg, glass-border, glow scale)
//   (b) Wiring → AgentPlanProps / PlanStep from contracts.ts
//   (c) Motion → SPRING_SNAPPY from lib/aurora.ts

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from "lucide-react";
import { SPRING_SNAPPY } from "@/lib/aurora";
import type { AgentPlanProps, PlanStep } from "./contracts";

// ── Status icon ──────────────────────────────────────────────────────────────

interface StatusIconProps {
  status: PlanStep["status"];
}

function StatusIcon({ status }: StatusIconProps) {
  switch (status) {
    case "running":
      return (
        <Loader2
          className="h-4 w-4 shrink-0 animate-spin text-amber-400"
          aria-hidden
        />
      );
    case "done":
      return (
        <CheckCircle2
          className="h-4 w-4 shrink-0 text-emerald-400"
          aria-hidden
        />
      );
    case "error":
      return (
        <XCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden />
      );
    case "pending":
    default:
      return (
        <Circle className="h-4 w-4 shrink-0 text-muted/50" aria-hidden />
      );
  }
}

// ── Step label color ─────────────────────────────────────────────────────────

function stepTitleClass(status: PlanStep["status"]): string {
  switch (status) {
    case "running":
      return "text-foreground/90 font-medium";
    case "done":
      return "text-muted line-through";
    case "error":
      return "text-rose-300";
    case "pending":
    default:
      return "text-muted/70";
  }
}

// ── Connector line ───────────────────────────────────────────────────────────

function ConnectorLine({ status }: { status: PlanStep["status"] }) {
  const color =
    status === "done"
      ? "bg-emerald-500/30"
      : status === "error"
        ? "bg-rose-500/30"
        : "bg-border";

  return (
    <div
      aria-hidden
      className={`mx-[7px] w-px flex-1 ${color} transition-colors duration-300`}
    />
  );
}

// ── Single step row ──────────────────────────────────────────────────────────

interface StepRowProps {
  step: PlanStep;
  isLast: boolean;
}

function StepRow({ step, isLast }: StepRowProps) {
  const [open, setOpen] = useState(false);
  const prefersReduced = useReducedMotion();
  const hasDetail = Boolean(step.detail);

  return (
    <li className="flex gap-2.5">
      {/* Left column: icon + connector line */}
      <div className="flex flex-col items-center" aria-hidden>
        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <StatusIcon status={step.status} />
        </div>
        {!isLast && <ConnectorLine status={step.status} />}
      </div>

      {/* Right column: title + optional expandable detail */}
      <div
        className={[
          "min-w-0 flex-1 pb-3",
          isLast ? "" : "",
        ].join(" ")}
      >
        <button
          type="button"
          disabled={!hasDetail}
          onClick={() => hasDetail && setOpen((o) => !o)}
          aria-expanded={hasDetail ? open : undefined}
          className={[
            "flex w-full items-start gap-1.5 text-left",
            hasDetail
              ? "cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
              : "cursor-default",
          ].join(" ")}
        >
          <span className={`flex-1 text-sm leading-snug ${stepTitleClass(step.status)}`}>
            {step.title}
          </span>

          {hasDetail && (
            <motion.span
              animate={prefersReduced ? {} : { rotate: open ? 180 : 0 }}
              transition={SPRING_SNAPPY}
              className="mt-0.5 shrink-0 text-muted/50"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </motion.span>
          )}
        </button>

        <AnimatePresence initial={false}>
          {open && hasDetail && (
            <motion.div
              key="detail"
              initial={prefersReduced ? { opacity: 1 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={prefersReduced ? { opacity: 1 } : { opacity: 0, height: 0 }}
              transition={SPRING_SNAPPY}
              className="overflow-hidden"
            >
              <p
                className="mt-1 whitespace-pre-wrap rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted"
                style={{
                  background: "var(--glass-bg)",
                  borderColor: "var(--glass-border)",
                }}
              >
                {step.detail}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

// ── AgentPlan ────────────────────────────────────────────────────────────────

export function AgentPlan({ steps, className = "" }: AgentPlanProps) {
  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <aside
      className={["flex flex-col gap-3", className].join(" ")}
      aria-label="Agent plan"
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-0.5">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--muted)" }}
        >
          Plan
        </p>
        <span
          className="text-[11px] tabular-nums"
          style={{ color: "var(--muted)" }}
          aria-label={`${doneCount} of ${steps.length} steps done`}
        >
          {doneCount}/{steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-0.5 overflow-hidden rounded-full"
        style={{ background: "var(--glass-border)" }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, var(--accent), var(--aurora-teal))",
          }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Step list */}
      <ol className="flex flex-col" aria-label="Plan steps">
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} isLast={i === steps.length - 1} />
        ))}
      </ol>
    </aside>
  );
}
