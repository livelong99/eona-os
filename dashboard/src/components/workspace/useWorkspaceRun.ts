// useWorkspaceRun — drives one workspace orchestrator run. Reuses the shared
// useRunLanes engine (same SSE/transcript lane mechanism + AgentLane type) with
// the workspace team roster + architect main lane, and layers on the
// workspace.json phase state and per-feature design→sprint cycle.

import { useCallback, useRef, useState } from "react";
import type { AgentLane, LaneRole } from "@/components/toolkit/agentRun";
import { useRunLanes } from "@/components/toolkit/useRunLanes";
import type { QnADoc } from "@/lib/brainstorm/brainstormClient";
import {
  fetchWorkspaceState,
  fetchWorkspaceQna,
  fetchDesign,
  fetchEpics,
  sendAnswers,
  sendDirective,
  createFeature as createFeatureReq,
  switchFeature as switchFeatureReq,
  WORKSPACE_TOOL_ID,
  type RunEvent,
  type WorkspaceState,
  type WorkspacePhase,
  type WorkspaceFeature,
} from "@/lib/workspace/workspaceClient";

const MAIN_LANE_ID = "architect";
const MAIN_LABEL = "Winston";
const MAIN_ROLE = "Architect · Orchestrator";

// The workspace team. Order = sidebar order; `match` infers a lane's role from the
// Task description / transcript brief so the spawn + transcript merge into one lane.
export const WORKSPACE_ROLES: LaneRole[] = [
  { key: "pm", label: "PM", match: /\bpm\b|product manager|\bproduct\b/i },
  { key: "ux", label: "UX Designer", match: /\bux\b|ux.?design|user experience/i },
  { key: "frontend", label: "Frontend Dev", match: /front.?end|\bui\b/i },
  { key: "backend", label: "Backend Dev", match: /back.?end|\bapi\b|server/i },
  { key: "analyst", label: "Analyst", match: /analyst|analysis/i },
  { key: "researcher", label: "Researcher", match: /research/i },
  { key: "test", label: "Test Architect", match: /test|\bqa\b/i },
  { key: "review", label: "Code Reviewer", match: /review/i },
];

interface Result {
  lanes: AgentLane[];
  state: WorkspaceState | null;
  qna: QnADoc | null;
  design: string | null;
  epics: string | null;
  phase: WorkspacePhase | null;
  features: WorkspaceFeature[];
  /** The feature currently being viewed (override, else workspace.json.active_feature). */
  activeFeature: string | null;
  /** The feature the orchestrator is actually working (workspace.json.active_feature). */
  liveFeature: string | null;
  streaming: boolean;
  error: string | null;
  submitAnswers: (answers: Record<string, string>) => Promise<void>;
  directive: (text: string) => Promise<void>;
  setActiveFeature: (slug: string | null) => void;
  createFeature: (title: string, description?: string) => Promise<void>;
  switchFeature: (slug: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useWorkspaceRun(
  runId: string | null,
  { streamLive = true }: { streamLive?: boolean } = {},
): Result {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [qna, setQna] = useState<QnADoc | null>(null);
  const [design, setDesign] = useState<string | null>(null);
  const [epics, setEpics] = useState<string | null>(null);
  // Feature being VIEWED (override). null → follow workspace.json.active_feature.
  const [featureOverride, setFeatureOverride] = useState<string | null>(null);
  const featureOverrideRef = useRef<string | null>(null);
  // setError is wired up after useRunLanes; the ref lets refetch close over it.
  const setErrorRef = useRef<(e: string | null) => void>(() => {});

  const refetch = useCallback(async () => {
    if (!runId) return;
    try {
      const s = await fetchWorkspaceState(runId);
      if (s) setState(s);
      // Resolve which feature's docs to fetch: the viewed override, else the
      // orchestrator's active feature. undefined → legacy single-cycle paths.
      const slug = featureOverrideRef.current ?? s?.active_feature ?? undefined;
      const [q, d, e2] = await Promise.all([
        fetchWorkspaceQna(runId, slug),
        fetchDesign(runId, slug),
        fetchEpics(runId, slug),
      ]);
      // Set unconditionally so switching features clears stale docs.
      setQna(q);
      setDesign(d);
      setEpics(e2);
    } catch (e) {
      setErrorRef.current(e instanceof Error ? e.message : "failed to load workspace state");
    }
  }, [runId]);

  const { lanes, streaming, setStreaming, error, setError, applyEvent } = useRunLanes(runId, {
    roles: WORKSPACE_ROLES,
    mainLane: { id: MAIN_LANE_ID, label: MAIN_LABEL, role: MAIN_ROLE },
    streamLive,
    toolId: WORKSPACE_TOOL_ID,
    refetch,
  });
  setErrorRef.current = setError;

  const submitAnswers = useCallback(
    async (answers: Record<string, string>) => {
      if (!runId) return;
      setError(null);
      setStreaming(true);
      try {
        await sendAnswers(runId, answers, { onEvent: applyEvent });
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to submit answers");
      } finally {
        setStreaming(false);
        await refetch();
      }
    },
    [runId, applyEvent, refetch, setError, setStreaming],
  );

  const directive = useCallback(
    async (text: string) => {
      if (!runId) return;
      setError(null);
      setStreaming(true);
      try {
        await sendDirective(runId, text, { onEvent: applyEvent });
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to send directive");
      } finally {
        setStreaming(false);
        await refetch();
      }
    },
    [runId, applyEvent, refetch, setError, setStreaming],
  );

  // View the docs of a specific feature without resuming it (local-only).
  const setActiveFeature = useCallback((slug: string | null) => {
    featureOverrideRef.current = slug;
    setFeatureOverride(slug);
    void refetch();
  }, [refetch]);

  const runFeatureDirective = useCallback(
    async (fn: (onEvent: (e: RunEvent) => void) => Promise<void>) => {
      if (!runId) return;
      setError(null);
      setStreaming(true);
      try {
        await fn(applyEvent);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed");
      } finally {
        setStreaming(false);
        await refetch();
      }
    },
    [runId, applyEvent, refetch, setError, setStreaming],
  );

  const createFeature = useCallback(
    (title: string, description?: string) =>
      runFeatureDirective((onEvent) => createFeatureReq(runId!, { title, description }, { onEvent })),
    [runId, runFeatureDirective],
  );

  const switchFeature = useCallback(
    (slug: string) => {
      // Resume an existing feature: clear the local override so we follow the
      // orchestrator's active_feature once it updates.
      featureOverrideRef.current = null;
      setFeatureOverride(null);
      return runFeatureDirective((onEvent) => switchFeatureReq(runId!, slug, { onEvent }));
    },
    [runId, runFeatureDirective],
  );

  const liveFeature = state?.active_feature ?? null;
  const activeFeature = featureOverride ?? liveFeature;
  return {
    lanes, state, qna, design, epics,
    phase: state?.phase ?? null,
    features: state?.features ?? [],
    activeFeature, liveFeature,
    streaming, error, submitAnswers, directive,
    setActiveFeature, createFeature, switchFeature, refetch,
  };
}
