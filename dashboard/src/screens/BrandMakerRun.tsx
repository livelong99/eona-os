import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  History,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { manifestToTool } from "@/lib/labs";
import { TOOL_ICONS } from "@/components/labs/toolIcon";
import { getTool, type ToolManifest, type ToolStep, type StepUi } from "@/lib/labs/toolsClient";
import { WorkbenchStepper } from "@/components/labs/WorkbenchStepper";
import { useRunStages, type ResumeOptions } from "@/components/labs/run/useRunStages";
import { useResumeRun } from "@/components/labs/run/useResumeRun";
import { useProjectArtifacts } from "@/components/labs/run/useProjectArtifacts";
import { ProjectRunBody } from "@/components/labs/run/ProjectRunBody";
import { QnAStep } from "@/components/labs/run/QnAStep";
import { AgentResponseStep } from "@/components/labs/run/AgentResponseStep";
import { HtmlMockupStep } from "@/components/labs/run/HtmlMockupStep";
import { PromptsStep } from "@/components/labs/run/PromptsStep";

// The run context handed over from LabsToolDetail via navigation state. On a hard
// reload / deep-link this is absent — the screen shows a graceful end-of-run panel.
interface RunNavState {
  runId?: string;
  sessionId?: string;
  manifest?: ToolManifest;
  brand?: string;
}

function uiOf(step: ToolStep): StepUi {
  if (step.ui === "artifact-iframe" || step.ui === "file-cards") return step.ui;
  return "chat";
}

function stepsOf(manifest: ToolManifest | null): ToolStep[] {
  if (manifest?.steps && manifest.steps.length > 0) return manifest.steps;
  return [{ id: "run", title: "Run", ui: "chat" }];
}

// BrandMakerRun — a dedicated, step-gated run experience for the Brand Maker.
// One agent session walks the manifest's steps one at a time, gated by the
// Improve/Looks-Good bar. Stream output is routed to the currently-streaming
// step by useRunStages.
//
// Resolves the manifest first (both fresh launches and resumes need it), then
// either uses the handed-over nav-state run context or recovers it via a
// latest-run lookup (deep-link / hard reload).
export function BrandMakerRun() {
  const { toolId, brandId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = (location.state ?? {}) as RunNavState;

  const hasNav = Boolean(nav.runId);
  const [manifest, setManifest] = useState<ToolManifest | null>(nav.manifest ?? null);
  const [loadingManifest, setLoadingManifest] = useState(false);

  // Fetch the manifest when nav state didn't carry it (resume / partial nav).
  useEffect(() => {
    if (manifest || !toolId) return;
    const controller = new AbortController();
    setLoadingManifest(true);
    getTool(toolId, controller.signal)
      .then((m) => !controller.signal.aborted && setManifest(m))
      .catch(() => {})
      .finally(() => !controller.signal.aborted && setLoadingManifest(false));
    return () => controller.abort();
  }, [manifest, toolId]);

  // Recover run context from a latest-run lookup only when nav state is absent.
  const resume = useResumeRun(!hasNav, toolId, brandId, stepsOf(manifest));
  // In parallel, load the brand's artifacts on disk — the fallback when no live
  // run is found is to open the existing PROJECT read-only from those artifacts.
  const project = useProjectArtifacts(!hasNav, toolId, brandId);

  // Fresh launch: nav state is authoritative.
  if (hasNav && nav.runId) {
    if (!manifest) return <PreparingPanel loading={loadingManifest} />;
    return (
      <RunBody
        manifest={manifest}
        runId={nav.runId}
        brand={nav.brand}
        onBack={() => navigate(`/labs/${manifest.id}`)}
      />
    );
  }

  // Deep-link / hard reload: resolve via resume (live run) or project artifacts.
  if (!manifest || resume.phase === "loading") {
    return <PreparingPanel loading={loadingManifest || resume.phase === "loading"} resuming />;
  }

  // No live run found: open the existing project read-only when it has artifacts.
  if (resume.phase === "ended") {
    if (project.phase === "loading") return <PreparingPanel resuming />;
    if (project.phase === "ready" && project.files.length > 0) {
      return (
        <ProjectRunBody
          manifest={manifest}
          brandId={brandId ?? ""}
          brand={brandId ?? "this project"}
          artifacts={project.files}
          onBack={() => navigate(toolId ? `/labs/${toolId}` : "/labs")}
        />
      );
    }
    return (
      <EndedPanel toolId={toolId} onBack={() => navigate(toolId ? `/labs/${toolId}` : "/labs")} />
    );
  }
  if (resume.phase === "error") {
    return (
      <CenteredPanel>
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f87171]/15">
          <AlertTriangle className="h-6 w-6 text-[#f87171]" />
        </span>
        <p className="mt-3 text-[14px] font-medium text-white/80">Couldn't resume this run</p>
        <p className="mt-1 max-w-sm text-[12.5px] text-white/45">{resume.message}</p>
        <button
          type="button"
          onClick={() => navigate(toolId ? `/labs/${toolId}` : "/labs")}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-[13px] font-medium text-white/75 transition-colors hover:border-white/30 hover:text-white/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
        >
          Back to tool
        </button>
      </CenteredPanel>
    );
  }

  return (
    <RunBody
      manifest={manifest}
      runId={resume.run.runId}
      brand={resume.run.brand}
      resumed
      live={resume.run.live}
      seedTurnsByStep={resume.run.seedTurnsByStep}
      initialActiveStep={resume.run.initialActiveStep}
      onBack={() => navigate(`/labs/${manifest.id}`)}
    />
  );
}

