import { GitPullRequestArrow, Check, RotateCcw, Zap } from "lucide-react";
import type { WorkspaceStory } from "@/lib/workspace/workspaceClient";

interface Props {
  story: WorkspaceStory;
  auto: boolean;
  streaming: boolean;
  onApprove: () => void;
  onRequestChanges: () => void;
}

// StoryReviewGate — shown when a story reaches `review`. Surfaces the Architect's
// findings and (in manual mode) the approve / request-changes gate. In auto mode
// it's informational — the review is logged, not blocking.
export function StoryReviewGate({ story, auto, streaming, onApprove, onRequestChanges }: Props) {
  const verdict = story.review?.verdict;
  const verdictColor =
    verdict === "pass" ? "#34d399" : verdict === "changes-requested" ? "#f4c14d" : "#a78bfa";

  return (
    <div className="rounded-xl border border-[#a78bfa]/30 bg-[#a78bfa]/[0.06] p-3.5">
      <div className="flex items-center gap-2">
        <GitPullRequestArrow className="h-4 w-4 text-[#a78bfa]" />
        <span className="font-mono text-[11px] text-white/45">{story.id}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">
          {story.title || story.id}
        </span>
        {verdict && (
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: `${verdictColor}1f`, color: verdictColor }}>
            {verdict}
          </span>
        )}
      </div>

      {story.review?.findings && (
        <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-white/55">
          {story.review.findings}
        </p>
      )}

      {auto ? (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-white/45">
          <Zap className="h-3.5 w-3.5 text-[#f4c14d]" />
          Auto mode — review logged; the team is continuing the sprint.
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onApprove} disabled={streaming}
            className="flex items-center gap-1.5 rounded-lg bg-[#34d399]/15 px-3 py-1.5 text-[12.5px] font-semibold text-[#34d399] transition-colors hover:bg-[#34d399]/25 disabled:opacity-50 cursor-pointer">
            <Check className="h-3.5 w-3.5" /> Approve story
          </button>
          <button type="button" onClick={onRequestChanges} disabled={streaming}
            title="Type your feedback below, then this sends it"
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50 cursor-pointer">
            <RotateCcw className="h-3.5 w-3.5" /> Request changes
          </button>
        </div>
      )}
    </div>
  );
}
