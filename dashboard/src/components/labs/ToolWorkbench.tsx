import { useMemo, useState } from "react";
import {
  MessageSquare,
  Image as ImageIcon,
  LayoutTemplate,
  ArrowRight,
  Flag,
} from "lucide-react";
import type { ToolManifest, ToolStep, StepUi } from "@/lib/labs/toolsClient";
import { WorkbenchStepper } from "@/components/labs/WorkbenchStepper";
import { StageChat } from "@/components/labs/StageChat";
import { StageArtifactIframe } from "@/components/labs/StageArtifactIframe";
import { StageFileCards } from "@/components/labs/StageFileCards";

interface ToolWorkbenchProps {
  manifest: ToolManifest;
  runId: string;
  sessionId: string;
}

// Normalizes a step's render hint; anything unknown (and the absent case) is a chat.
function uiOf(step: ToolStep): StepUi {
  if (step.ui === "artifact-iframe" || step.ui === "file-cards") return step.ui;
  return "chat";
}

const UI_META: Record<StepUi, { label: string; icon: typeof MessageSquare }> = {
  chat: { label: "Conversation", icon: MessageSquare },
  "artifact-iframe": { label: "Mockup", icon: LayoutTemplate },
  "file-cards": { label: "Files", icon: ImageIcon },
  // qna-json renders in the dedicated Brainstorm screen, not the generic
  // Workbench; mapped here only to keep the StepUi record exhaustive.
  "qna-json": { label: "Q&A", icon: MessageSquare },
};

// ToolWorkbench — the per-stage interactive surface for a running tool. A vertical
// stepper (left) walks the manifest's steps; the active step's panel (right) is
// chosen by its `ui` hint. The chat session is shared across every step via the
// same runId, so advancing the stepper is a UI focus change — the conversation
// continues. HITL "Approve → next" advances the stepper without an engine call.
export function ToolWorkbench({ manifest, runId, sessionId }: ToolWorkbenchProps) {
  const steps = useMemo<ToolStep[]>(
    () => (manifest.steps && manifest.steps.length > 0 ? manifest.steps : [
      { id: "run", title: "Run", ui: "chat" },
    ]),
    [manifest.steps],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  const active = steps[Math.min(activeIndex, steps.length - 1)];
  const activeUi = uiOf(active);
  const isLast = activeIndex >= steps.length - 1;
  const next = isLast ? null : steps[activeIndex + 1];
  const meta = UI_META[activeUi];
  const PanelIcon = meta.icon;

  const advance = () => {
    if (!isLast) setActiveIndex((i) => i + 1);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
      {/* Stepper rail */}
      <div className="min-w-0">
        <p className="mb-3 px-1 text-[12px] font-medium uppercase tracking-wide text-white/45">
          Stages
        </p>
        <WorkbenchStepper steps={steps} activeIndex={activeIndex} onSelect={setActiveIndex} />
      </div>

      {/* Active panel */}
      <div className="flex min-h-0 flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <header className="flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#5227FF]/20">
            <PanelIcon className="h-4 w-4 text-[#a78bfa]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-white/90">{active.title}</p>
            <p className="text-[11.5px] text-white/45">{meta.label}</p>
          </div>
          <span className="ml-auto text-[11.5px] text-white/35">
            Step {activeIndex + 1} / {steps.length}
          </span>
        </header>

        {/* Body: the active step's panel by ui hint. The chat stage stays mounted
            across non-chat steps (hidden) so the shared session never drops. */}
        <div className="relative flex min-h-0 flex-1 flex-col p-4">
          <div className={activeUi === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <StageChat runId={runId} stepId={`chat:${sessionId}`} />
          </div>

          {activeUi === "artifact-iframe" && (
            <StageArtifactIframe toolId={manifest.id} runId={runId} step={active} />
          )}

          {activeUi === "file-cards" && <StageFileCards toolId={manifest.id} runId={runId} />}
        </div>

        {/* HITL advance */}
        <footer className="border-t border-white/[0.07] px-4 py-3">
          <button
            type="button"
            onClick={advance}
            disabled={isLast}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition-colors duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style={{ background: isLast ? "rgba(255,255,255,0.08)" : "#5227FF" }}
          >
            {isLast ? (
              <>
                <Flag className="h-4 w-4" />
                Finish
              </>
            ) : (
              <>
                Approve → {next?.title}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
