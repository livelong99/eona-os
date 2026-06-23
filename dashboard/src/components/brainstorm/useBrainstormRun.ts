// useBrainstormRun — drives one brainstorm run: subscribes to the SSE stream,
// splits every event into the per-agent lane that produced it (the PM
// orchestrator + each spawned specialist), and re-fetches the qna.json /
// readiness.json / prd.md artifacts whenever a turn settles.
//
// Adapted from components/labs/run/useRunStages.ts, but lane-oriented (glass-box
// execution) rather than step-oriented, since the brainstorm UI shows the whole
// swarm running, not a linear stepper.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  streamRun,
  sendAnswers,
  fetchQna,
  fetchReadiness,
  fetchPrd,
  fetchTranscript,
  isStreamNotLive,
  type RunEvent,
  type QnADoc,
  type ReadinessDoc,
  type BrainstormPhase,
} from "@/lib/brainstorm/brainstormClient";

// Lane types now live in the shared toolkit (single source of truth); re-exported
// here so existing `@/components/brainstorm/useBrainstormRun` imports keep working.
import type { AgentLane, LaneStatus } from "@/components/toolkit/agentRun";
export type { AgentLane, LaneStatus };

const PM_LANE_ID = "pm";
const PM_LABEL = "Sage";
const PM_ROLE = "PM · Orchestrator";

const METRICS: { key: string; label: string; match: RegExp }[] = [
  { key: "creativity", label: "Creativity", match: /creativ|idea/i },
  { key: "feasibility", label: "Feasibility", match: /feasib|tech/i },
  { key: "reliability", label: "Reliability", match: /reliab|risk/i },
  { key: "roadmap", label: "Roadmap", match: /roadmap|phasing|sequenc/i },
];

function inferMetric(text: string): { key: string; label: string } | undefined {
  for (const m of METRICS) if (m.match.test(text)) return { key: m.key, label: m.label };
  return undefined;
}

interface UseBrainstormRunResult {
  lanes: AgentLane[];
  qna: QnADoc | null;
  readiness: ReadinessDoc | null;
  prd: string | null;
  phase: BrainstormPhase;
  streaming: boolean;
  error: string | null;
  /** Submit answers for the open questions; streams the PM's reply into lanes. */
  submitAnswers: (answers: Record<string, string>) => Promise<void>;
  /** Re-pull the artifacts (qna/readiness/prd) on demand. */
  refetch: () => Promise<void>;
}

interface Options {
  /** Open the live /events stream. False for a completed/read-only run. */
  streamLive?: boolean;
}

