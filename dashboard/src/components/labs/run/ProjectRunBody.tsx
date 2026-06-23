import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FolderOpen, AlertTriangle } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { manifestToTool } from "@/lib/labs";
import { TOOL_ICONS } from "@/components/labs/toolIcon";
import {
  runTool,
  projectArtifactRawUrl,
  getProjectArtifacts,
  type ToolManifest,
  type ToolStep,
  type ArtifactFile,
  type StepUi,
} from "@/lib/labs/toolsClient";
import { WorkbenchStepper } from "@/components/labs/WorkbenchStepper";
import { HtmlMockupStep } from "@/components/labs/run/HtmlMockupStep";
import { PromptsStep } from "@/components/labs/run/PromptsStep";
import { ProjectStageDoc } from "@/components/labs/run/ProjectStageDoc";
import { ImproveApproveBar } from "@/components/labs/run/ImproveApproveBar";
import {
  computeStageStates,
  lastArtifactStep,
  reviewDoneIndices,
  type StageState,
} from "@/components/labs/run/projectStages";

interface ProjectRunBodyProps {
  manifest: ToolManifest;
  brandId: string;
  brand: string;
  artifacts: ArtifactFile[];
  onBack: () => void;
}

function uiOf(step: ToolStep): StepUi {
  if (step.ui === "artifact-iframe" || step.ui === "file-cards") return step.ui;
  return "chat";
}

// All artifact filenames produced so far (for the "the folder already contains…"
// preamble the agent reads for context).
function allArtifactNames(states: StageState[]): string[] {
  return states.flatMap((s) => (s.file ? [s.file.name] : []));
}

// Seed for ADVANCING from the current project to the NEXT stage. Lists the done
// stages + their artifacts and tells the agent to proceed to the next stage.
function buildAdvanceSeed(
  steps: ToolStep[],
  states: StageState[],
  activeStep: number,
): string {
  const doneTitles = states.flatMap((s, i) => (s.done ? [steps[i].title] : []));
  const files = allArtifactNames(states);
  const nextStep = steps[activeStep + 1] ?? steps[activeStep];
  const nextTitle = nextStep?.title ?? "the next stage";
  const fileList = files.length > 0 ? files.join(", ") : "the existing stage files";
  const doneList = doneTitles.length > 0 ? doneTitles.join(", ") : "the earlier stages";
  return (
    `The brand folder already contains ${fileList}. ` +
    `Stages ${doneList} are COMPLETE — read those files for context and do NOT redo them. ` +
    `Proceed to the next stage: ${nextTitle}.`
  );
}

// Seed for REFINING the CURRENT (active, last-artifact) stage in place — the
// agent re-reads the prior + current artifacts, applies the user's feedback to
// THIS stage only, and re-saves the stage artifact(s) without advancing.
function buildRefineSeed(
  steps: ToolStep[],
  states: StageState[],
  activeStep: number,
  feedback: string,
): string {
  const earlierTitles = states.flatMap((s, i) =>
    s.done && i < activeStep ? [steps[i].title] : [],
  );
  const files = allArtifactNames(states);
  const activeTitle = steps[activeStep]?.title ?? "this stage";
  const activeFiles = states[activeStep]?.file ? [states[activeStep].file!.name] : [];
  const fileList = files.length > 0 ? files.join(", ") : "the existing stage files";
  const earlierList =
    earlierTitles.length > 0 ? `Stages ${earlierTitles.join(", ")} are COMPLETE. ` : "";
  const activeFileList =
    activeFiles.length > 0 ? activeFiles.join(", ") : "the current stage file";
  return (
    `The brand folder already contains ${fileList}. ${earlierList}` +
    `The CURRENT stage is ${activeTitle} and it already produced ${activeFileList} — ` +
    `READ them and the prior artifacts, then apply this refinement to THIS stage ` +
    `(do not advance): ${feedback}. Re-save the stage artifact(s).`
  );
}