function PreparingPanel({ loading, resuming }: { loading?: boolean; resuming?: boolean }) {
  return (
    <CenteredPanel>
      <Loader2 className="h-5 w-5 animate-spin text-white/50" />
      <p className="mt-3 text-sm text-white/50">
        {resuming ? "Resuming your session…" : loading ? "Loading the tool…" : "Preparing the run…"}
      </p>
    </CenteredPanel>
  );
}

interface RunBodyProps {
  manifest: ToolManifest;
  runId: string;
  brand?: string;
  /** True when run context was recovered via latest-run lookup (vs fresh nav). */
  resumed?: boolean;
  /** Whether the run still has an active event stream. Fresh launches are always
   * live (default true); a resumed run streams only when the engine says so. */
  live?: boolean;
  seedTurnsByStep?: ResumeOptions["seedTurnsByStep"];
  initialActiveStep?: number;
  onBack: () => void;
}

function RunBody({
  manifest,
  runId,
  brand,
  resumed,
  live = true,
  seedTurnsByStep,
  initialActiveStep,
  onBack,
}: RunBodyProps) {
  const steps = useMemo<ToolStep[]>(
    () =>
      manifest.steps && manifest.steps.length > 0
        ? manifest.steps
        : [{ id: "run", title: "Run", ui: "chat" }],
    [manifest.steps],
  );

  // Seeded once on mount — useRunStages stashes resume opts in a ref keyed off
  // runId, so a stable object isn't required, but memoize to be tidy.
  const resumeOpts = useMemo<ResumeOptions>(
    () => ({ resume: Boolean(resumed), seedTurnsByStep, initialActiveStep, streamLive: live }),
    [resumed, seedTurnsByStep, initialActiveStep, live],
  );

  const { turnsByStep, activeStep, streaming, error, improve, looksGood, goToStep } =
    useRunStages(runId, steps.length, resumeOpts);

  // Marks the whole journey complete after "Finish" on the last step.
  const [finished, setFinished] = useState(false);

  const tool = manifestToTool(manifest);
  const Icon = TOOL_ICONS[tool.icon];

  const active = steps[Math.min(activeStep, steps.length - 1)];
  const isLast = activeStep >= steps.length - 1;
  const next = isLast ? null : steps[activeStep + 1];
  const turns = turnsByStep[activeStep] ?? [];

  const onImprove = useCallback(
    (text: string) => improve(activeStep, text),
    [improve, activeStep],
  );

  // "Looks Good" advances to the next step (streaming its reply there); on the
  // last step it finalizes the journey. The approval message explicitly asks the
  // agent to SAVE this stage's artifact before moving on — under terse approvals
  // it sometimes narrates instead of writing the file.
  const onLooksGood = useCallback(() => {
    if (isLast) {
      // Final stage: ask it to flush any remaining artifacts, then finish.
      void improve(
        activeStep,
        "Approved — this stage looks good. Please make sure this stage's artifact file " +
          "and any remaining artifacts are fully written and saved to the brand folder. " +
          "This is the final stage.",
      );
      setFinished(true);
      return;
    }
    const nextTitle = next?.title ?? "the next stage";
    void looksGood(
      activeStep,
      `Approved — this stage looks good. First, make sure THIS stage's artifact file is ` +
        `fully written and saved to the brand folder. Then proceed to the next stage: ` +
        `${nextTitle}, and save its artifact when done.`,
    );
  }, [isLast, next, looksGood, improve, activeStep]);

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <GlassPanel className="w-full max-w-[1180px]">
        {/* Header */}
        <header className="flex items-center gap-4 px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to tool"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/10"
            style={{ background: `${tool.accent}22` }}
          >
            <Icon className="h-6 w-6" style={{ color: tool.accent }} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">
              {tool.name}
            </h1>
            <p className="truncate text-[13px] text-white/50">
              {brand ? `Brand: ${brand}` : tool.tagline}
            </p>
          </div>

          {resumed && (
            <span
              title="Run recovered from a saved session"
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#5227FF]/30 bg-[#5227FF]/[0.12] px-2.5 py-1.5 text-[11.5px] font-medium text-[#a78bfa]"
            >
              <History className="h-3.5 w-3.5" />
              Resumed session
            </span>
          )}
        </header>

        <div className="h-px w-full bg-white/10" />

        {/* Body: step rail (left) + active step panel (right). */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-6 sm:px-8 lg:grid-cols-[280px_1fr]">
          {/* Rail */}
          <aside className="min-w-0">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-[12px] font-medium uppercase tracking-wide text-white/45">
                Journey
              </p>
              <span className="text-[11.5px] text-white/35">
                {Math.min(activeStep + 1, steps.length)} / {steps.length}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[#5227FF] transition-[width] duration-300"
                style={{ width: `${((activeStep + (finished ? 1 : 0)) / steps.length) * 100}%` }}
              />
            </div>
            <WorkbenchStepper steps={steps} activeIndex={activeStep} onSelect={goToStep} />
          </aside>

          {/* Active panel */}
          <div className="min-w-0">
            <div className="mb-4">
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-[#a78bfa]">
                Step {activeStep + 1} of {steps.length}
              </p>
              <h2 className="mt-0.5 text-[17px] font-semibold tracking-tight text-white">
                {active.title}
              </h2>
              {active.detail && (
                <p className="mt-1 text-[13px] leading-relaxed text-white/50">{active.detail}</p>
              )}
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-wrap break-words">{error}</span>
              </div>
            )}

            {finished ? (
              <FinishedPanel onBack={onBack} />
            ) : (
              <StepPanel
                step={active}
                stepIndex={activeStep}
                toolId={manifest.id}
                runId={runId}
                turns={turns}
                streaming={streaming}
                isLast={isLast}
                nextTitle={next?.title}
                onImprove={onImprove}
                onLooksGood={onLooksGood}
              />
            )}
          </div>
        </div>
      </GlassPanel>
    </section>
  );
}

