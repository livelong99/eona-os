import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2, User, AlertTriangle } from "lucide-react";
import {
  refineDraft,
  type ChatMessage,
} from "@/lib/labs/toolsClient";
import { type BuilderState } from "@/components/labs/builderState";

interface RefineChatProps {
  /** The draft being refined — seeds the conversation context. */
  draft: BuilderState;
  className?: string;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** True while the assistant turn is still streaming. */
  streaming?: boolean;
}

// One-line summary of the draft used to seed the chat panel.
function summarizeDraft(d: BuilderState): string {
  const goals = d.goals.filter((g) => g.trim()).length;
  const steps = d.steps.filter((s) => s.title.trim()).length;
  return `**${d.name || "Untitled tool"}** — ${d.tagline || "no tagline"}\n\nSkill \`${
    d.skill || "—"
  }\` · ${goals} goal${goals === 1 ? "" : "s"} · ${steps} step${steps === 1 ? "" : "s"} · category ${d.category}.`;
}

// Lightweight markdown-ish rendering: bold (**x**) + inline code (`x`), newlines
// preserved. Keeps us dependency-free while reading nicely for agent prose.
function renderText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[12px] text-[#a78bfa]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// RefineChat — a chat panel seeded with the draft that streams agent suggestions
// for improving the tool before publish. Tokens arrive over the refine SSE.
export function RefineChat({ draft, className }: RefineChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const userTurn: Turn = { id: rid(), role: "user", content: trimmed };
    const assistantId = rid();
    setTurns((prev) => [
      ...prev,
      userTurn,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setBusy(true);
    setError(null);

    // The engine gets the running transcript; the draft seeds tool context.
    const history: ChatMessage[] = [
      ...turns.map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
      { role: "user", content: trimmed },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await refineDraft(draft, history, {
        signal: controller.signal,
        onToken: (delta) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === assistantId ? { ...t, content: t.content + delta } : t,
            ),
          );
        },
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

  const suggestions = [
    "Critique this tool and tighten the goals.",
    "Suggest richer workflow steps.",
    "Are the inputs and outputs right?",
  ];

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
        {/* Seed card */}
        <div className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#5227FF]/20">
            <Sparkles className="h-4 w-4 text-[#a78bfa]" />
          </span>
          <div className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-[13px] leading-relaxed text-white/70">
            <p className="mb-2 text-white/85">
              I'll help you refine this tool before you publish it. Here's what you have:
            </p>
            <div className="whitespace-pre-wrap text-white/60">{renderText(summarizeDraft(draft))}</div>
          </div>
        </div>

        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="flex justify-end gap-3">
              <div className="max-w-[80%] rounded-xl border border-[#5227FF]/30 bg-[#5227FF]/15 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90">
                {turn.content}
              </div>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06]">
                <User className="h-4 w-4 text-white/50" />
              </span>
            </div>
          ) : (
            <div key={turn.id} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#5227FF]/20">
                <Sparkles className="h-4 w-4 text-[#a78bfa]" />
              </span>
              <div className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/75">
                {turn.content ? (
                  <span className="whitespace-pre-wrap">{renderText(turn.content)}</span>
                ) : turn.streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                ) : null}
              </div>
            </div>
          ),
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Quick suggestions (only before the first turn) */}
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2 px-1 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/60 transition-colors hover:border-white/25 hover:text-white/85 disabled:opacity-40 cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 px-1 pt-1"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Ask the agent to refine this tool…"
          className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/25 focus:bg-white/[0.06]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-xl text-white transition-colors duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer"
          style={{ background: "#5227FF" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
