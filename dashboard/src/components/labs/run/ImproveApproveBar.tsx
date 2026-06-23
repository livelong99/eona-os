import { useState } from "react";
import { Wand2, ArrowRight, Loader2, Flag } from "lucide-react";

interface ImproveApproveBarProps {
  /** True while a turn is streaming — disables both actions. */
  streaming: boolean;
  /** True when this is the final step: "Looks Good" becomes "Finish". */
  isLast?: boolean;
  /** Label for the next step, shown on the advance button. */
  nextTitle?: string;
  /** Verbs override the defaults per step (e.g. "Submit answers"). */
  improveLabel?: string;
  approveLabel?: string;
  placeholder?: string;
  /** Send typed feedback into the current step. */
  onImprove: (text: string) => void;
  /** Advance to the next step (allowed with empty text). */
  onLooksGood: () => void;
}

// ImproveApproveBar — the gated approval footer shared by every run step. A
// textarea plus two actions: a secondary "Improve" (sends feedback, stays on the
// step) and a confident "Looks Good →" (advances). Both lock while streaming.
// Enter submits Improve; Cmd/Ctrl+Enter also submits Improve.
export function ImproveApproveBar({
  streaming,
  isLast,
  nextTitle,
  improveLabel = "Improve",
  approveLabel,
  placeholder = "Tell the agent what to refine…",
  onImprove,
  onLooksGood,
}: ImproveApproveBarProps) {
  const [text, setText] = useState("");

  const submitImprove = () => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onImprove(trimmed);
    setText("");
  };

  const approveText =
    approveLabel ?? (isLast ? "Finish" : nextTitle ? `Looks Good — ${nextTitle}` : "Looks Good");

  return (
    <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitImprove();
          }
        }}
        rows={2}
        disabled={streaming}
        placeholder={placeholder}
        aria-label="Feedback for the agent"
        className="min-h-[56px] w-full resize-none rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/25 focus:bg-white/[0.06] disabled:opacity-50"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={submitImprove}
          disabled={streaming || !text.trim()}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[13px] font-semibold text-white/80 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.04] hover:text-white disabled:cursor-default disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
        >
          {streaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {improveLabel}
        </button>

        <button
          type="button"
          onClick={onLooksGood}
          disabled={streaming}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-colors duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          style={{ background: "#5227FF" }}
        >
          {streaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isLast ? (
            <Flag className="h-4 w-4" />
          ) : null}
          {approveText}
          {!isLast && !streaming && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
