"use client";

import { useState } from "react";
import { Target } from "lucide-react";

const MAX_TURNS = 20;

export function GoalModeView() {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [turn, setTurn] = useState(0);

  function start() {
    if (!goal.trim()) return;
    setRunning(true);
    setTurn(0);
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="flex items-center gap-3">
        <Target className="h-5 w-5 text-accent" />
        <h2 className="text-2xl font-semibold">Goal Mode</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Standing objective + a Gemini-Flash judge returning{" "}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
          {`{ done, reason }`}
        </code>{" "}
        each turn. Budget {MAX_TURNS} turns.
      </p>

      <div className="mt-6 max-w-2xl rounded-2xl border border-border bg-surface p-5">
        <label className="text-xs font-medium text-muted">Objective</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          placeholder="e.g. Draft, review and SEO-optimize a launch post for Agent Home."
          className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent/60"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={!goal.trim() || running}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
          >
            Start goal
          </button>
          {running && (
            <span className="text-xs text-muted">
              turn {turn}/{MAX_TURNS} · judge: pending
            </span>
          )}
        </div>
      </div>

      {running && (
        <div className="mt-5 max-w-2xl rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted">
          Goal loop is wired to Hermes <code className="font-mono">/goal</code>.
          When the gateway is live, judge verdicts and per-turn progress stream
          here.
        </div>
      )}
    </div>
  );
}
