// useRunLanes — the shared lane engine behind every glass-box run hook
// (Brainstorm, Workspace, and the generic Agent/SwarmToolRun). It owns the lane
// refs/maps, the event-routing switch that projects a run's SSE/transcript
// events into per-agent lanes, the live-stream-vs-transcript-replay effect (with
// the lane-map reset on runId change), and the visibility-paused artifact poll.
//
// Each tool supplies only what differs: its specialist `roles` roster, its
// `mainLane` (id/label/role), and its own `refetch` (which fetches that tool's
// artifacts and is called on settle + poll). The lane projection itself is
// identical across tools, so it lives here as the single source of truth.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  streamRun,
  isStreamNotLive,
  type RunEvent,
} from "@/lib/labs/toolsClient";
import { type AgentLane, type LaneRole, inferRole } from "./agentRun";

const API_BASE = "/api/hermes";

/** The orchestrator lane: the always-present main agent (PM / Architect / etc). */
export interface MainLane {
  id: string;
  label: string;
  role: string;
}

interface Options {
  roles: LaneRole[];
  mainLane: MainLane;
  /** Open the live /events stream. False for a completed/read-only run. */
  streamLive?: boolean;
  /** Tool id — used to fetch the persisted transcript on a non-live (reopened) run. */
  toolId: string;
  /** Re-pull this tool's artifacts; called on settle and on the visibility poll. */
  refetch: () => Promise<void> | void;
}

interface Result {
  lanes: AgentLane[];
  streaming: boolean;
  setStreaming: (streaming: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  /** Force a re-render after a mutable-ref lane update (used by resume turns). */
  force: () => void;
  /** Project one run event into the lanes (also used by resume turns). */
  applyEvent: (ev: RunEvent) => void;
}

export function useRunLanes(
  runId: string | null,
  { roles, mainLane, streamLive = true, toolId, refetch }: Options,
): Result {
  // Lanes accumulate in a ref (delta events are frequent); a tick forces render.
  const lanesRef = useRef<Map<string, AgentLane>>(new Map());
  const taskLabels = useRef<Map<string, string>>(new Map()); // tid → Agent description
  const tidToLane = useRef<Map<string, string>>(new Map()); // Agent tid → lane key
  // True once the run reached a terminal event — stops the reconnect loop.
  const terminalRef = useRef(false);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  const force = useCallback(() => forceTick(), []);

  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure a lane exists. Specialist lanes are keyed by role when inferable so
  // the Agent spawn, the spawn's final result, and the live transcript events all
  // land in ONE lane; otherwise keyed by the raw id (tid / transcript file id).
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

  // Stable lane key for a specialist: the role (so spawn + transcript merge),
  // else the provided fallback id.
  const laneKeyFor = useCallback(
    (label: string, fallback: string): string => inferRole(label, roles)?.key ?? fallback,
    [roles],
  );

  const applyEvent = useCallback(
    (ev: RunEvent) => {
      const kind = ev.event || ev.type;

      // Live sub-agent transcript events (tailed from the specialist's JSONL).
      // Tagged subagent:true with a lane_label (its brief) so we group them into
      // the same role lane as the Agent spawn.
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

      // A sub-agent spawn (tool "Agent" in current CLIs, "Task" historically).
      // Create the specialist's lane (keyed by role so it merges with the live
      // transcript lane), and fill its final output from the result on completion.
      const isSpawn = ev.tool === "Agent" || ev.tool === "Task";
      if (kind === "tool.started" && isSpawn && typeof ev.tid === "string") {
        const preview = ev.preview ?? "";
        if (preview) taskLabels.current.set(ev.tid, preview);
        const key = laneKeyFor(preview, ev.tid);
        tidToLane.current.set(ev.tid, key);
        const main = ensureLane(mainLane.id);
        main.activity = [...main.activity, `▶ spawn ${preview || "specialist"}`];
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
        terminalRef.current = true; // run is done — don't reconnect
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
    [ensureLane, laneKeyFor, mainLane.id, refetch, force],
  );

  // Initial load + live subscription.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const controller = new AbortController();

    // Reset lane state when the run changes so a relaunch doesn't show ghost
    // lanes/events from the previous run.
    lanesRef.current = new Map();
    taskLabels.current = new Map();
    tidToLane.current = new Map();
    terminalRef.current = false;
    // Seed the main lane so the orchestrator always shows, even before its first token.
    ensureLane(mainLane.id);
    force();

    // Always pull artifacts once (covers resumed / already-complete runs).
    void refetch();

    if (streamLive) {
      setStreaming(true);
      // Reconnect loop: the engine keeps the run's event queue alive across a
      // client disconnect, so a dropped connection (wifi blip, tab sleep, proxy
      // idle-timeout) can re-subscribe to GET /events and resume the live run
      // instead of dropping to read-only. A clean close = the run reached
      // terminal; a 404 = the run isn't live; any other error = retry w/ backoff.
      void (async () => {
        let attempts = 0;
        while (!cancelled && !terminalRef.current) {
          try {
            await streamRun(runId, { onEvent: applyEvent, signal: controller.signal });
            break; // server closed the stream cleanly → run is done
          } catch (e) {
            if (cancelled) return;
            if (isStreamNotLive(e)) break; // not live (resumed/finished run)
            if (terminalRef.current) break;
            attempts += 1;
            if (attempts > 5) {
              setError("Live stream lost — reconnect failed. Reload to resume.");
              break;
            }
            await new Promise((r) => setTimeout(r, Math.min(1000 * attempts, 5000)));
            // loop → reconnect to /events (the engine still holds the queue)
          }
        }
        if (!cancelled) setStreaming(false);
      })();
    } else {
      // Not live (refresh / reopened completed run): the event stream has no
      // replay, so rebuild the agent lanes from the persisted transcripts.
      fetch(
        `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/runs/${encodeURIComponent(runId)}/transcript`,
        { signal: controller.signal, cache: "no-store" },
      )
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
  }, [runId, streamLive, applyEvent, ensureLane, mainLane.id, refetch, toolId, force]);

  // While a turn is in flight the artifacts are rewritten in place; poll so
  // updates surface live, not only when the turn settles. Pause while the tab is
  // hidden (the live SSE stream still delivers events; this only stops redundant
  // artifact polls on a backgrounded tab).
  useEffect(() => {
    if (!runId || !streaming) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refetch();
    }, 2500);
    return () => clearInterval(id);
  }, [runId, streaming, refetch]);

  const lanes = Array.from(lanesRef.current.values());
  return { lanes, streaming, setStreaming, error, setError, force, applyEvent };
}
