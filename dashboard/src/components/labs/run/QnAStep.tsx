import { MessagesSquare } from "lucide-react";
import { renderMarkdown } from "@/components/labs/workbenchText";
import { ImproveApproveBar } from "@/components/labs/run/ImproveApproveBar";
import {
  RunTranscript,
  latestAssistant,
  WorkingIndicator,
} from "@/components/labs/run/RunTranscript";
import type { RunTurn } from "@/components/labs/run/useRunStages";

interface QnAStepProps {
  turns: RunTurn[];
  streaming: boolean;
  isLast?: boolean;
  nextTitle?: string;
  onImprove: (text: string) => void;
  onLooksGood: () => void;
}

// QnAStep (Brand Intake Q&A) — surfaces the agent's current question battery
// prominently (the latest assistant turn), with the running Q&A transcript
// below. "Improve" here submits the user's answers; "Looks Good" marks intake
// complete and proceeds.
export function QnAStep({
  turns,
  streaming,
  isLast,
  nextTitle,
  onImprove,
  onLooksGood,
}: QnAStepProps) {
  const current = latestAssistant(turns);
  const hasQuestions = Boolean(current?.content);

  return (
    <div className="space-y-5">
      {/* Prominent current questions card. */}
      <div className="rounded-2xl border border-[#5227FF]/25 bg-[#5227FF]/[0.06] p-5">
        <div className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-[#a78bfa]">
          <MessagesSquare className="h-4 w-4" />
          Intake questions
        </div>
        {hasQuestions ? (
          <div className="space-y-0.5 text-[14px] leading-relaxed text-white/85">
            {renderMarkdown(current!.content)}
          </div>
        ) : streaming ? (
          <WorkingIndicator latest={current?.latest} taskLabel="preparing your intake questions" />
        ) : (
          <p className="text-[13px] text-white/45">
            The agent hasn't asked anything yet.
          </p>
        )}
      </div>

      {/* Running Q&A transcript (skip the prominent first turn shown above). */}
      <RunTranscript
        turns={turns}
        skipFirstAssistant
        emptyHint="Your answers and the agent's follow-ups will appear here."
      />

      <ImproveApproveBar
        streaming={streaming}
        isLast={isLast}
        nextTitle={nextTitle}
        improveLabel="Submit answers"
        placeholder="Answer the questions above…"
        onImprove={onImprove}
        onLooksGood={onLooksGood}
      />
    </div>
  );
}