interface StepPanelProps {
  step: ToolStep;
  stepIndex: number;
  toolId: string;
  runId: string;
  turns: ReturnType<typeof useRunStages>["turnsByStep"][number];
  streaming: boolean;
  isLast: boolean;
  nextTitle?: string;
  onImprove: (text: string) => void;
  onLooksGood: () => void;
}

// Maps a step to its presentational component by ui hint + index. Index 0 of a
// chat step is the intake Q&A; later chat steps are analysis responses.
function StepPanel({
  step,
  stepIndex,
  toolId,
  runId,
  turns,
  streaming,
  isLast,
  nextTitle,
  onImprove,
  onLooksGood,
}: StepPanelProps) {
  const ui = uiOf(step);
  const shared = { streaming, isLast, nextTitle, onImprove, onLooksGood };

  if (ui === "artifact-iframe") {
    return (
      <HtmlMockupStep toolId={toolId} runId={runId} step={step} turns={turns} {...shared} />
    );
  }
  if (ui === "file-cards") {
    return <PromptsStep toolId={toolId} runId={runId} turns={turns} {...shared} />;
  }
  // chat: step 0 is the intake Q&A; later chat steps are analysis responses.
  if (stepIndex === 0) {
    return <QnAStep turns={turns} {...shared} />;
  }
  return <AgentResponseStep turns={turns} {...shared} />;
}

function FinishedPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#34d399]/25 bg-[#34d399]/[0.06] px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#34d399]/15">
        <CheckCircle2 className="h-7 w-7 text-[#34d399]" />
      </span>
      <h3 className="mt-4 text-[16px] font-semibold text-white">Brand journey complete</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-white/55">
        Every stage is approved. Your prompts and assets are saved with this run.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        style={{ background: "#5227FF" }}
      >
        Back to tool
      </button>
    </div>
  );
}

function EndedPanel({ toolId, onBack }: { toolId?: string; onBack: () => void }) {
  return (
    <CenteredPanel>
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.06]">
        <AlertTriangle className="h-6 w-6 text-white/50" />
      </span>
      <p className="mt-3 text-[14px] font-medium text-white/80">This run has ended</p>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-white/45">
        Run sessions aren't resumable from a reload or direct link. Relaunch the tool to start a
        fresh journey.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-[13px] font-medium text-white/75 transition-colors hover:border-white/30 hover:text-white/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
      >
        {toolId ? "Back to tool" : "Back to Labs"}
      </button>
    </CenteredPanel>
  );
}

function CenteredPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <GlassPanel className="w-full max-w-[1180px]">
        <div className="flex h-full flex-col items-center justify-center text-center">{children}</div>
      </GlassPanel>
    </section>
  );
}
