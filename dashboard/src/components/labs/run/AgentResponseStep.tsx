import { Loader2, Sparkles } from "lucide-react";
import { renderMarkdown } from "@/components/labs/workbenchText";
import { ImproveApproveBar } from "@/components/labs/run/ImproveApproveBar";
import {
  RunTranscript,
  latestAssistant,
  WorkingIndicator,
} from "@/components/labs/run/RunTranscript";
import type { RunTurn } from "@/components/labs/run/useRunStages";

interface AgentResponseStepProps {
  turns: RunTurn[];
  streaming: boolean;
  isLast?: boolean;
  nextTitle?: string;
  onImprove: (text: string) => void;
  onLooksGood: () => void;
}

// AgentResponseStep (Deconstruction, Domain Shifting) — the agent's analysis
// rendered prominently as formatted markdown, the reasoning/activity folded into
// a muted aside via the transcript, plus the Improve/Approve bar.
export function AgentResponseStep({
  turns,
  streaming,
  isLast,
  nextTitle,
  onImprove,
  onLooksGood,
}: AgentResponseStepProps) {
  const current = latestAssistant(turns);
  const hasContent = Boolean(current?.content);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-white/45">
          <Sparkles className="h-4 w-4 text-[#a78bfa]" />
          Agent analysis
        </div>
        {hasContent ? (
          <div className="space-y-0.5 text-[13.5px] leading-relaxed text-white/80">
            {renderMarkdown(current!.content)}
          </div>
        ) : streaming ? (
          <WorkingIndicator latest={current?.latest} taskLabel="generating this analysis" />
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-white/45">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for the agent…
          </div>
        )}
      </div>

      <RunTranscript
        turns={turns}
        skipFirstAssistant
        emptyHint="Your refinements and the agent's revisions will appear here."
      />

      <ImproveApproveBar
        streaming={streaming}
        isLast={isLast}
        nextTitle={nextTitle}
        onImprove={onImprove}
        onLooksGood={onLooksGood}
      />
    </div>
  );
}
