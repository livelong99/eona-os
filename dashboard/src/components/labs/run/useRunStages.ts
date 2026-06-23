import { useCallback, useEffect, useRef, useState } from "react";
import {
  streamRun,
  sendRunMessage,
  isStreamNotLive,
  type RunEvent,
} from "@/lib/labs/toolsClient";
import {
  deltaText,
  reasoningText,
  toolActivity,
  terminalState,
  terminalText,
  looksLikeError,
} from "@/components/labs/workbenchText";

// One agent turn within a step's transcript. User turns carry just the typed
// text; assistant turns fold the run-event protocol (reply prose + a muted
// reasoning/activity aside) the same way StageChat does.
export interface RunTurn {
  id: string;
  role: "user" | "assistant";
  /** Streamed reply prose (message.delta chunks). */
  content: string;
  /** True while the assistant turn is still streaming. */
  streaming?: boolean;
  /** Friendly tool-activity labels (tool.started/completed, trace filtered). */
  activity?: string[];
  /** The agent's reasoning text (reasoning.available), shown muted/aside. */
  reasoning?: string;
  /** The most recent live status line, shown before prose arrives. */
  latest?: string;
}

// Drives the gated step machine for a Brand Maker run. One agent session
// (runId) backs every step; this hook keeps a separate transcript per step and
// routes incoming stream output to whichever step is currently streaming.
//
//   - On mount: subscribe to streamRun(runId) once → its output is step 0's
//     opening turn.
//   - improve(stepIndex, text): post feedback, append the reply to THAT step.
//   - looksGood(fromIndex, instruction): post an advance instruction, stream the
//     reply into the NEXT step, and advance the active step to it.
//
// On a deep-link resume the live event stream has no replay, so the caller seeds
// durable state instead of opening a fresh stream:
//   - `seedTurnsByStep` rebuilds transcripts from session history,
//   - `initialActiveStep` places the user at the latest stage with output,
//   - `resume: true` reconnects streamRun for FUTURE (in-flight) events only —
//     incoming live output appends to `initialActiveStep`.
export interface ResumeOptions {
  resume: boolean;
  seedTurnsByStep?: Record<number, RunTurn[]>;
  initialActiveStep?: number;
  // Whether to open the live event stream at all. A fresh launch is always live;
  // a resumed run is live only when the engine still has an active stream (see
  // useResumeRun). When false we skip streamRun entirely — the screen is rebuilt
  // read-only from seeded history + artifacts, and NO /events call is made.
  // Defaults to true so fresh launches stream unchanged.
  streamLive?: boolean;
}

