// useAgentRun — the generic glass-box run hook for any swarm tool. Projects the
// run's SSE/transcript events into per-agent lanes (via the shared useRunLanes
// engine), fetches qna.json (the universal clarification channel) + the run's
// artifacts, and drives resume turns (directives + answers) via /message.
// Brainstorm/Workspace keep their bespoke hooks; this one powers the generic
// SwarmToolRun screen (Brand Maker + future).

import { useCallback, useState } from "react";
import {
  sendRunMessage,
  getArtifacts,
  artifactRawUrl,
  type ArtifactFile,
} from "@/lib/labs/toolsClient";
import type { QnADoc } from "@/lib/brainstorm/brainstormClient";
import type { AgentLane, LaneRole } from "./agentRun";
import { useRunLanes, type MainLane } from "./useRunLanes";

export type { MainLane };

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
  const [qna, setQna] = useState<QnADoc | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactFile[]>([]);

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

  const { lanes, streaming, setStreaming, error, setError, applyEvent } = useRunLanes(runId, {
    roles,
    mainLane,
    streamLive,
    toolId,
    refetch,
  });

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
    [runId, applyEvent, refetch, setError, setStreaming],
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

  return {
    lanes, qna, artifacts, streaming, error,
    submitAnswers, directive: runMessage, refetch, rawUrl, fetchText,
  };
}
