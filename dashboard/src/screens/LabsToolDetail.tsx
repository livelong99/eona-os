import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Workflow,
  FileInput,
  FileOutput,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { manifestToTool, FIELD_TYPE_META, type FieldType } from "@/lib/labs";
import { TOOL_ICONS } from "@/components/labs/toolIcon";
import { ToolRunForm } from "@/components/labs/ToolRunForm";
import { ProjectsGallery } from "@/components/labs/run/ProjectsGallery";
import {
  getTool,
  runTool,
  deleteTool,
  type ToolManifest,
  type ToolInput,
} from "@/lib/labs/toolsClient";

type Load =
  | { phase: "loading" }
  | { phase: "ready"; manifest: ToolManifest }
  | { phase: "error"; message: string };

// The launch lifecycle. On success we navigate to the dedicated run screen, so
// there's no inline "running" phase here.
type RunState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "error"; message: string };

// kebab — lowercase, non-alphanumerics → "-", collapse repeats, trim edges.
function kebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// LabsToolDetail — loads a tool's full manifest from the engine and renders its
// workflow + I/O, a dynamic launch form, a live run console, and Delete.
export function LabsToolDetail({ toolId }: { toolId?: string } = {}) {
  // `toolId` is supplied by the dedicated dock routes (/brand-maker, /flow-director);
  // otherwise the tool comes from the /labs/:id route param.
  const { id: paramId } = useParams();
  const id = toolId ?? paramId;
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchTool = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      setLoad({ phase: "loading" });
      try {
        const manifest = await getTool(id, signal);
        if (signal?.aborted) return;
        setLoad({ phase: "ready", manifest });
      } catch (err: unknown) {
        if (signal?.aborted) return;
        setLoad({
          phase: "error",
          message: err instanceof Error ? err.message : "Could not load this tool.",
        });
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchTool(controller.signal);
    return () => controller.abort();
  }, [fetchTool]);

  const onRun = async (values: Record<string, unknown>) => {
    if (!id || load.phase !== "ready") return;
    const manifest = load.manifest;
    setRun({ phase: "starting" });
    try {
      const { run_id, session_id } = await runTool(id, values);
      // The project input becomes a kebab slug in the URL; run context rides in
      // nav state. Swarm tools → the generic glass-box SwarmToolRun screen;
      // legacy single-agent tools → the step-gated workbench run screen.
      const brand = String(values.brand ?? values.project ?? values.name ?? "");
      const brandId = kebab(brand) || "run";
      if (manifest.id === "flow-director") {
        // Dedicated cinematography run screen (prompt cards + vision review).
        navigate(`/labs/flow/${manifest.id}/${brandId}`, {
          state: { runId: run_id, name: brand, manifest },
        });
      } else if (manifest.swarm) {
        navigate(`/labs/run/${manifest.id}/${brandId}`, {
          state: { runId: run_id, name: brand, manifest },
        });
      } else {
        navigate(`/labs/${manifest.id}/${brandId}`, {
          state: { runId: run_id, sessionId: session_id, manifest, brand },
        });
      }
    } catch (err: unknown) {
      setRun({
        phase: "error",
        message: err instanceof Error ? err.message : "Run failed to start.",
      });
    }
  };

  const onDelete = async () => {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTool(id);
      navigate("/labs");
    } catch (err: unknown) {
      setDeleting(false);
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  if (load.phase === "loading") {
    return (
      <CenteredPanel>
        <Loader2 className="h-5 w-5 animate-spin text-white/50" />
        <p className="mt-3 text-sm text-white/50">Loading tool…</p>
      </CenteredPanel>
    );
  }

  if (load.phase === "error") {
    return (
      <CenteredPanel>
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f87171]/15">
          <AlertTriangle className="h-6 w-6 text-[#f87171]" />
        </span>
        <p className="mt-3 text-[14px] font-medium text-white/80">Couldn't load this tool</p>
        <p className="mt-1 text-[12.5px] text-white/45">{load.message}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/labs")}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white/90 cursor-pointer"
          >
            Back to Labs
          </button>
          <button
            type="button"
            onClick={() => fetchTool()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white/90 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </CenteredPanel>
    );
  }

  const manifest = load.manifest;
  const tool = manifestToTool(manifest);
  const Icon = TOOL_ICONS[tool.icon];
  const steps = manifest.steps ?? [];
  const inputs: ToolInput[] = manifest.inputs ?? [];

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <GlassPanel className="w-full max-w-[1080px]">
        {/* Header */}
        <header className="flex items-center gap-4 px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={() => navigate("/labs")}
            aria-label="Back to Labs"
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
            <p className="truncate text-[13px] text-white/50">{tool.tagline}</p>
          </div>

          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-white/12 px-3 py-2 text-[13px] font-medium text-white/60 transition-colors duration-200 hover:border-[#f87171]/40 hover:text-[#f8a3a3] disabled:cursor-default disabled:opacity-40 cursor-pointer"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </header>

        {deleteError && (
          <div className="mx-6 flex items-center gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3] sm:mx-8">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {deleteError}
          </div>
        )}

        <div className="mt-3 h-px w-full bg-white/10" />

        {/* Body: spec (left) + launch form (right). Launching navigates to the
            dedicated step-gated run screen. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Spec column */}
            <div className="space-y-6">
              {manifest.description && (
                <p className="text-[13.5px] leading-relaxed text-white/65">{manifest.description}</p>
              )}

              <div>
                <SectionTitle icon={<Workflow className="h-4 w-4" />}>Workflow</SectionTitle>
                {steps.length === 0 ? (
                  <p className="mt-3 text-[13px] text-white/40">No steps declared.</p>
                ) : (
                  <ol className="mt-3 space-y-2">
                    {steps.map((s, i) => (
                      <li
                        key={s.id || i}
                        className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#5227FF]/25 text-[11px] font-semibold text-white">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium text-white/90">{s.title}</p>
                          {s.detail && (
                            <p className="mt-0.5 text-[12px] leading-relaxed text-white/45">{s.detail}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div>
                <SectionTitle icon={<FileInput className="h-4 w-4" />}>Inputs</SectionTitle>
                <div className="mt-3 space-y-2">
                  {inputs.length === 0 ? (
                    <p className="text-[13px] text-white/40">No inputs.</p>
                  ) : (
                    inputs.map((f) => (
                      <FieldRow key={f.id} label={f.label || f.id} type={f.type} required={f.required} />
                    ))
                  )}
                </div>
              </div>

              {manifest.goals && manifest.goals.length > 0 && (
                <div>
                  <SectionTitle icon={<FileOutput className="h-4 w-4" />}>Goals</SectionTitle>
                  <ul className="mt-3 space-y-1.5">
                    {manifest.goals.map((g, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-white/70">
                        <span className="text-[#5227FF]">•</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Run column */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <SectionTitle icon={<FileInput className="h-4 w-4" />}>Run this tool</SectionTitle>
                <div className="mt-4">
                  <ToolRunForm
                    toolId={manifest.id}
                    inputs={inputs}
                    busy={run.phase === "starting"}
                    onRun={onRun}
                  />
                </div>
                {run.phase === "error" && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {run.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Existing projects (brands) — open one to review or continue it. */}
          <div className="mt-8">
            <ProjectsGallery toolId={manifest.id} steps={steps} swarm={manifest.swarm} />
          </div>
        </div>
      </GlassPanel>
    </section>
  );
}

function CenteredPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <GlassPanel className="w-full max-w-[1080px]">
        <div className="flex h-full flex-col items-center justify-center text-center">{children}</div>
      </GlassPanel>
    </section>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-white/45">
      <span className="text-white/55">{icon}</span>
      {children}
    </h2>
  );
}

// A type label, tolerant of manifest types outside the FieldType union.
function typeLabel(type: string): string {
  return FIELD_TYPE_META[type as FieldType]?.label ?? type;
}

function FieldRow({ label, type, required }: { label: string; type: string; required?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <span className="flex items-center gap-1.5 text-[13px] text-white/80">
        {label}
        {required && <span className="text-[#f87171]">*</span>}
      </span>
      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/55">
        {typeLabel(type)}
      </span>
    </div>
  );
}
