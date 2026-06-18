"use client";

// CockpitView — dark-glass reskin + AgentPlan pane (Wave 3).
//
// Wave 2 → Wave 3 changes:
//   • SpatialStage removed — glass + glow provides the depth language
//   • Toolbar replaced with CascadeHeading for the animated screen title
//   • Input bar: GlassCard kept; textarea + buttons styled to dark-glass tokens
//   • AgentPlan pane added as a sticky right column (w-64) showing the run's
//     plan/step state derived from the live CockpitRow list
//   • Layout: two-column flex — event timeline (flex-1) + AgentPlan (w-64)
//
// PRESERVED VERBATIM: all run wiring —
//   startRun, streamRunEventsTyped, reduceRows, TERMINAL_EVENTS, RunState,
//   submit, stop, onEvent, idCounter, unsubRef, scrollRef, nextId

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SendHorizontal, Square } from "lucide-react";
import type { RunEvent } from "@/lib/types";
import { startRun, streamRunEventsTyped } from "@/lib/hermes";
import { reduceRows, TERMINAL_EVENTS, type CockpitRow } from "@/lib/cockpit";
import { SPRING_GENTLE, TRANSITION_STANDARD } from "@/lib/aurora";
import { CockpitEvent } from "@/components/ui/CockpitEvent";
import { GlassCard } from "@/components/ui/GlassCard";
import { CascadeHeading } from "@/components/ui/CascadeHeading";
import { AgentPlan } from "@/components/ui/AgentPlan";
import { EmptyState } from "@/components/ui/EmptyState";
import { Radio } from "lucide-react";
import type { PlanStep } from "@/components/ui/contracts";

// ---------------------------------------------------------------------------
// Run state machine — unchanged from pre-Wave-3 version.
// ---------------------------------------------------------------------------

type RunState = "idle" | "running" | "completed" | "failed" | "cancelled";