export function useBrainstormRun(
  runId: string | null,
  { streamLive = true }: Options = {},
): UseBrainstormRunResult {
  // Lanes accumulate in a ref (delta events are frequent); a tick forces render.
  const lanesRef = useRef<Map<string, AgentLane>>(new Map());
  const taskLabels = useRef<Map<string, string>>(new Map()); // tid → Agent description
  const tidToLane = useRef<Map<string, string>>(new Map()); // Agent tid → lane key
  const [, force] = useReducer((x: number) => x + 1, 0);

  const [qna, setQna] = useState<QnADoc | null>(null);
  const [readiness, setReadiness] = useState<ReadinessDoc | null>(null);
  const [prd, setPrd] = useState<string | null>(null);
  const [phase, setPhase] = useState<BrainstormPhase>("clarifying");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure a lane exists. Specialist lanes are keyed by metric when inferable so
  // the Agent spawn, the spawn's final result, and the live transcript events all
  // land in ONE lane; otherwise keyed by the raw id (tid / transcript file id).
  const ensureLane = useCallback((id: string, displayLabel?: string): AgentLane => {
    const map = lanesRef.current;
    let lane = map.get(id);
    if (!lane) {
      const isPm = id === PM_LANE_ID;
      const label = isPm ? PM_LABEL : displayLabel || "Specialist";
      const metric = isPm ? undefined : inferMetric(label);
      lane = {
        id,
        label: metric?.label ?? label,
        role: isPm ? PM_ROLE : "Specialist",
        metric: metric?.key,
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

  // Stable lane key for a specialist: the metric (so spawn + transcript merge),
  // else the provided fallback id.
  const laneKeyFor = useCallback((label: string, fallback: string): string => {
    return inferMetric(label)?.key ?? fallback;
  }, []);

  const refetch = useCallback(async () => {
    if (!runId) return;
    try {
      const [q, r, p] = await Promise.all([
        fetchQna(runId),
        fetchReadiness(runId),
        fetchPrd(runId),
      ]);
      if (q) {
        setQna(q);
        if (q.phase) setPhase(q.phase);
      }
      if (r) setReadiness(r);
      if (p) setPrd(p);
    } catch (e) {
      // Artifact fetch is best-effort; surface but don't crash the stream.
      setError(e instanceof Error ? e.message : "failed to load artifacts");
    }
  }, [runId]);

  const applyEvent = useCallback(
    (ev: RunEvent) => {
      const kind = ev.event || ev.type;

      // Live sub-agent transcript events (tailed from the specialist's JSONL).
      // Tagged subagent:true with a lane_label (its brief) so we group them into
      // the same metric lane as the Agent spawn.
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

      const laneId = ev.parent_tool_use_id || PM_LANE_ID;

      // A sub-agent spawn (tool "Agent" in current CLIs, "Task" historically).
      // Create the specialist's lane (keyed by metric so it merges with the live
      // transcript lane), and fill its final output from the result on completion.
      const isSpawn = ev.tool === "Agent" || ev.tool === "Task";
      if (kind === "tool.started" && isSpawn && typeof ev.tid === "string") {
        const preview = ev.preview ?? "";
        if (preview) taskLabels.current.set(ev.tid, preview);
        const key = laneKeyFor(preview, ev.tid);
        tidToLane.current.set(ev.tid, key);
        const pm = ensureLane(PM_LANE_ID);
        pm.activity = [...pm.activity, `▶ spawn ${preview || "specialist"}`];
        const lane = ensureLane(key, preview); // visible specialist lane from spawn
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

      if (kind === "subagent.started") {
        const lane = ensureLane(ev.span_id || laneId);
        lane.active = true;
        lane.status = "thinking";
        force();
        return;
      }
      if (kind === "subagent.completed") {
        const lane = lanesRef.current.get(ev.span_id || laneId);
        if (lane) {
          lane.active = false;
          lane.status = "done";
        }
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
        // Mark all lanes settled.
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
    [ensureLane, refetch],
  );

  // Initial load + live subscription.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const controller = new AbortController();

    // Seed the PM lane so the orchestrator always shows, even before its first token.
    ensureLane(PM_LANE_ID);
    force();

    // Always pull artifacts once (covers resumed / already-complete runs).
    void refetch();

    if (streamLive) {
      setStreaming(true);
      streamRun(runId, { onEvent: applyEvent, signal: controller.signal })
        .catch((e) => {
          if (cancelled) return;
          // 404 = not live; not an error (resumed/finished run).
          if (!isStreamNotLive(e)) {
            setError(e instanceof Error ? e.message : "stream failed");
          }
        })
        .finally(() => {
          if (!cancelled) setStreaming(false);
        });
    } else {
      // Not live (refresh / reopened completed run): the event stream has no
      // replay, so rebuild the agent logs from the persisted transcripts.
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

  // While a turn is in flight the artifacts (qna/readiness/prd) are rewritten in
  // place; poll so updates surface live, not only when the turn settles.
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

  // PM lane first, then specialists in spawn order (Map preserves insertion).
  const lanes = Array.from(lanesRef.current.values());

  return { lanes, qna, readiness, prd, phase, streaming, error, submitAnswers, refetch };
}
