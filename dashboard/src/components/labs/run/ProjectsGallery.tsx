import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { getProjects, type Project, type ToolStep } from "@/lib/labs/toolsClient";
import { ProjectCard } from "@/components/labs/run/ProjectCard";

interface ProjectsGalleryProps {
  toolId: string;
  steps: ToolStep[];
  /** Swarm tools resume in the generic glass-box run screen, not the workbench. */
  swarm?: boolean;
}

type GalleryState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; projects: Project[] };

// ProjectsGallery — a section listing a tool's existing projects (brands). Each
// card opens that brand in the run screen (without router state, so the run
// screen opens it as an existing project and autofills from artifacts on disk).
export function ProjectsGallery({ toolId, steps, swarm }: ProjectsGalleryProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<GalleryState>({ phase: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    getProjects(toolId, controller.signal)
      .then((projects) => {
        if (controller.signal.aborted) return;
        setState({ phase: "ready", projects });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Could not load projects.",
        });
      });
    return () => controller.abort();
  }, [toolId, reloadKey]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-white/45">
          <FolderOpen className="h-4 w-4 text-white/55" />
          Projects
        </h2>
        {state.phase === "ready" && state.projects.length > 0 && (
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/55">
            {state.projects.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          aria-label="Refresh projects"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12px] font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {state.phase === "loading" && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-[13px] text-white/45">
          <Loader2 className="h-4 w-4 animate-spin text-[#a78bfa]" />
          Loading projects…
        </div>
      )}

      {state.phase === "error" && (
        <div className="flex items-center gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {state.message}
        </div>
      )}

      {state.phase === "ready" && state.projects.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.05]">
            <FolderOpen className="h-5 w-5 text-white/35" />
          </span>
          <p className="text-[13px] text-white/55">No projects yet</p>
          <p className="max-w-xs text-[12px] leading-relaxed text-white/40">
            Run the tool to create one — finished brands will show up here.
          </p>
        </div>
      )}

      {state.phase === "ready" && state.projects.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {state.projects.map((project) => (
            <ProjectCard
              key={project.id}
              toolId={toolId}
              project={project}
              steps={steps}
              onOpen={() => navigate(
                toolId === "flow-director" ? `/labs/flow/${toolId}/${project.id}`
                  : swarm ? `/labs/run/${toolId}/${project.id}`
                  : `/labs/${toolId}/${project.id}`,
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