// ProjectRunBody — opens an EXISTING project (brand) from artifacts on disk, with
// no live run. Autofills step completion from the brand's artifacts, renders each
// done stage read-only (chat stages show their produced .md; the mockup + prompt
// stages reuse the live components with a project-scoped artifact resolver), and
// offers "Continue from here" on the first incomplete stage — which launches a
// fresh run seeded with the already-done stages and navigates into it.
export function ProjectRunBody({
  manifest,
  brandId,
  brand,
  artifacts,
  onBack,
}: ProjectRunBodyProps) {
  const navigate = useNavigate();

  const steps = useMemo<ToolStep[]>(
    () =>
      manifest.steps && manifest.steps.length > 0
        ? manifest.steps
        : [{ id: "run", title: "Run", ui: "chat" }],
    [manifest.steps],
  );

  const states = useMemo(() => computeStageStates(steps, artifacts), [steps, artifacts]);
  // The CURRENT (active, editable) step is the highest-index step that produced
  // an artifact — the most recently worked-on stage.
  const lastStep = useMemo(() => lastArtifactStep(states), [states]);

  const [activeStep, setActiveStep] = useState(lastStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Locked review steps = every artifact-bearing step except the CURRENT one,
  // which stays interactive. Recomputed against the live active step so moving
  // the rail keeps the focused stage editable.
  const doneIndices = useMemo(
    () => reviewDoneIndices(states, activeStep),
    [states, activeStep],
  );

  const tool = manifestToTool(manifest);
  const Icon = TOOL_ICONS[tool.icon];

  const active = steps[Math.min(activeStep, steps.length - 1)];
  const activeState = states[Math.min(activeStep, states.length - 1)];
  const isActiveCurrent = activeStep === lastStep; // the editable stage
  const isLast = activeStep >= steps.length - 1;
  const doneCount = states.filter((s) => s.done).length;

  // Project-scoped resolvers shared by the reused step components.
  const artifactSrc = useCallback(
    (relpath: string) => projectArtifactRawUrl(manifest.id, brandId, relpath),
    [manifest.id, brandId],
  );
  const listArtifacts = useCallback(
    (signal?: AbortSignal) => getProjectArtifacts(manifest.id, brandId, signal),
    [manifest.id, brandId],
  );

  // Launch a fresh seeded run and navigate into it (WITH nav state so
  // BrandMakerRun opens it as a live run, not project mode). Shared by both
  // "Improve" (refine in place) and "Looks Good / Continue" (advance).
  const launchSeeded = useCallback(
    async (seed: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const { run_id, session_id } = await runTool(manifest.id, { brand }, { seed });
        navigate(`/labs/${manifest.id}/${brandId}`, {
          state: { runId: run_id, sessionId: session_id, manifest, brand },
        });
      } catch (err: unknown) {
        setBusy(false);
        setError(err instanceof Error ? err.message : "Could not continue this project.");
      }
    },
    [busy, manifest, brand, brandId, navigate],
  );

  // Improve: refine the CURRENT stage in place (re-save its artifact, no advance).
  const onImprove = useCallback(
    (feedback: string) => {
      void launchSeeded(buildRefineSeed(steps, states, activeStep, feedback));
    },
    [launchSeeded, steps, states, activeStep],
  );

  // Looks Good / Continue: advance to the next stage.
  const onContinue = useCallback(() => {
    void launchSeeded(buildAdvanceSeed(steps, states, activeStep));
  }, [launchSeeded, steps, states, activeStep]);

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
            <p className="truncate text-[13px] text-white/50">Project: {brand}</p>
          </div>

          <span
            title="Opened from saved project artifacts"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#34d399]/30 bg-[#34d399]/[0.10] px-2.5 py-1.5 text-[11.5px] font-medium text-[#34d399]"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Project — {brand}
          </span>
        </header>

        <div className="h-px w-full bg-white/10" />

        {/* Body: step rail (left) + active stage panel (right). */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-6 sm:px-8 lg:grid-cols-[280px_1fr]">
          {/* Rail */}
          <aside className="min-w-0">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-[12px] font-medium uppercase tracking-wide text-white/45">
                Journey
              </p>
              <span className="text-[11.5px] text-white/35">
                {doneCount} / {steps.length} done
              </span>
            </div>
            <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[#34d399] transition-[width] duration-300"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            <WorkbenchStepper
              steps={steps}
              activeIndex={activeStep}
              doneIndices={doneIndices}
              onSelect={setActiveStep}
            />
          </aside>

          {/* Active stage */}
          <div className="min-w-0">
            <div className="mb-4">
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-[#a78bfa]">
                Step {activeStep + 1} of {steps.length}
                {isActiveCurrent
                  ? " · current"
                  : activeState?.done
                    ? " · complete"
                    : " · not started"}
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

            <ProjectStagePanel
              step={active}
              stepIndex={activeStep}
              state={activeState}
              toolId={manifest.id}
              brandId={brandId}
              artifactSrc={artifactSrc}
              listArtifacts={listArtifacts}
              // The current (last-artifact) stage is editable; refining or
              // approving it launches a seeded live run. Earlier stages are
              // locked read-only review.
              editable={isActiveCurrent}
              isLast={isLast}
              busy={busy}
              nextTitle={steps[activeStep + 1]?.title}
              onImprove={onImprove}
              onContinue={onContinue}
            />
          </div>
        </div>
      </GlassPanel>
    </section>
  );
}

interface ProjectStagePanelProps {
  step: ToolStep;
  stepIndex: number;
  state: StageState | undefined;
  toolId: string;
  brandId: string;
  artifactSrc: (relpath: string) => string;
  listArtifacts: (signal?: AbortSignal) => Promise<ArtifactFile[]>;
  /** The current (last-artifact) stage is editable; earlier stages are locked
   * read-only review. */
  editable: boolean;
  isLast: boolean;
  busy: boolean;
  nextTitle?: string;
  onImprove: (feedback: string) => void;
  onContinue: () => void;
}

// Renders a single stage in project mode. The CURRENT (editable) stage shows its
// normal interactive component (mockup iframe / prompt cards with the
// Improve/Approve bar, or the produced .md plus a bar for chat stages) so the
// user can refine it (launches a seeded live run) or advance. Earlier stages
// render read-only via ProjectStageDoc / read-only HtmlMockup/Prompts. All views
// are driven by the project-scoped artifact resolver (no run id / live stream).
function ProjectStagePanel({
  step,
  stepIndex,
  state,
  toolId,
  brandId,
  artifactSrc,
  listArtifacts,
  editable,
  isLast,
  busy,
  nextTitle,
  onImprove,
  onContinue,
}: ProjectStagePanelProps) {
  const ui = uiOf(step);
  // `runId` is unused by the reused components in project mode (resolvers take
  // over) but the prop is required; brandId is a harmless, stable placeholder.
  const shared = {
    toolId,
    runId: brandId,
    turns: [],
    // `streaming` doubles as the bar's busy/lock state — true while a seeded run
    // is being launched so the user can't double-submit.
    streaming: busy,
    isLast,
    nextTitle,
    onImprove,
    onLooksGood: onContinue,
    artifactSrc,
    listArtifacts,
  };

  if (ui === "artifact-iframe") {
    return <HtmlMockupStep step={step} readOnly={!editable} {...shared} />;
  }
  if (ui === "file-cards") {
    return <PromptsStep readOnly={!editable} {...shared} />;
  }
  // chat stage: render the produced markdown. When this is the current stage,
  // add the Improve/Approve bar so the user can refine or advance it.
  const file = state?.file ?? null;
  return (
    <div className="space-y-4" key={`doc-${stepIndex}`}>
      <ProjectStageDoc
        fileName={file?.name}
        src={file ? artifactSrc(file.relpath) : null}
      />
      {editable && (
        <ImproveApproveBar
          streaming={busy}
          isLast={isLast}
          nextTitle={nextTitle}
          placeholder="Tell the agent how to refine this stage…"
          onImprove={onImprove}
          onLooksGood={onContinue}
        />
      )}
    </div>
  );
}
