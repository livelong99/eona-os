"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio, SendHorizontal, Square } from "lucide-react";
import type { RunEvent } from "@/lib/types";
import { startRun, streamRunEventsTyped } from "@/lib/hermes";
import { reduceRows, TERMINAL_EVENTS, type CockpitRow } from "@/lib/cockpit";
import { SPRING_GENTLE, TRANSITION_STANDARD } from "@/lib/aurora";
import { CockpitEvent } from "@/components/ui/CockpitEvent";

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

export function CockpitView() {
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

  return (
    <div className="relative flex h-full flex-col">
      <header className="relative z-10 flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-aurora-teal" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold">Cockpit</h2>
            <p className="text-xs text-muted">
              Watch Claude plan and execute — live tool calls, edits, and sub-agents.
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATE_TINT[state]}`}
        >
          {state === "running" && (
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
          )}
          {STATE_LABEL[state]}
        </span>
      </header>

      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-6 py-5">
        {rows.length === 0 ? (
          <div className="mx-auto mt-20 max-w-md text-center text-sm text-muted">
            <p className="mb-1 text-foreground/80">Give Claude a task to run.</p>
            <p>
              The run streams here as a live timeline — reasoning, tool calls, file
              diffs, terminal output, and any sub-agents it spawns.
            </p>
          </div>
        ) : (
          <motion.ul layout className="mx-auto flex max-w-3xl flex-col gap-3">
            <AnimatePresence initial={false}>
              {rows.map((row) => (
                <motion.div
                  key={row.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={row.kind === "message" || row.kind === "reasoning"
                    ? TRANSITION_STANDARD
                    : SPRING_GENTLE}
                >
                  <CockpitEvent row={row} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>

      <div className="relative z-10 border-t border-border px-6 py-4">
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
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:text-foreground/80"
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
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-40"
              aria-label="Run"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
