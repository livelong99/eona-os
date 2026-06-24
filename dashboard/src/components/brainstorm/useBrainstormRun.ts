// useBrainstormRun — drives one brainstorm run: projects the SSE/transcript
// events into per-agent lanes (via the shared useRunLanes engine — the PM
// orchestrator + each spawned specialist) and re-fetches the qna.json /
// readiness.json / prd.md artifacts whenever a turn settles.
//
// The lane projection itself lives in toolkit/useRunLanes (shared with Workspace
// and the generic SwarmToolRun); this hook supplies brainstorm's metric roster,
// the PM main lane, and the brainstorm-specific artifact refetch.

import { useCallback, useRef, useState } from "react";
import {
  sendAnswers,
  sendPrdFeedback,
  fetchQna,
  fetchReadiness,
  fetchPrd,
  BRAINSTORM_TOOL_ID,
  type QnADoc,
  type ReadinessDoc,
  type BrainstormPhase,
} from "@/lib/brainstorm/brainstormClient";

import type { LaneRole } from "@/components/toolkit/agentRun";
import { useRunLanes } from "@/components/toolkit/useRunLanes";

// Lane types now live in the shared toolkit (single source of truth); re-exported
// here so existing `@/components/brainstorm/useBrainstormRun` imports keep working.
import type { AgentLane, LaneStatus } from "@/components/toolkit/agentRun";
export type { AgentLane, LaneStatus };

const PM_LANE_ID = "pm";
const PM_LABEL = "Sage";
const PM_ROLE = "PM · Orchestrator";

// Brainstorm's specialist roster. The metric key keeps a spawn + its live
// transcript merged into one lane (see useRunLanes.laneKeyFor).
const METRICS: LaneRole[] = [
  { key: "creativity", label: "Creativity", match: /creativ|idea/i },
  { key: "feasibility", label: "Feasibility", match: /feasib|tech/i },
  { key: "reliability", label: "Reliability", match: /reliab|risk/i },
  { key: "roadmap", label: "Roadmap", match: /roadmap|phasing|sequenc/i },
];

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
  /** Send free-form feedback on the drafted PRD; the PM revises prd.md. */
  reviseDraft: (feedback: string) => Promise<void>;
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
  const [qna, setQna] = useState<QnADoc | null>(null);
  const [readiness, setReadiness] = useState<ReadinessDoc | null>(null);
  const [prd, setPrd] = useState<string | null>(null);
  const [phase, setPhase] = useState<BrainstormPhase>("clarifying");
  // setError is wired up after useRunLanes; the ref lets refetch close over it.
  const setErrorRef = useRef<(e: string | null) => void>(() => {});

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
      setErrorRef.current(e instanceof Error ? e.message : "failed to load artifacts");
    }
  }, [runId]);

  const { lanes, streaming, setStreaming, error, setError, applyEvent } = useRunLanes(runId, {
    roles: METRICS,
    mainLane: { id: PM_LANE_ID, label: PM_LABEL, role: PM_ROLE },
    streamLive,
    toolId: BRAINSTORM_TOOL_ID,
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

  const reviseDraft = useCallback(
    async (feedback: string) => {
      if (!runId || !feedback.trim()) return;
      setError(null);
      setStreaming(true);
      try {
        await sendPrdFeedback(runId, feedback, { onEvent: applyEvent });
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to send feedback");
      } finally {
        setStreaming(false);
        await refetch();
      }
    },
    [runId, applyEvent, refetch, setError, setStreaming],
  );

  return { lanes, qna, readiness, prd, phase, streaming, error, submitAnswers, reviseDraft, refetch };
}
