"use client";

// GoalModeView — live goal run wired to startGoal() + streamRunEventsTyped().
//
// On "Start goal": calls startGoal(objective) → gets runId, then streams
// RunEvents via streamRunEventsTyped(runId, onEvent). Judge turns / verdicts
// render in a scrollable dark-glass panel. Tolerates unknown event kinds
// including "goal.verdict" — rendered generically with kind label.
//
// State preserved: goal, running, turn, MAX_TURNS.
// Export name + props signature unchanged.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Target, XCircle } from "lucide-react";
import { startGoal, streamRunEventsTyped } from "@/lib/hermes";
import { LAYER_ITEM, LAYER_VARIANTS, SPRING_SNAPPY, TRANSITION_MICRO } from "@/lib/aurora";
import { GlowCard } from "@/components/ui/GlowCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { TiltCard } from "@/components/ui/TiltCard";
import { Toolbar } from "@/components/ui/Toolbar";
import { Stat } from "@/components/ui/Stat";
import type { RunEvent } from "@/lib/types";

const MAX_TURNS = 20;

// ---------------------------------------------------------------------------
// EventRow — renders one streamed RunEvent in the glass panel.
// Tolerates any event kind — unknown kinds get a generic chip.
// ---------------------------------------------------------------------------

interface EventRowProps {
  event: RunEvent;
  index: number;
}

function EventRow({ event, index }: EventRowProps) {
  const kind = event.event;

  const kindStr = kind as string;
  const isDone = kind === "run.completed" || kindStr === "goal.verdict";
  const isFailed = kind === "run.failed" || kind === "run.cancelled";

  let toneColor = "var(--muted)";
  if (isDone) toneColor = "rgb(52,211,153)";
  if (isFailed) toneColor = "rgb(251,113,133)";
  if (kind === "tool.started" || kind === "tool.completed") toneColor = "rgb(125,211,252)";
  if (kind === "message.delta" || kind === "reasoning.available") toneColor = "var(--accent)";

  const label = kind.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const body = event.text ?? event.tool ?? event.output ?? event.preview ?? "";

  return (
    <motion.li
      variants={LAYER_ITEM}
      custom={index}
      layout
      className="flex flex-col gap-1"
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: toneColor,
          }}
        >
          {label}
        </span>

        {isDone && (
          <CheckCircle2
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: toneColor }}
            aria-label="Done"
          />
        )}
        {isFailed && (
          <XCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: toneColor }}
            aria-label="Failed"
          />
        )}

        {body && (
          <p className="flex-1 text-xs leading-snug" style={{ color: "var(--foreground)" }}>
            {body.length > 300 ? `${body.slice(0, 300)}…` : body}
          </p>
        )}
      </div>

      {(isDone || isFailed) && (
        <div
          className="rounded-lg px-3 py-2 text-xs font-medium"
          style={{
            background: isDone ? "rgba(52,211,153,0.08)" : "rgba(251,113,133,0.08)",
            border: `1px solid ${isDone ? "rgba(52,211,153,0.25)" : "rgba(251,113,133,0.25)"}`,
            color: toneColor,
          }}
        >
          {isDone ? "Goal completed" : "Goal stopped"}
          {event.error && typeof event.error === "string" ? ` — ${event.error}` : ""}
        </div>
      )}
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// GoalModeView — exported component.
// ---------------------------------------------------------------------------

