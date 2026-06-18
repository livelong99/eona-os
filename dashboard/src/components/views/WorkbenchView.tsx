"use client";

// Tool Workbench — U4 implementation (Wave 3).
//
// The bespoke per-tool driving surface. Internal sub-components live in
// WorkbenchParts.tsx (kept separate so both files stay under 500 lines).
//
// Reads active tool from lib/workbench.ts useActiveTool().
// Streams via lib/hermes.ts streamRunEventsTyped (read-only).
// Reduces events via lib/cockpit.ts reduceRows (pure, read-only).

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { CascadeHeading } from "@/components/ui/CascadeHeading";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { getTools, findTool } from "@/lib/tools";
import { launchTool, streamRunEventsTyped } from "@/lib/hermes";
import { useActiveTool, navigate } from "@/lib/workbench";
import { reduceRows, TERMINAL_EVENTS } from "@/lib/cockpit";
import {
  StepRail,
  InputForm,
  RunButton,
  RunPane,
  ArtifactStage,
} from "@/components/views/WorkbenchParts";
import type { ToolManifest } from "@/lib/tools";
import type { CockpitRow } from "@/lib/cockpit";

// ---------------------------------------------------------------------------
// WorkbenchView
// ---------------------------------------------------------------------------

export function WorkbenchView() {
  const activeId = useActiveTool();

  const [manifest, setManifest] = useState<ToolManifest | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);

  const [values, setValues] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<CockpitRow[]>([]);
  const [running, setRunning] = useState(false);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  const rowCounterRef = useRef(0);
  const unsubRef = useRef<(() => void) | null>(null);

  // Load manifest whenever the active tool changes. The synchronous resets are
  // intentional — clear stale tool state when the user switches tools.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!activeId) {
      setManifest(null);
      return;
    }
    setLoadingManifest(true);
    setValues({});
    setRows([]);
    setActiveStepIdx(0);
    getTools().then(({ tools }) => {
      setManifest(findTool(activeId, tools) ?? null);
      setLoadingManifest(false);
    });
  }, [activeId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Teardown stream on unmount
  useEffect(() => {
    return () => {
      unsubRef.current?.();
    };
  }, []);

  const handleInputChange = useCallback((id: string, val: string) => {
    setValues((prev) => ({ ...prev, [id]: val }));
  }, []);

  const handleRun = useCallback(async () => {
    if (!activeId || running) return;

    unsubRef.current?.();
    unsubRef.current = null;

    setRunning(true);
    setRows([]);
    rowCounterRef.current = 0;
    setActiveStepIdx(0);

    const { runId } = await launchTool(activeId, values);
    if (!runId) {
      setRunning(false);
      return;
    }

    unsubRef.current = streamRunEventsTyped(runId, (ev) => {
      const id = `r-${++rowCounterRef.current}`;
      setRows((prev) => reduceRows(prev, ev, id));

      // Advance step rail heuristic: each tool.started ~= next step
      if (ev.event === "tool.started") {
        setActiveStepIdx((i) =>
          Math.min(i + 1, (manifest?.steps.length ?? 1) - 1),
        );
      }

      if (TERMINAL_EVENTS.has(ev.event)) {
        setRunning(false);
        unsubRef.current?.();
        unsubRef.current = null;
      }
    });
  }, [activeId, manifest, running, values]);

  // --- No active tool ---
  if (!activeId) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Play />}
          title="No tool selected"
          hint="Go to the Launchpad and press Launch on any tool."
          action={
            <button
              type="button"
              onClick={() => navigate("launchpad")}
              className={[
                "cursor-pointer mt-2 rounded-full px-4 py-1.5 text-sm font-semibold border",
                "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/40",
                "hover:bg-[var(--accent)]/30 transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              ].join(" ")}
            >
              Go to Launchpad
            </button>
          }
          className="max-w-sm"
        />
      </div>
    );
  }

  if (loadingManifest || !manifest) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: "var(--accent)" }}
          aria-label="Loading tool"
        />
      </div>
    );
  }

  const activeStep = manifest.steps[activeStepIdx];

  return (
    <div className="flex flex-col h-full px-8 py-7 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate("launchpad")}
          aria-label="Back to Launchpad"
          className={[
            "cursor-pointer rounded-full p-1.5 border transition-colors duration-150",
            "border-[var(--glass-border)] hover:border-[var(--accent)]/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          ].join(" ")}
          style={{ color: "var(--muted)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <CascadeHeading
          text={manifest.title}
          subtitle={manifest.description}
          level={1}
        />
      </div>

      {/* 3-column layout on lg, stacked on mobile */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Step rail (left) */}
        <div className="lg:w-52 shrink-0">
          <StepRail steps={manifest.steps} activeIdx={activeStepIdx} />
        </div>

        {/* Main pane (right) */}
        <div className="flex flex-col gap-5 flex-1 min-w-0">
          {/* Input form */}
          {manifest.inputs.length > 0 && (
            <GlassCard className="p-5">
              <h2
                className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: "var(--muted)" }}
              >
                Inputs
              </h2>
              <InputForm
                inputs={manifest.inputs}
                values={values}
                onChange={handleInputChange}
                onRun={handleRun}
                running={running}
              />
            </GlassCard>
          )}

          {/* Run button when manifest has no inputs */}
          {manifest.inputs.length === 0 && (
            <GlassCard className="p-5">
              <RunButton running={running} onClick={handleRun} />
            </GlassCard>
          )}

          {/* Streaming run event trace */}
          <RunPane rows={rows} isRunning={running} />

          {/* Artifact stage */}
          <ArtifactStage rows={rows} activeStep={activeStep} />
        </div>
      </div>
    </div>
  );
}
