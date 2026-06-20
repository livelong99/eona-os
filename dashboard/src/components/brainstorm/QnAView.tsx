import { Check, Send, Loader, MessageCircleQuestion } from "lucide-react";
import type { BrainstormQuestion } from "@/lib/brainstorm";

interface QnAViewProps {
  questions: BrainstormQuestion[];
  drafts: Record<string, string>;
  onDraftChange: (id: string, value: string) => void;
  onSubmit: () => void;
  processing: boolean;
}

// QnAView — the clarifying-questions panel. Answered questions are shown resolved;
// open ones get an answer box. Submitting sends answers to the team, which then
// asks follow-ups to refine the idea further.
export function QnAView({
  questions,
  drafts,
  onDraftChange,
  onSubmit,
  processing,
}: QnAViewProps) {
  const open = questions.filter((q) => !q.answered);
  const answered = questions.filter((q) => q.answered);
  const hasDraft = open.some((q) => (drafts[q.id] ?? "").trim().length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-2.5">
        <MessageCircleQuestion className="h-4 w-4 text-[#a78bfa]" />
        <span className="text-[12.5px] text-white/65">
          {open.length} open · {answered.length} answered
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {open.map((q) => (
          <div
            key={q.id}
            className="rounded-xl border border-white/12 bg-white/[0.03] p-4"
          >
            <QuestionMeta agent={q.agent} category={q.category} />
            <p className="mt-2 text-[14px] font-medium leading-snug text-white/90">
              {q.question}
            </p>
            <textarea
              value={drafts[q.id] ?? ""}
              onChange={(e) => onDraftChange(q.id, e.target.value)}
              rows={2}
              placeholder="Your answer…"
              aria-label={`Answer: ${q.question}`}
              className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13.5px] leading-relaxed text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.06]"
            />
          </div>
        ))}

        {answered.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-white/35">
              <Check className="h-3.5 w-3.5" />
              Answered
            </div>
            {answered.map((q) => (
              <div
                key={q.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 opacity-80"
              >
                <QuestionMeta agent={q.agent} category={q.category} resolved />
                <p className="mt-2 text-[13.5px] font-medium leading-snug text-white/70">
                  {q.question}
                </p>
                <p className="mt-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] leading-relaxed text-white/55">
                  {q.answer}
                </p>
              </div>
            ))}
          </>
        )}
      </div>

      {/* submit bar */}
      <div className="border-t border-white/[0.07] px-5 py-3">
        {processing ? (
          <div className="flex items-center justify-center gap-2 py-1.5 text-[13px] text-white/55">
            <Loader className="h-4 w-4 animate-spin text-[#a78bfa]" />
            Agents are processing your answers…
          </div>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!hasDraft}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white transition-all duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer"
            style={{ background: "#5227FF" }}
          >
            <Send className="h-4 w-4" />
            Submit answers for refinement
          </button>
        )}
      </div>
    </div>
  );
}

function QuestionMeta({
  agent,
  category,
  resolved,
}: {
  agent: string;
  category: string;
  resolved?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="font-medium text-white/60">{agent}</span>
      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-white/50">
        {category}
      </span>
      {resolved && (
        <span className="ml-auto inline-flex items-center gap-1 text-[#34d399]">
          <Check className="h-3.5 w-3.5" />
          answered
        </span>
      )}
    </div>
  );
}
