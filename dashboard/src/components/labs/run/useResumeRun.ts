import { useEffect, useState } from "react";
import {
  getLatestRun,
  getRunStatus,
  getSessionMessages,
  getArtifacts,
  type ToolStep,
  type StepUi,
  type ArtifactFile,
  type SessionMessage,
} from "@/lib/labs/toolsClient";
import type { RunTurn } from "@/components/labs/run/useRunStages";

// The recovered run context plus the durable state to seed the screen with.
export interface ResumedRun {
  runId: string;
  sessionId: string;
  brand?: string;
  seedTurnsByStep: Record<number, RunTurn[]>;
  initialActiveStep: number;
  /** True only when the run still has an active event stream — gates whether
   * useRunStages opens streamRun. A completed run resumes read-only (history +
   * artifacts) and must NOT subscribe to /events (which 404s in a loop). */
  live: boolean;
}

type ResumeState =
  | { phase: "loading" }
  | { phase: "ended" } // 404 / no run found — caller shows the relaunch panel.
  | { phase: "error"; message: string }
  | { phase: "ready"; run: ResumedRun };

function uiOf(step: ToolStep): StepUi {
  if (step.ui === "artifact-iframe" || step.ui === "file-cards") return step.ui;
  return "chat";
}

function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// useResumeRun — recovers a deep-linked / reloaded Brand Maker run. The live
// event stream has no replay, so this rebuilds state from durable sources:
//   1. getLatestRun(toolId, brandId) → run_id + session_id (null/404 → ended).
//   2. getSessionMessages(session_id) → seed step 0's transcript (best-effort;
//      empty/failed history degrades gracefully — artifacts still populate the
//      mockup/prompt steps).
//   3. getArtifacts(toolId, run_id) → infer the latest stage with output.
// Skips entirely (stays "loading"→noop) when the caller already has nav state.
export function useResumeRun(
  enabled: boolean,
  toolId: string | undefined,
  brandId: string | undefined,
  steps: ToolStep[],
): ResumeState {
  const [state, setState] = useState<ResumeState>({ phase: "loading" });

  useEffect(() => {
    if (!enabled || !toolId || !brandId) return;
    const controller = new AbortController();
    const signal = controller.signal;

    (async () => {
      try {
        const latest = await getLatestRun(toolId, brandId, signal);
        if (signal.aborted) return;
        if (!latest) {
          setState({ phase: "ended" });
          return;
        }

        const runId = latest.run_id;
        const sessionId = latest.session_id;

        // Decide liveness BEFORE any streaming is attempted: a completed run
        // (latest.completed) is never live; otherwise ask the engine whether the
        // run currently has an active stream. A 404 here (null) means the run is
        // unknown/gone → treat as not live and resume read-only. This is what
        // stops the /events 404 loop: we only stream a run that is actually live.
        const status = latest.completed
          ? null
          : await getRunStatus(runId, signal).catch(() => null);
        if (signal.aborted) return;
        const live = !latest.completed && status?.live === true;

        // Rebuild the transcript (best-effort) and list artifacts in parallel.
        const [messages, artifacts] = await Promise.all([
          getSessionMessages(sessionId, signal).catch(() => [] as SessionMessage[]),
          getArtifacts(toolId, runId, signal).catch(() => [] as ArtifactFile[]),
        ]);
        if (signal.aborted) return;

        const seedTurnsByStep = seedFromMessages(messages);
        const initialActiveStep = inferActiveStep(steps, artifacts, messages.length);

        setState({
          phase: "ready",
          run: {
            runId,
            sessionId,
            brand: latest.brand ?? brandId,
            seedTurnsByStep,
            initialActiveStep,
            live,
          },
        });
      } catch (err: unknown) {
        if (signal.aborted) return;
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Could not resume this run.",
        });
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, toolId, brandId]);

  return state;
}

// Maps durable session messages → step 0's transcript. The live stream protocol
// is per-step, but durable history is a flat conversation, so we seat it all on
// step 0 (the intake Q&A) — the rail still lets the user review every stage, and
// artifacts populate later steps independently.
function seedFromMessages(messages: SessionMessage[]): Record<number, RunTurn[]> {
  const turns: RunTurn[] = [];
  for (const m of messages) {
    const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : null;
    const content = typeof m.content === "string" ? m.content : "";
    if (!role || !content.trim()) continue;
    turns.push({ id: rid(), role, content });
  }
  return turns.length > 0 ? { 0: turns } : {};
}

// Best-effort: place the user at the latest stage that already has output.
// Walk steps right-to-left; the first artifact-bearing step wins. Falls back to
// step 0 (all stages remain reviewable via the rail).
function inferActiveStep(
  steps: ToolStep[],
  artifacts: ArtifactFile[],
  messageCount: number,
): number {
  const hasHtml = artifacts.some((f) => f.kind === "html");
  const hasPromptOrAsset = artifacts.some(
    (f) => f.relpath.startsWith("assets/") || f.kind === "markdown",
  );

  for (let i = steps.length - 1; i >= 0; i--) {
    const ui = uiOf(steps[i]);
    if (ui === "file-cards" && hasPromptOrAsset) return i;
    if (ui === "artifact-iframe" && hasHtml) return i;
  }
  // No artifacts yet but a conversation exists → at least the intake happened.
  return messageCount > 0 ? 0 : 0;
}
