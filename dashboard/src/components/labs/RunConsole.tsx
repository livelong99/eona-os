import { useEffect, useRef, useState } from "react";
import { Loader2, CircleCheck, CircleAlert, Terminal } from "lucide-react";
import { streamRun, type RunEvent } from "@/lib/labs/toolsClient";

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

// Maps an engine run event to a renderable console line. Tolerant of the loose
// RunEvent shape — falls back to a JSON dump when there's no text payload.
function toLine(event: RunEvent, id: number): ConsoleLine | null {
  const type = (event.type ?? "").toLowerCase();
  const text =
    event.text ??
    (typeof event.status === "string" ? event.status : "") ??
    "";
  if (type === "error") {
    return { id, kind: "error", text: text || "Run failed." };
  }
  if (type === "progress" || type === "status") {
    if (!text) return null;
    return { id, kind: type === "progress" ? "progress" : "status", text };
  }
  if (text) return { id, kind: "output", text };
  // Unknown event with no text — surface compactly for debugging.
  const dump = JSON.stringify(event);
  if (dump === "{}") return null;
  return { id, kind: "output", text: dump };
}

function isTerminal(event: RunEvent): "done" | "failed" | null {
  const type = (event.type ?? "").toLowerCase();
  const status = (event.status ?? "").toLowerCase();
  if (type === "done" || status === "done" || status === "completed" || status === "succeeded") {
    return "done";
  }
  if (type === "error" || status === "failed" || status === "error") {
    return "failed";
  }
  return null;
}

// RunConsole — subscribes to a run's SSE event stream and renders streamed
// output with a running/done/failed state. Reused for build runs and tool runs.
export function RunConsole({ runId, title = "Run", onComplete, className }: RunConsoleProps) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [phase, setPhase] = useState<RunPhase>("running");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let settled = false;
    setLines([]);
    setPhase("running");
    setError(null);
    counter.current = 0;

    const settle = (next: "done" | "failed") => {
      if (settled) return;
      settled = true;
      setPhase(next);
      onComplete?.(next);
    };

    streamRun(runId, {
      signal: controller.signal,
      onEvent: (event) => {
        const line = toLine(event, counter.current++);
        if (line) setLines((prev) => [...prev, line]);
        const terminal = isTerminal(event);
        if (terminal) settle(terminal);
      },
    })
      .then(() => settle("done"))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
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