export function GoalModeView() {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [turn, setTurn] = useState(0);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Cleanup subscription on unmount.
  useEffect(() => {
    return () => {
      unsubRef.current?.();
    };
  }, []);

  // Auto-scroll to newest event.
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  async function start() {
    const text = goal.trim();
    if (!text || running) return;
    setRunning(true);
    setTurn(0);
    setEvents([]);
    setOffline(false);

    const { runId, live } = await startGoal(text, MAX_TURNS);

    if (!live || !runId) {
      setOffline(true);
      setRunning(false);
      return;
    }

    unsubRef.current = streamRunEventsTyped(runId, (ev) => {
      setEvents((prev) => [...prev, ev]);
      if (
        ev.event === "message.delta" ||
        ev.event === "tool.started" ||
        ev.event === "reasoning.available"
      ) {
        setTurn((t) => Math.min(t + 1, MAX_TURNS));
      }
      // Terminal events stop the run.
      if (
        ev.event === "run.completed" ||
        ev.event === "run.failed" ||
        ev.event === "run.cancelled" ||
        (ev.event as string) === "goal.verdict"
      ) {
        setRunning(false);
        unsubRef.current?.();
        unsubRef.current = null;
      }
    });
  }

  function stop() {
    unsubRef.current?.();
    unsubRef.current = null;
    setRunning(false);
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        icon={<Target className="h-4 w-4 text-accent" />}
        title="Goal Mode"
        subtitle={`Standing objective · budget ${MAX_TURNS} turns`}
      />

      <div className="flex-1 overflow-y-auto px-8 py-7">
        <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
          Standing objective + a Gemini-Flash judge returning{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              background: "var(--surface-2)",
              borderRadius: "var(--radius-sm)",
              padding: "0.125rem 0.375rem",
            }}
          >
            {`{ done, reason }`}
          </code>{" "}
          each turn. Budget {MAX_TURNS} turns.
        </p>

        <div className="max-w-2xl">
          {/* Objective card — glows violet when running (§3 active glow). */}
          <TiltCard glow={running} flat={false} className="p-5" aria-label="Objective card">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Objective
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              disabled={running}
              placeholder="e.g. Draft, review and SEO-optimize a launch post for Agent Home."
              className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent/60 disabled:opacity-60"
            />

            <div className="mt-3 flex items-center gap-3">
              {!running ? (
                <motion.button
                  type="button"
                  onClick={() => void start()}
                  disabled={!goal.trim()}
                  whileTap={{ scale: 0.93 }}
                  transition={TRANSITION_MICRO}
                  className="cursor-pointer rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                >
                  Start goal
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  onClick={stop}
                  whileTap={{ scale: 0.93 }}
                  transition={TRANSITION_MICRO}
                  className="cursor-pointer rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/20 transition-colors"
                >
                  Stop
                </motion.button>
              )}

              <AnimatePresence>
                {running && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={SPRING_SNAPPY}
                  >
                    <Stat label="Turn" value={`${turn} / ${MAX_TURNS}`} tone="accent" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </TiltCard>

          {/* Events panel — depth-aware rise on enter (§4 LAYER_ITEM). */}
          <AnimatePresence>
            {(events.length > 0 || offline) && (
              <motion.div
                variants={LAYER_ITEM}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: 8 }}
                className="mt-5"
              >
                {offline ? (
                  <GlassCard elevation={1} className="p-4 text-sm">
                    <span style={{ color: "var(--muted)" }}>
                      Goal loop is wired to Hermes{" "}
                      <code style={{ fontFamily: "var(--font-mono)" }}>/goal</code>.
                      Engine not detected — start the stack and try again.
                    </span>
                  </GlassCard>
                ) : (
                  <div style={{ maxHeight: "420px" }} className="flex flex-col overflow-hidden">
                  <GlowCard
                    as="section"
                    glow={running ? "md" : "sm"}
                    active={running}
                    aria-label="Goal run events"
                    className="flex flex-col overflow-hidden h-full"
                  >
                    <div
                      className="flex items-center gap-2 border-b px-4 py-2.5"
                      style={{ borderColor: "var(--glass-border)" }}
                    >
                      {running && (
                        <span
                          className="live-dot h-2 w-2 rounded-full"
                          style={{ background: "rgb(52,211,153)" }}
                          aria-label="Live"
                        />
                      )}
                      <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                        {running ? "Running…" : "Completed"}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-3">
                      <motion.ul
                        variants={LAYER_VARIANTS}
                        initial="hidden"
                        animate="visible"
                        className="flex flex-col gap-3"
                      >
                        {events.map((ev, i) => (
                          <EventRow
                            key={`${ev.runId}-${ev.timestamp}-${i}`}
                            event={ev}
                            index={i}
                          />
                        ))}
                      </motion.ul>
                      <div ref={eventsEndRef} />
                    </div>
                  </GlowCard>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
