import { Sparkles, Loader2, User, Wrench, Brain } from "lucide-react";
import { renderMarkdown } from "@/components/labs/workbenchText";
import type { RunTurn } from "@/components/labs/run/useRunStages";

interface RunTranscriptProps {
  turns: RunTurn[];
  /** Hide the first assistant turn when a step renders it prominently itself. */
  skipFirstAssistant?: boolean;
  emptyHint?: string;
}

// RunTranscript — renders a step's Q&A transcript: user turns right-aligned,
// assistant turns with a collapsible reasoning/activity aside, prose as markdown.
// Mirrors StageChat's turn rendering so the run screen stays visually consistent.
export function RunTranscript({ turns, skipFirstAssistant, emptyHint }: RunTranscriptProps) {
  let firstAssistantSeen = false;

  const visible = turns.filter((t) => {
    if (skipFirstAssistant && t.role === "assistant" && !firstAssistantSeen) {
      firstAssistantSeen = true;
      return false;
    }
    return true;
  });

  if (visible.length === 0) {
    return emptyHint ? (
      <p className="px-1 text-[12.5px] text-white/35">{emptyHint}</p>
    ) : null;
  }

  return (
    <div className="space-y-4">
      {visible.map((turn) =>
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
    </div>
  );
}

// One assistant turn: an optional collapsible thinking/activity aside, then the
// streamed reply rendered as formatted markdown.
export function AssistantTurn({ turn }: { turn: RunTurn }) {
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
            <WorkingIndicator latest={turn.latest} />
          ) : (
            <span className="text-[12px] text-white/35">No reply.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// The latest assistant turn in a step (the one a step renders prominently).
export function latestAssistant(turns: RunTurn[]): RunTurn | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "assistant") return turns[i];
  }
  return null;
}

// Working copy for a streaming-but-prose-less turn. HTML-mockup and prompt
// stages can run 1-3 minutes of mostly reasoning + tool calls before any prose,
// so a step can look stalled. `taskLabel` lets a step tailor the headline (e.g.
// "Generating the mockup"); the live status line (`latest`) is shown beneath.
export function workingMessage(taskLabel?: string): string {
  return taskLabel ? `Forge is working — ${taskLabel}…` : "Forge is working on this stage…";
}

// WorkingIndicator — a clear long-running affordance: a spinner, a headline, the
// "this can take a minute" reassurance, and the latest activity/reasoning status
// line when present. Reserves a min height so prose arrival causes no jump.
export function WorkingIndicator({
  latest,
  taskLabel,
}: {
  latest?: string;
  taskLabel?: string;
}) {
  return (
    <div className="flex min-h-[44px] items-start gap-2.5 text-white/55">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#a78bfa]" />
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-white/70">
          {workingMessage(taskLabel)}{" "}
          <span className="font-normal text-white/40">(this can take a minute)</span>
        </p>
        {latest && latest !== "Thinking…" && (
          <p className="mt-0.5 truncate text-[11.5px] text-white/40">{latest}</p>
        )}
      </div>
    </div>
  );
}
