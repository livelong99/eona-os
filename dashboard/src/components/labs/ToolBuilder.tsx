import { useState } from "react";
import {
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Target,
  WandSparkles,
  Workflow,
  SlidersHorizontal,
  CircleCheck,
  Sparkles,
  Loader2,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { BUILDER_STAGES } from "@/lib/labs";
import {
  type BuilderState,
  EMPTY_BUILDER,
  stageComplete,
} from "@/components/labs/builderState";
import {
  IdentityStage,
  SkillStage,
  WorkflowStage,
  IOStage,
  ReviewStage,
} from "@/components/labs/BuilderStages";
import { RefineChat } from "@/components/labs/RefineChat";
import { RunConsole } from "@/components/labs/RunConsole";
import { buildTool } from "@/lib/labs/toolsClient";

interface ToolBuilderProps {
  onClose: () => void;
  /** Called once the build run completes — receives the engine tool id. */
  onPublished: (toolId: string) => void;
  /** Optional seed (e.g. the Brand Maker template). */
  seed?: BuilderState;
}

const STAGE_ICONS: Record<string, LucideIcon> = {
  target: Target,
  wand: WandSparkles,
  workflow: Workflow,
  sliders: SlidersHorizontal,
  check: CircleCheck,
  sparkles: Sparkles,
};

// The publish lifecycle, owned by the builder: idle → building (stream run) →
// done (notify parent) | error (let the user retry).
type Publish =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "building"; toolId: string; runId: string }
  | { phase: "error"; message: string };

// ToolBuilder — a full-screen glass wizard for authoring a new tool. Left: a
// vertical stepper rail (Identity → Skill & goals → Workflow → I/O → Review →
// Refine). Right: the active stage's form, with Back/Next footer navigation.
// Publish materializes the tool via the engine and streams the build run.
export function ToolBuilder({ onClose, onPublished, seed }: ToolBuilderProps) {
  const [state, setState] = useState<BuilderState>(seed ?? EMPTY_BUILDER);
  const [stage, setStage] = useState(0);
  const [publish, setPublish] = useState<Publish>({ phase: "idle" });

  const set = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const canAdvance = stageComplete(stage, state);
  const isLast = stage === BUILDER_STAGES.length - 1;
  const publishing = publish.phase === "starting" || publish.phase === "building";

  const startPublish = async () => {
    setPublish({ phase: "starting" });
    try {
      const { tool_id, run_id } = await buildTool(state);
      setPublish({ phase: "building", toolId: tool_id, runId: run_id });
    } catch (err: unknown) {
      setPublish({
        phase: "error",
        message: err instanceof Error ? err.message : "Build failed to start.",
      });
    }
  };

  const next = () => {
    if (isLast) startPublish();
    else if (canAdvance) setStage((s) => s + 1);
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden rounded-[28px] p-5"
      style={{ background: "rgba(2,3,8,0.6)" }}
      onClick={publishing ? undefined : onClose}
    >
      <div
        className="flex h-full max-h-[720px] w-[min(960px,100%)] overflow-hidden rounded-2xl border border-white/12"
        style={{
          background: "rgba(14,15,23,0.92)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          boxShadow: "0 40px 140px rgba(0,0,0,0.65)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Stepper rail */}
        <aside className="hidden w-[280px] shrink-0 flex-col border-r border-white/10 bg-black/20 p-6 sm:flex">
          <div className="mb-7 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#5227FF]/20">
              <Sparkles className="h-5 w-5 text-[#a78bfa]" />
            </span>
            <div>
              <p className="text-[14px] font-semibold tracking-tight text-white">New tool</p>
              <p className="text-[11px] text-white/40">Labs workflow</p>
            </div>
          </div>

          <ol className="relative space-y-1">
            {BUILDER_STAGES.map((s, i) => {
              const Icon = STAGE_ICONS[s.icon];
              const done = i < stage && stageComplete(i, state);
              const active = i === stage;
              const locked = i > stage || publishing;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => !locked && setStage(i)}
                    disabled={locked}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200 ${
                      active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                    } ${locked ? "cursor-default opacity-50" : "cursor-pointer"}`}
                  >
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors ${
                        active
                          ? "border-[#5227FF]/60 bg-[#5227FF]/25 text-white"
                          : done
                            ? "border-[#34d399]/40 bg-[#34d399]/15 text-[#34d399]"
                            : "border-white/10 bg-white/[0.03] text-white/45"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[13px] font-medium ${active ? "text-white" : "text-white/75"}`}>
                        {s.title}
                      </span>
                      <span className="block text-[11px] leading-snug text-white/40">
                        {s.blurb}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11.5px] leading-relaxed text-white/40">
            Tools you build here become runnable from Labs and callable by any
            agent in a workspace.
          </div>
        </aside>

        {/* Stage content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="text-[12px] font-medium text-white/45">
              {publishing ? "Publishing" : `Step ${stage + 1} / ${BUILDER_STAGES.length}`}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={publishing}
              aria-label="Close builder"
              className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white/85 disabled:cursor-default disabled:opacity-30 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {/* While building, the run console takes over the body. */}
            {publish.phase === "building" ? (
              <div className="flex h-full min-h-[320px] flex-col">
                <p className="mb-3 text-[13px] text-white/55">
                  Materializing <span className="font-medium text-white/80">{state.name || "your tool"}</span> and
                  enriching it with the builder agent…
                </p>
                <RunConsole
                  runId={publish.runId}
                  title="Build run"
                  className="flex-1"
                  onComplete={() => onPublished(publish.toolId)}
                />
              </div>
            ) : (
              <>
                {stage === 0 && <IdentityStage state={state} set={set} />}
                {stage === 1 && <SkillStage state={state} set={set} />}
                {stage === 2 && <WorkflowStage state={state} set={set} />}
                {stage === 3 && <IOStage state={state} set={set} />}
                {stage === 4 && <ReviewStage state={state} />}
                {stage === 5 && (
                  <div className="flex h-full min-h-[360px] flex-col">
                    <div className="mb-3 shrink-0">
                      <h3 className="text-[15px] font-semibold text-white">Refine with the builder agent</h3>
                      <p className="mt-0.5 text-[12.5px] text-white/45">
                        Chat to critique and enrich the spec. When you're happy, publish to materialize it.
                      </p>
                    </div>
                    <RefineChat draft={state} className="flex-1" />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer nav */}
          <footer className="flex items-center justify-between border-t border-white/10 px-6 py-4">
            {publish.phase === "error" ? (
              <div className="flex w-full items-center gap-3">
                <div className="mr-auto flex items-center gap-2 text-[12.5px] text-[#f8a3a3]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {publish.message}
                </div>
                <button
                  type="button"
                  onClick={() => setPublish({ phase: "idle" })}
                  className="rounded-lg px-3 py-2 text-[13px] font-medium text-white/60 transition-colors hover:text-white/90 cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={startPublish}
                  className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors cursor-pointer"
                  style={{ background: "#5227FF" }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStage((s) => Math.max(0, s - 1))}
                  disabled={stage === 0 || publishing}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-white/60 transition-colors hover:text-white/90 disabled:cursor-default disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>

                <button
                  type="button"
                  onClick={next}
                  disabled={!canAdvance || publishing}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-all duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer"
                  style={{ background: isLast ? "#34d399" : "#5227FF" }}
                >
                  {publishing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Publishing…
                    </>
                  ) : isLast ? (
                    <>
                      <Check className="h-4 w-4" />
                      Publish to Labs
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