const STATE_LABEL: Record<RunState, string> = {
  idle: "Idle",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATE_TINT: Record<RunState, string> = {
  idle: "border-border bg-surface-2 text-muted",
  running: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  cancelled: "border-border bg-surface-2 text-muted",
};

// ---------------------------------------------------------------------------
// Derive PlanStep[] from live CockpitRow list.
//
// Strategy (simple + real):
//   1) One "Run" lifecycle step — status tracks the overall RunState
//   2) Each distinct tool row becomes a step (tool name as title, status from row.status)
//   3) Each subagent row becomes a step (subagentType as title, status from row.status)
// ---------------------------------------------------------------------------

function rowsToSteps(rows: CockpitRow[], runState: RunState): PlanStep[] {
  const steps: PlanStep[] = [];

  // Overall run lifecycle step
  const runStepStatus: PlanStep["status"] =
    runState === "running"
      ? "running"
      : runState === "completed"
        ? "done"
        : runState === "failed"
          ? "error"
          : runState === "cancelled"
            ? "error"
            : "pending";

  steps.push({
    id: "run-lifecycle",
    title: "Run",
    status: runStepStatus,
  });

  // Tool and subagent rows — deduplicate by id (each row has a unique id)
  for (const row of rows) {
    if (row.kind === "tool" && row.tool) {
      const stepStatus: PlanStep["status"] =
        row.status === "running"
          ? "running"
          : row.status === "done"
            ? "done"
            : row.status === "error"
              ? "error"
              : "pending";
      steps.push({
        id: row.id,
        title: row.tool,
        status: stepStatus,
        detail: row.preview,
      });
    } else if (row.kind === "subagent") {
      const stepStatus: PlanStep["status"] =
        row.status === "running"
          ? "running"
          : row.status === "done"
            ? "done"
            : row.status === "error"
              ? "error"
              : "pending";
      steps.push({
        id: row.id,
        title: row.subagentType ?? "Sub-agent",
        status: stepStatus,
      });
    }
  }

  return steps;
}

// ---------------------------------------------------------------------------
// CockpitView
// ---------------------------------------------------------------------------

export function CockpitView() {
  // ── Run state (all wiring preserved verbatim) ──────────────────────────────
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState<CockpitRow[]>([]);
  const [state, setState] = useState<RunState>("idle");
  const idCounter = useRef(0);
  const unsubRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const nextId = () => `r-${idCounter.current++}`;

  useEffect(() => () => unsubRef.current?.(), []);

  // Auto-scroll to the newest row.
  useEffect(() => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
    );
  }, [rows]);

  const onEvent = useCallback((ev: RunEvent) => {
    setRows((prev) => reduceRows(prev, ev, nextId()));
    if (TERMINAL_EVENTS.has(ev.event)) {
      setState(
        ev.event === "run.completed"
          ? "completed"
          : ev.event === "run.cancelled"
            ? "cancelled"
            : "failed",
      );
      unsubRef.current?.();
      unsubRef.current = null;
    }
  }, []);

  async function submit() {
    const prompt = draft.trim();
    if (!prompt || state === "running") return;
    unsubRef.current?.();
    setRows([]);
    idCounter.current = 0;
    setState("running");
    setDraft("");

    const { runId, live } = await startRun(prompt);
    if (!runId || !live) {
      setRows([
        {
          id: nextId(),
          kind: "lifecycle",
          ts: Date.now(),
          event: "run.failed",
          error:
            "Engine not reachable — is the stack up? Start it with scripts/install.sh, then retry.",
        },
      ]);
      setState("failed");
      return;
    }
    unsubRef.current = streamRunEventsTyped(runId, onEvent);
  }

  function stop() {
    unsubRef.current?.();
    unsubRef.current = null;
    setState("cancelled");
  }

  // ── Derived AgentPlan steps ────────────────────────────────────────────────
  const planSteps = rowsToSteps(rows, state);

  // ── State badge (shown inline in the heading row) ─────────────────────────
  const stateBadge = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATE_TINT[state]}`}
    >
      {state === "running" && (
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
      )}
      {STATE_LABEL[state]}
    </span>
  );

  return (
    <div className="relative flex h-full flex-col">
      {/* Screen heading row */}
      <div className="flex items-end justify-between px-8 pt-8 pb-4">
        <CascadeHeading
          text="Cockpit"
          subtitle="Watch Claude plan and execute — live tool calls, edits, and sub-agents."
        />
        <div className="mb-1">{stateBadge}</div>
      </div>

      {/* Main body — event timeline (flex-1) + AgentPlan pane (w-64) */}
      <div className="relative z-10 flex min-h-0 flex-1 gap-4 px-6 pb-2 overflow-hidden">
        {/* Event timeline */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Radio />}
              title="Give Claude a task to run."
              hint="The run streams here as a live timeline — reasoning, tool calls, file diffs, terminal output, and any sub-agents it spawns."
              className="mx-auto mt-20 max-w-md"
            />
          ) : (
            <motion.ul layout className="mx-auto flex max-w-2xl flex-col gap-3 py-2">
              <AnimatePresence initial={false}>
                {rows.map((row) => (
                  <motion.div
                    key={row.id}
                    layout
                    initial={{ opacity: 0, y: 6, z: -20 }}
                    animate={{ opacity: 1, y: 0, z: 0 }}
                    transition={
                      row.kind === "message" || row.kind === "reasoning"
                        ? TRANSITION_STANDARD
                        : SPRING_GENTLE
                    }
                  >
                    <CockpitEvent row={row} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </div>

        {/* AgentPlan pane — sticky right column, only shown when run has started */}
        {planSteps.length > 0 && (
          <div className="hidden w-64 shrink-0 overflow-y-auto lg:block">
            <div
              className="sticky top-0 rounded-2xl border px-4 py-4"
              style={{
                background: "var(--glass-bg)",
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
                borderColor: "var(--glass-border)",
                boxShadow: "var(--glow-sm), var(--glass-edge)",
              }}
            >
              <AgentPlan steps={planSteps} />
            </div>
          </div>
        )}
      </div>

      {/* Input bar — glass panel sits flush at the bottom */}
      <GlassCard
        as="aside"
        elevation={2}
        className="relative z-10 mx-0 [border-radius:0] px-6 py-4"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder="Describe a task for Claude to execute…"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent/60"
          />
          {state === "running" ? (
            <button
              type="button"
              onClick={stop}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:text-foreground/80"
              aria-label="Stop watching this run"
              title="Stop watching"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!draft.trim()}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-accent text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Run"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
