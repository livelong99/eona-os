// useAgentRun — the generic glass-box run hook for any swarm tool. Projects the
// run's SSE/transcript events into per-agent lanes, fetches qna.json (the
// universal clarification channel) + the run's artifacts, and drives resume turns
// (directives + answers) via /message. Brainstorm/Workspace keep their bespoke
// hooks; this one powers the generic SwarmToolRun screen (Brand Maker + future).

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  streamRun,
  sendRunMessage,
  getArtifacts,
  artifactRawUrl,
  isStreamNotLive,
  type RunEvent,
  type ArtifactFile,
} from "@/lib/labs/toolsClient";
import type { QnADoc } from "@/lib/brainstorm/brainstormClient";
import { type AgentLane, type LaneRole, inferRole } from "./agentRun";

const API_BASE = "/api/hermes";

export interface MainLane {
  id: string;
  label: string;
  role: string;
}

interface Options {
  roles: LaneRole[];
  mainLane: MainLane;
  streamLive?: boolean;
}

interface Result {
  lanes: AgentLane[];
  qna: QnADoc | null;
  artifacts: ArtifactFile[];
  streaming: boolean;
  error: string | null;
  submitAnswers: (answers: Record<string, string>) => Promise<void>;
  directive: (text: string) => Promise<void>;
  refetch: () => Promise<void>;
  rawUrl: (relpath: string) => string;
  fetchText: (relpath: string) => Promise<string | null>;
}

function bust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`;
}

export function useAgentRun(
  toolId: string,
  runId: string | null,
  { roles, mainLane, streamLive = true }: Options,
): Result {
  const lanesRef = useRef<Map<string, AgentLane>>(new Map());
  const taskLabels = useRef<Map<string, string>>(new Map());
  const tidToLane = useRef<Map<string, string>>(new Map());
  const [, force] = useReducer((x: number) => x + 1, 0);

  const [qna, setQna] = useState<QnADoc | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactFile[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const laneKeyFor = useCallback(
    (label: string, fallback: string) => inferRole(label, roles)?.key ?? fallback,
    [roles],
  );

  const ensureLane = useCallback(
    (id: string, label?: string): AgentLane => {
      const map = lanesRef.current;
      let lane = map.get(id);
      if (!lane) {
        const isMain = id === mainLane.id;
        const text = isMain ? mainLane.label : label || "Specialist";
        const role = isMain ? undefined : inferRole(text, roles);
        lane = {
          id,
          label: isMain ? mainLane.label : role?.label ?? text,
          role: isMain ? mainLane.role : "Specialist",
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
    },
    [mainLane, roles],
  );

  const rawUrl = useCallback(
    (relpath: string) => artifactRawUrl(toolId, runId ?? "", relpath),
    [toolId, runId],
  );

  const fetchText = useCallback(
    async (relpath: string): Promise<string | null> => {
      if (!runId) return null;
      const res = await fetch(bust(artifactRawUrl(toolId, runId, relpath)), { cache: "no-store" });
      if (!res.ok) return null;
      return res.text();
    },
    [toolId, runId],
  );

  const refetch = useCallback(async () => {
    if (!runId) return;
    try {
      const files = await getArtifacts(toolId, runId);
      setArtifacts(files);
      // qna.json is the universal clarification channel — fetch it if present.
      if (files.some((f) => f.relpath === "qna.json" || f.name === "qna.json")) {
        const res = await fetch(bust(artifactRawUrl(toolId, runId, "qna.json")), { cache: "no-store" });
        if (res.ok) {
          try {
            setQna((await res.json()) as QnADoc);
          } catch {
            /* ignore malformed */
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load run artifacts");
    }
  }, [toolId, runId]);

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

      const laneId = ev.parent_tool_use_id || mainLane.id;
      const isSpawn = ev.tool === "Agent" || ev.tool === "Task";
      if (kind === "tool.started" && isSpawn && typeof ev.tid === "string") {
        const preview = ev.preview ?? "";
        if (preview) taskLabels.current.set(ev.tid, preview);
        const key = laneKeyFor(preview, ev.tid);
        tidToLane.current.set(ev.tid, key);
        const main = ensureLane(mainLane.id);
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
        if (typeof ev.result === "string" && ev.result.trim() && !lane.response) lane.response = ev.result;
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
    [ensureLane, laneKeyFor, mainLane.id, refetch],
  );

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const controller = new AbortController();
    // Reset lane state when the run changes so a relaunch doesn't show ghost
    // lanes/events from the previous run.
    lanesRef.current = new Map();
    taskLabels.current = new Map();
    tidToLane.current = new Map();
    ensureLane(mainLane.id);
    force();
    void refetch();

    if (streamLive) {
      setStreaming(true);
      streamRun(runId, { onEvent: applyEvent, signal: controller.signal })
        .catch((e) => {
          if (cancelled) return;
          if (!isStreamNotLive(e)) setError(e instanceof Error ? e.message : "stream failed");
        })
        .finally(() => !cancelled && setStreaming(false));
    } else {
      // Replay a settled run's transcript so the lanes populate on reload.
      fetch(`${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/runs/${encodeURIComponent(runId)}/transcript`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : { events: [] }))
        .then((d: { events?: RunEvent[] }) => {
          if (cancelled) return;
          for (const ev of d.events ?? []) applyEvent(ev);
          force();
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runId, streamLive, applyEvent, ensureLane, mainLane.id, refetch, toolId]);

  useEffect(() => {
    if (!runId || !streaming) return;
    // Pause polling while the tab is hidden (the live SSE stream still delivers
    // events; this only stops redundant artifact polls on a backgrounded tab).
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refetch();
    }, 2500);
    return () => clearInterval(id);
  }, [runId, streaming, refetch]);

  const runMessage = useCallback(
    async (text: string) => {
      if (!runId) return;
      setError(null);
      setStreaming(true);
      try {
        await sendRunMessage(runId, text, { onEvent: applyEvent });
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to send");
      } finally {
        setStreaming(false);
        await refetch();
      }
    },
    [runId, applyEvent, refetch],
  );

  const submitAnswers = useCallback(
    async (answers: Record<string, string>) => {
      const filled = Object.fromEntries(
        Object.entries(answers).map(([id, v]) => [id, (v ?? "").trim()] as const).filter(([, v]) => v.length > 0),
      );
      await runMessage(
        "The user answered the open clarifying questions. Update qna.json (mark them answered) " +
          "and continue the current stage per your step-gate.\n\nANSWERS (JSON): " +
          JSON.stringify(filled),
      );
    },
    [runMessage],
  );

  const lanes = Array.from(lanesRef.current.values());
  return {
    lanes, qna, artifacts, streaming, error,
    submitAnswers, directive: runMessage, refetch, rawUrl, fetchText,
  };
}
