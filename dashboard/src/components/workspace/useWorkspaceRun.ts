// useWorkspaceRun — drives one workspace orchestrator run. Mirrors useBrainstormRun
// (same SSE/transcript lane mechanism, reusing the AgentLane type + ExecutionConsole)
// but with the workspace team roster and workspace.json phase state.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { AgentLane } from "@/components/brainstorm/useBrainstormRun";
import type { QnADoc } from "@/lib/brainstorm/brainstormClient";
import {
  streamRun,
  fetchTranscript,
  fetchWorkspaceState,
  fetchWorkspaceQna,
  fetchDesign,
  fetchEpics,
  sendAnswers,
  sendDirective,
  createFeature as createFeatureReq,
  switchFeature as switchFeatureReq,
  isStreamNotLive,
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
export const WORKSPACE_ROLES: { key: string; label: string; match: RegExp }[] = [
  { key: "pm", label: "PM", match: /\bpm\b|product manager|\bproduct\b/i },
  { key: "ux", label: "UX Designer", match: /\bux\b|ux.?design|user experience/i },
  { key: "frontend", label: "Frontend Dev", match: /front.?end|\bui\b/i },
  { key: "backend", label: "Backend Dev", match: /back.?end|\bapi\b|server/i },
  { key: "analyst", label: "Analyst", match: /analyst|analysis/i },
  { key: "researcher", label: "Researcher", match: /research/i },
  { key: "test", label: "Test Architect", match: /test|\bqa\b/i },
  { key: "review", label: "Code Reviewer", match: /review/i },
];

function inferRole(text: string): { key: string; label: string } | undefined {
  for (const r of WORKSPACE_ROLES) if (r.match.test(text)) return { key: r.key, label: r.label };
  return undefined;
}

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
  const lanesRef = useRef<Map<string, AgentLane>>(new Map());
  const taskLabels = useRef<Map<string, string>>(new Map());
  const tidToLane = useRef<Map<string, string>>(new Map());
  const [, force] = useReducer((x: number) => x + 1, 0);

  const [state, setState] = useState<WorkspaceState | null>(null);
  const [qna, setQna] = useState<QnADoc | null>(null);
  const [design, setDesign] = useState<string | null>(null);
  const [epics, setEpics] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Feature being VIEWED (override). null → follow workspace.json.active_feature.
  const [featureOverride, setFeatureOverride] = useState<string | null>(null);
  const featureOverrideRef = useRef<string | null>(null);

  const ensureLane = useCallback((id: string, label?: string): AgentLane => {
    const map = lanesRef.current;
    let lane = map.get(id);
    if (!lane) {
      const isMain = id === MAIN_LANE_ID;
      const text = isMain ? MAIN_LABEL : label || "Specialist";
      const role = isMain ? undefined : inferRole(text);
      lane = {
        id,
        label: isMain ? MAIN_LABEL : role?.label ?? text,
        role: isMain ? MAIN_ROLE : "Specialist",
        metric: role?.key,
        status: "thinking",
        thinking: "",
        response: "",
        activity: [],
        active: true,
      };
      map.set(id, lane);
    }
    return lane;
  }, []);

  const laneKeyFor = useCallback((label: string, fallback: string): string => {
    return inferRole(label)?.key ?? fallback;
  }, []);

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
      setError(e instanceof Error ? e.message : "failed to load workspace state");
    }
  }, [runId]);

  const applyEvent = useCallback(
    (ev: RunEvent) => {
      const kind = ev.event || ev.type;

      if (ev.subagent) {
        const label = typeof ev.lane_label === "string" ? ev.lane_label : "";
        const fallback = typeof ev.lane_id === "string" ? ev.lane_id : "specialist";
        const lane = ensureLane(laneKeyFor(label, fallback), label || fallback);
        lane.active = true;
        if (kind === "reasoning.available" && typeof ev.text === "string") {
          lane.thinking += ev.text;
          lane.status = "thinking";
        } else if (kind === "message.delta" && typeof ev.delta === "string") {
          lane.response += ev.delta;
          lane.status = "writing";
        } else if (kind === "tool.started" && ev.tool && ev.tool !== "trace") {
          lane.activity = [...lane.activity, ev.preview || ev.tool];
          lane.status = "writing";
        }
        force();
        return;
      }

      const laneId = ev.parent_tool_use_id || MAIN_LANE_ID;
      const isSpawn = ev.tool === "Agent" || ev.tool === "Task";
      if (kind === "tool.started" && isSpawn && typeof ev.tid === "string") {
        const preview = ev.preview ?? "";
        if (preview) taskLabels.current.set(ev.tid, preview);
        const key = laneKeyFor(preview, ev.tid);
        tidToLane.current.set(ev.tid, key);
        const main = ensureLane(MAIN_LANE_ID);
        main.activity = [...main.activity, `▶ spawn ${preview || "specialist"}`];
        const lane = ensureLane(key, preview);
        lane.active = true;
        lane.status = "thinking";
        force();
        return;
      }
      if (kind === "tool.completed" && isSpawn && typeof ev.tid === "string") {
        const key = tidToLane.current.get(ev.tid) ?? ev.tid;
        const lane = ensureLane(key, taskLabels.current.get(ev.tid) || "");
        if (typeof ev.result === "string" && ev.result.trim() && !lane.response) {
          lane.response = ev.result;
        }
        lane.status = "done";
        lane.active = false;
        force();
        return;
      }
      if (kind === "reasoning.available" && typeof ev.text === "string") {
        const lane = ensureLane(laneId);
        lane.thinking += ev.text;
        lane.status = "thinking";
        force();
        return;
      }
      if (kind === "message.delta" && typeof ev.delta === "string") {
        const lane = ensureLane(laneId);
        lane.response += ev.delta;
        lane.status = "writing";
        force();
        return;
      }
      if (kind === "tool.started" && ev.tool && ev.tool !== "trace") {
        const lane = ensureLane(laneId);
        lane.activity = [...lane.activity, ev.preview || ev.tool];
        lane.status = "writing";
        force();
        return;
      }
      if (kind === "run.completed" || kind === "run.failed" || kind === "run.cancelled") {
        if (kind === "run.failed" && typeof ev.error === "string") setError(ev.error);
        for (const lane of lanesRef.current.values()) {
          lane.active = false;
          if (lane.status !== "done") lane.status = "idle";
        }
        setStreaming(false);
        force();
        void refetch();
        return;
      }
    },
    [ensureLane, laneKeyFor, refetch],
  );

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const controller = new AbortController();
    ensureLane(MAIN_LANE_ID);
    force();
    void refetch();

    if (streamLive) {
      setStreaming(true);
      streamRun(runId, { onEvent: applyEvent, signal: controller.signal })
        .catch((e) => {
          if (cancelled) return;
          if (!isStreamNotLive(e)) setError(e instanceof Error ? e.message : "stream failed");
        })
        .finally(() => {
          if (!cancelled) setStreaming(false);
        });
    } else {
      fetchTranscript(runId, controller.signal)
        .then((events) => {
          if (cancelled) return;
          for (const ev of events) applyEvent(ev);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runId, streamLive, applyEvent, ensureLane, refetch]);

  useEffect(() => {
    if (!runId || !streaming) return;
    const id = setInterval(() => void refetch(), 2500);
    return () => clearInterval(id);
  }, [runId, streaming, refetch]);

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
    [runId, applyEvent, refetch],
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
    [runId, applyEvent, refetch],
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
    [runId, applyEvent, refetch],
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
  const lanes = Array.from(lanesRef.current.values());
  return {
    lanes, state, qna, design, epics,
    phase: state?.phase ?? null,
    features: state?.features ?? [],
    activeFeature, liveFeature,
    streaming, error, submitAnswers, directive,
    setActiveFeature, createFeature, switchFeature, refetch,
  };
}
