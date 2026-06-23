import { useEffect, useRef, useState } from "react";
import { Loader2, CircleCheck, CircleAlert, Terminal } from "lucide-react";
import { streamRun, isStreamNotLive } from "@/lib/labs/toolsClient";
import {
  deltaText,
  reasoningText,
  toolActivity,
  terminalState,
  terminalText,
  looksLikeError,
} from "@/components/labs/workbenchText";

type RunPhase = "running" | "done" | "failed";

interface RunConsoleProps {
  /** The run to stream (build run or tool-launch run). */
  runId: string;
  /** Heading shown above the stream. */
  title?: string;
  /** Called once the run reaches a terminal state. */
  onComplete?: (phase: "done" | "failed") => void;
  className?: string;
}

interface ConsoleLine {
  id: number;
  kind: "output" | "progress" | "status" | "error";
  text: string;
}

// RunConsole — subscribes to a run's SSE event stream and renders it as a
// readable console. Reused for build runs and tool runs. Renders the engine's
// run-event protocol (engine/agent/run_events.py): `message.delta` streams into
// a single growing output line; `reasoning.available` and real `tool.*` events
// are dim status/progress lines; the noisy "trace" pseudo-tool is dropped — no
// raw event JSON ever reaches the screen.
export function RunConsole({ runId, title = "Run", onComplete, className }: RunConsoleProps) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [phase, setPhase] = useState<RunPhase>("running");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  // Id of the live output line currently accumulating message.delta chunks, so
  // streamed text grows in place instead of one line per token.
  const outId = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let settled = false;
    setLines([]);
    setPhase("running");
    setError(null);
    counter.current = 0;
    outId.current = null;

    const settle = (next: "done" | "failed") => {
      if (settled) return;
      settled = true;
      setPhase(next);
      onComplete?.(next);
    };

    const pushLine = (kind: ConsoleLine["kind"], text: string) => {
      if (!text) return;
      outId.current = null; // any non-delta line breaks the streaming buffer
      setLines((prev) => [...prev, { id: counter.current++, kind, text }]);
    };

    const appendDelta = (delta: string) => {
      setLines((prev) => {
        if (outId.current !== null) {
          return prev.map((l) =>
            l.id === outId.current ? { ...l, text: l.text + delta } : l,
          );
        }
        const id = counter.current++;
        outId.current = id;
        return [...prev, { id, kind: "output", text: delta }];
      });
    };

    streamRun(runId, {
      signal: controller.signal,
      onEvent: (event) => {
        const term = terminalState(event);
        if (term === "failed" || term === "cancelled") {
          setError(terminalText(event) || "Run failed.");
          settle("failed");
          return;
        }

        const delta = deltaText(event);
        if (delta) {
          appendDelta(delta);
          return;
        }
        const reasoning = reasoningText(event);
        if (reasoning) {
          pushLine("status", reasoning);
          return;
        }
        const activity = toolActivity(event);
        if (activity) {
          pushLine("progress", activity);
          return;
        }
        if (term === "done") {
          const out = terminalText(event);
          if (out && looksLikeError(out)) {
            setError(out);
            settle("failed");
            return;
          }
          if (out && outId.current === null) pushLine("output", out);
          settle("done");
        }
      },
    })
      .then(() => settle("done"))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // 404 = the run isn't live (already finished / no active stream). Settle
        // terminally and quietly — the effect is keyed on runId, so it won't
        // re-subscribe, and we avoid a hard error / retry loop.
        if (isStreamNotLive(err)) {
          settle("done");
          return;
        }
        setError(err instanceof Error ? err.message : "Stream interrupted.");
        settle("failed");
      });

    return () => controller.abort();
    // onComplete intentionally omitted — callers pass a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Auto-scroll to the newest line.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40 ${className ?? ""}`}
    >
      <header className="flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5">
        <Terminal className="h-4 w-4 text-white/45" />
        <span className="text-[13px] font-medium text-white/80">{title}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium">
          {phase === "running" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-[#4f8cff]" />
              <span className="text-[#9cc0ff]">Running</span>
            </>
          )}
          {phase === "done" && (
            <>
              <CircleCheck className="h-3 w-3 text-[#34d399]" />
              <span className="text-[#34d399]">Done</span>
            </>
          )}
          {phase === "failed" && (
            <>
              <CircleAlert className="h-3 w-3 text-[#f87171]" />
              <span className="text-[#f87171]">Failed</span>
            </>
          )}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed"
      >
        {lines.length === 0 && phase === "running" && (
          <p className="text-white/35">Waiting for the run to start…</p>
        )}
        {lines.map((line) => (
          <pre
            key={line.id}
            className={`whitespace-pre-wrap break-words ${
              line.kind === "error"
                ? "text-[#f87171]"
                : line.kind === "progress"
                  ? "text-[#9cc0ff]"
                  : line.kind === "status"
                    ? "text-white/45"
                    : "text-white/80"
            }`}
          >
            {line.text}
          </pre>
        ))}
        {error && phase === "failed" && (
          <pre className="mt-2 whitespace-pre-wrap break-words text-[#f87171]">{error}</pre>
        )}
      </div>
    </div>
  );
}