// Returns immutable snapshots — callers render `turns[stepIndex]`.
export function useRunStages(runId: string, stepCount: number, opts?: ResumeOptions) {
  const [turnsByStep, setTurnsByStep] = useState<Record<number, RunTurn[]>>(
    opts?.seedTurnsByStep ?? {},
  );
  const [activeStep, setActiveStep] = useState(opts?.initialActiveStep ?? 0);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stash resume config in a ref so the mount effect (which depends only on
  // runId) reads the latest without re-subscribing.
  const resumeRef = useRef(opts);
  resumeRef.current = opts;

  // The step whose transcript live events are currently appended to.
  const targetStepRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Guards the once-per-run opening subscription against re-mounts.
  const openedRef = useRef<string | null>(null);

  const appendTurn = useCallback((stepIndex: number, turn: RunTurn) => {
    setTurnsByStep((prev) => ({
      ...prev,
      [stepIndex]: [...(prev[stepIndex] ?? []), turn],
    }));
  }, []);

  const patchTurn = useCallback(
    (stepIndex: number, turnId: string, patch: (t: RunTurn) => RunTurn) => {
      setTurnsByStep((prev) => ({
        ...prev,
        [stepIndex]: (prev[stepIndex] ?? []).map((t) =>
          t.id === turnId ? patch(t) : t,
        ),
      }));
    },
    [],
  );

  // Folds the run-event protocol into the assistant turn at (stepIndex, turnId).
  const handlerFor = useCallback(
    (stepIndex: number, turnId: string) => (event: RunEvent) => {
      const term = terminalState(event);
      if (term === "failed" || term === "cancelled") {
        setError(terminalText(event) || "The run ended unexpectedly.");
        return;
      }

      const delta = deltaText(event);
      if (delta) {
        patchTurn(stepIndex, turnId, (t) => ({
          ...t,
          content: t.content + delta,
          latest: undefined,
        }));
        return;
      }

      const reasoning = reasoningText(event);
      if (reasoning) {
        patchTurn(stepIndex, turnId, (t) => ({
          ...t,
          reasoning: (t.reasoning ?? "") + reasoning,
          latest: "Thinking…",
        }));
        return;
      }

      const activity = toolActivity(event);
      if (activity) {
        patchTurn(stepIndex, turnId, (t) => ({
          ...t,
          activity: [...(t.activity ?? []), activity],
          latest: activity,
        }));
        return;
      }

      if (term === "done") {
        const out = terminalText(event);
        if (out && looksLikeError(out)) {
          setError(out);
          return;
        }
        if (out) {
          patchTurn(stepIndex, turnId, (t) =>
            t.content ? t : { ...t, content: out, latest: undefined },
          );
        }
      }
    },
    [patchTurn],
  );

  // Open the run's event stream once. Fresh launch: the stream is step 0's
  // opening turn. Resume: state is already seeded from durable sources, so we
  // reconnect only to catch FUTURE (in-flight) events, appended to the resumed
  // active step as a fresh assistant turn.
  useEffect(() => {
    // Open exactly once per runId — re-renders/refocus must not re-subscribe.
    if (openedRef.current === runId) return;
    openedRef.current = runId;

    const resuming = resumeRef.current?.resume === true;
    const targetStep = resuming ? resumeRef.current?.initialActiveStep ?? 0 : 0;

    // Liveness gate: never subscribe to /events for a run that isn't live. A
    // resumed-but-completed run has no active stream (it would 404 in a loop) —
    // its state is already seeded from history + artifacts, so we just stop.
    // streamLive defaults to true, so fresh launches stream unchanged.
    if (resumeRef.current?.streamLive === false) {
      targetStepRef.current = targetStep;
      return;
    }

    const turnId = rid();
    targetStepRef.current = targetStep;

    const controller = new AbortController();
    abortRef.current = controller;
    const openingTurn: RunTurn = { id: turnId, role: "assistant", content: "", streaming: true };

    if (resuming) {
      // Append a live turn only if the stream actually produces output — start
      // hidden by not seeding it; the handler appends on first event instead.
      appendTurn(targetStep, openingTurn);
    } else {
      setTurnsByStep({ [targetStep]: [openingTurn] });
    }
    setStreaming(true);

    streamRun(runId, { signal: controller.signal, onEvent: handlerFor(targetStep, turnId) })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // The event stream is LIVE-ONLY: a run with no active stream 404s. That
        // is TERMINAL — openedRef already pins this runId, so the effect won't
        // re-subscribe; we just close quietly (no error, no retry, no loop).
        // This guards even the live path against a race where the run finished
        // between the liveness check and the subscribe.
        if (isStreamNotLive(err)) return;
        setError(err instanceof Error ? err.message : "Stream interrupted.");
      })
      .finally(() => {
        // Drop an empty resume placeholder turn (no in-flight output arrived).
        setTurnsByStep((prev) => {
          const list = prev[targetStep] ?? [];
          const placeholder = list.find((t) => t.id === turnId);
          if (placeholder && !placeholder.content && !placeholder.reasoning && resuming) {
            return { ...prev, [targetStep]: list.filter((t) => t.id !== turnId) };
          }
          return {
            ...prev,
            [targetStep]: list.map((t) => (t.id === turnId ? { ...t, streaming: false } : t)),
          };
        });
        setStreaming(false);
        abortRef.current = null;
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Posts a user turn into `stepIndex` and streams the reply into the same step.
  const sendInto = useCallback(
    async (stepIndex: number, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      const assistantId = rid();
      targetStepRef.current = stepIndex;
      appendTurn(stepIndex, { id: rid(), role: "user", content: trimmed });
      appendTurn(stepIndex, { id: assistantId, role: "assistant", content: "", streaming: true });
      setStreaming(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await sendRunMessage(runId, trimmed, {
          signal: controller.signal,
          onEvent: handlerFor(stepIndex, assistantId),
        });
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          const message = err instanceof Error ? err.message : "The agent is unavailable.";
          // POST /message returns 409 {run_busy} when a turn is still in flight.
          // The UI already locks send/approve while streaming so this is rare,
          // but if it ever races back, it's benign — don't surface a hard error.
          if (!message.includes("409")) {
            setError(message);
          }
        }
      } finally {
        patchTurn(stepIndex, assistantId, (t) => ({ ...t, streaming: false }));
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [runId, streaming, appendTurn, patchTurn, handlerFor],
  );

  // Improve: typed feedback into the current step. Stays on the step.
  const improve = useCallback(
    (stepIndex: number, text: string) => sendInto(stepIndex, text),
    [sendInto],
  );

  // Looks Good: advance to the next step (if any) and stream the reply there.
  const looksGood = useCallback(
    async (fromIndex: number, instruction: string) => {
      const nextIndex = fromIndex + 1;
      if (nextIndex >= stepCount) return;
      setActiveStep(nextIndex);
      await sendInto(nextIndex, instruction);
    },
    [stepCount, sendInto],
  );

  const goToStep = useCallback(
    (index: number) => {
      // Only completed/active steps are reachable (caller also gates this).
      if (index <= activeStep) setActiveStep(index);
    },
    [activeStep],
  );

  return {
    turnsByStep,
    activeStep,
    streaming,
    error,
    improve,
    looksGood,
    goToStep,
    setActiveStep,
  };
}

function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}
