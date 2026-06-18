"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target } from "lucide-react";
import { LAYER_ITEM, SPRING_SNAPPY, TRANSITION_MICRO } from "@/lib/aurora";
import { SpatialStage } from "@/components/ui/SpatialStage";
import { ParallaxLayer } from "@/components/ui/ParallaxLayer";
import { TiltCard } from "@/components/ui/TiltCard";
import { Toolbar } from "@/components/ui/Toolbar";
import { Stat } from "@/components/ui/Stat";

// ---------------------------------------------------------------------------
// GoalModeView — spatial panel reskin.
//
// The objective TiltCard glows violet when running (§3 glow = active state).
// Progress panel enters with LAYER_ITEM depth-aware rise on run start.
// Turn counter rendered as a Stat chip.
//
// State/behavior preserved: goal, running, turn, start(), MAX_TURNS.
// The /goal pending-wiring note is kept in the progress placeholder.
// Export name + props signature unchanged.
// ---------------------------------------------------------------------------

const MAX_TURNS = 20;

export function GoalModeView() {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [turn, setTurn] = useState(0);

  // Original start logic — unchanged.
  function start() {
    if (!goal.trim()) return;
    setRunning(true);
    setTurn(0);
  }

  return (
    <SpatialStage className="flex h-full flex-col">
      <Toolbar
        icon={<Target className="h-4 w-4 text-accent" />}
        title="Goal Mode"
        subtitle={`Standing objective · budget ${MAX_TURNS} turns`}
      />

      {/* Content — mild parallax keeps the panel plane alive */}
      <ParallaxLayer
        depth={0.08}
        plane="base"
        className="flex-1 overflow-y-auto px-8 py-7"
      >
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

        {/* Objective card — glows violet when the loop is running (§3 glow). */}
        <div className="max-w-2xl">
          <TiltCard
            glow={running}
            flat={false}
            className="p-5"
            aria-label="Objective card"
          >
            <label
              className="text-xs font-medium"
              style={{ color: "var(--muted)" }}
            >
              Objective
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              placeholder="e.g. Draft, review and SEO-optimize a launch post for Agent Home."
              className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent/60"
            />

            <div className="mt-3 flex items-center gap-3">
              <motion.button
                type="button"
                onClick={start}
                disabled={!goal.trim() || running}
                whileTap={{ scale: 0.93 }}
                transition={TRANSITION_MICRO}
                animate={running ? {} : {}}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 cursor-pointer"
              >
                Start goal
              </motion.button>

              {/* Turn counter as a Stat chip — appears once running */}
              <AnimatePresence>
                {running && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={SPRING_SNAPPY}
                  >
                    <Stat
                      label="Turn"
                      value={`${turn} / ${MAX_TURNS}`}
                      tone="accent"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </TiltCard>

          {/* Progress placeholder — depth-aware rise on enter (§4 LAYER_ITEM) */}
          <AnimatePresence>
            {running && (
              <motion.div
                variants={LAYER_ITEM}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: 8 }}
                className="mt-5"
              >
                <div
                  className="rounded-lg border border-dashed border-border/70 p-4 text-sm"
                  style={{ color: "var(--muted)" }}
                >
                  Goal loop is wired to Hermes{" "}
                  <code
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    /goal
                  </code>
                  . When the gateway is live, judge verdicts and per-turn
                  progress stream here.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ParallaxLayer>
    </SpatialStage>
  );
}
