import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2, User, AlertTriangle, Wrench, Brain } from "lucide-react";
import {
  streamRun,
  sendRunMessage,
  isStreamNotLive,
  type RunEvent,
} from "@/lib/labs/toolsClient";
import {
  renderMarkdown,
  deltaText,
  reasoningText,
  toolActivity,
  terminalState,
  terminalText,
  looksLikeError,
} from "@/components/labs/workbenchText";

interface StageChatProps {
  runId: string;
  /** Distinguishes this stage's chat instance (resets the opening stream). */
  stepId: string;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  /** The streamed reply prose (message.delta chunks). */
  content: string;
  /** True while the assistant turn is still streaming. */
  streaming?: boolean;
  /** Friendly tool-activity labels (tool.started/completed, trace filtered). */
  activity?: string[];
  /** The agent's reasoning text (reasoning.available), shown muted/aside. */
  reasoning?: string;
  /** The most recent live status line shown while no prose has arrived yet. */
  latest?: string;
}

function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// StageChat — a live chat panel bound to a running tool's session. The launch
// stream is shown as the agent's opening turn; each user message is posted with
// sendRunMessage and the reply streams into the transcript. Shared across stages
// via the same runId, so the conversation continues as the stepper advances.
//
// Renders the engine's run-event protocol (engine/agent/run_events.py): the
// reply prose comes from `message.delta`; `reasoning.available` and real
// `tool.*` events are surfaced as a muted activity aside; the noisy "trace"
// pseudo-tool (raw CLI stream-json) is filtered out — never raw JSON in the UI.
export function StageChat({ runId, stepId }: StageChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Track whether the opening stream has been consumed for this run so a stage
  // refocus doesn't re-subscribe and duplicate the opening turn.
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  // Returns an onEvent handler that folds the run-event protocol into the
  // assistant turn `id`. Shared by the opening stream and each user reply.
  const handlerFor = (id: string) => (event: RunEvent) => {
    const term = terminalState(event);
    if (term === "failed" || term === "cancelled") {
      setError(terminalText(event) || "The run ended unexpectedly.");
      return;
    }

    const delta = deltaText(event);
    if (delta) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, content: t.content + delta, latest: undefined } : t,
        ),
      );
      return;
    }

    const reasoning = reasoningText(event);
    if (reasoning) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, reasoning: (t.reasoning ?? "") + reasoning, latest: "Thinking…" }
            : t,
        ),
      );
      return;
    }

    const activity = toolActivity(event);
    if (activity) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, activity: [...(t.activity ?? []), activity], latest: activity }
            : t,
        ),
      );
      return;
    }

    if (term === "done") {
      const out = terminalText(event);
      if (out && looksLikeError(out)) {
        setError(out);
        return;
      }
      // Fall back to the terminal output only if nothing streamed.
      if (out) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id && !t.content ? { ...t, content: out, latest: undefined } : t,
          ),
        );
      }
    }
  };

  // Subscribe to the launch stream once per run, rendering it as the opening
  // assistant turn. Only the first chat stage to mount opens the stream.
  useEffect(() => {
    if (openedRef.current === runId) return;
    openedRef.current = runId;

    const controller = new AbortController();
    abortRef.current = controller;
    const openingId = rid();
    setTurns([{ id: openingId, role: "assistant", content: "", streaming: true }]);
    setBusy(true);

    streamRun(runId, { signal: controller.signal, onEvent: handlerFor(openingId) })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // A 404 means the run isn't live (finished / no active stream). That is
        // TERMINAL — openedRef pins this runId so we never re-subscribe; close
        // quietly instead of surfacing an error or looping.
        if (isStreamNotLive(err)) return;
        setError(err instanceof Error ? err.message : "Stream interrupted.");
      })
      .finally(() => {
        setTurns((prev) =>
          prev.map((t) => (t.id === openingId ? { ...t, streaming: false } : t)),
        );
        setBusy(false);
        abortRef.current = null;
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const assistantId = rid();
    setTurns((prev) => [
      ...prev,
      { id: rid(), role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setBusy(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendRunMessage(runId, trimmed, {
        signal: controller.signal,
        onEvent: handlerFor(assistantId),
      });
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "The agent is unavailable.");
      }
    } finally {
      setTurns((prev) =>
        prev.map((t) => (t.id === assistantId ? { ...t, streaming: false } : t)),
      );
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-step={stepId}>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
        {turns.length === 0 && (
          <div className="flex items-center gap-2 px-1 text-[13px] text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            Resuming the agent session…
          </div>
        )}

        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="flex justify-end gap-3">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-xl border border-[#5227FF]/30 bg-[#5227FF]/15 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90">
                {turn.content}
              </div>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06]">
                <User className="h-4 w-4 text-white/50" />
              </span>
            </div>
          ) : (
            <AssistantTurn key={turn.id} turn={turn} />
          ),
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-pre-wrap break-words">{error}</span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 px-1 pt-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder="Reply to the agent…"
          className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/25 focus:bg-white/[0.06]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-xl text-white transition-colors duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
          style={{ background: "#5227FF" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

// One assistant turn: an optional collapsible activity/thinking aside, then the
// streamed reply rendered as formatted markdown (never raw event JSON).
function AssistantTurn({ turn }: { turn: Turn }) {
  const steps = turn.activity ?? [];
  const hasAside = steps.length > 0 || Boolean(turn.reasoning);

  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#5227FF]/20">
        <Sparkles className="h-4 w-4 text-[#a78bfa]" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {hasAside && (
          <details className="group rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[11.5px] font-medium text-white/45 transition-colors hover:text-white/70">
              <Wrench className="h-3.5 w-3.5" />
              {steps.length > 0 ? `${steps.length} step${steps.length === 1 ? "" : "s"}` : "Reasoning"}
              {turn.streaming && turn.latest && (
                <span className="ml-1 truncate text-white/35">· {turn.latest}</span>
              )}
            </summary>
            <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[11.5px] text-white/45">
                  <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-white/30" />
                  <span className="min-w-0 break-words font-mono">{s}</span>
                </div>
              ))}
              {turn.reasoning && (
                <div className="flex items-start gap-2 pt-0.5 text-[11.5px] italic text-white/40">
                  <Brain className="mt-0.5 h-3 w-3 shrink-0 text-white/30" />
                  <span className="min-w-0 whitespace-pre-wrap break-words">{turn.reasoning}</span>
                </div>
              )}
            </div>
          </details>
        )}

        <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/75">
          {turn.content ? (
            <div className="space-y-0.5">{renderMarkdown(turn.content)}</div>
          ) : turn.streaming ? (
            <div className="flex items-center gap-2 text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[12px]">{turn.latest ?? "Working…"}</span>
            </div>
          ) : (
            <span className="text-[12px] text-white/35">No reply.</span>
          )}
        </div>
      </div>
    </div>
  );
}
