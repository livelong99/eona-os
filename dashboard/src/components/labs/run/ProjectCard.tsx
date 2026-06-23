import { useEffect, useState } from "react";
import { FolderOpen, Check, CircleDot, Clock } from "lucide-react";
import {
  getProjectArtifacts,
  type Project,
  type ToolStep,
  type ArtifactFile,
} from "@/lib/labs/toolsClient";
import { computeStageStates } from "@/components/labs/run/projectStages";

interface ProjectCardProps {
  toolId: string;
  project: Project;
  steps: ToolStep[];
  onOpen: () => void;
}

// Relative "x ago" from an ISO string or epoch (seconds or ms). The engine sends
// `updated` as a numeric mtime, so coerce to string first — calling .trim() on a
// number throws and (with no error boundary) blanks the whole screen.
function relativeTime(value: string | number): string {
  const raw = value == null ? "" : String(value);
  if (!raw) return "";
  let ms: number;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && raw.trim() !== "") {
    ms = asNum < 1e12 ? asNum * 1000 : asNum; // seconds vs ms heuristic
  } else {
    ms = Date.parse(raw);
  }
  if (!Number.isFinite(ms)) return raw;
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ProjectCard — one existing brand. Shows its name, artifact count, relative
// "updated", and a compact row of step dots (done vs not). Done-ness is computed
// from a lazy per-card fetch of the brand's artifacts matched against the
// manifest steps' globs. Click opens the project in the run screen.
export function ProjectCard({ toolId, project, steps, onOpen }: ProjectCardProps) {
  const [files, setFiles] = useState<ArtifactFile[] | null>(null);

  // Lazy, best-effort: fetch the brand's artifacts to light the precise dots.
  // Failure leaves dots in their "unknown" (upcoming) state — count still shows.
  useEffect(() => {
    const controller = new AbortController();
    getProjectArtifacts(toolId, project.id, controller.signal)
      .then((f) => !controller.signal.aborted && setFiles(f))
      .catch(() => {});
    return () => controller.abort();
  }, [toolId, project.id]);

  const states = files ? computeStageStates(steps, files) : null;
  const doneCount = states ? states.filter((s) => s.done).length : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open project ${project.name}`}
      className="group flex w-full flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.04] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-[#5227FF]/[0.12]">
          <FolderOpen className="h-5 w-5 text-[#a78bfa]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-white/90">{project.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-white/45">
            <span>
              {project.artifact_count} file{project.artifact_count === 1 ? "" : "s"}
            </span>
            {project.updated && (
              <>
                <span className="text-white/25">·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {relativeTime(project.updated)}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Step dots: done (teal check) vs not-yet (muted). */}
      <div className="flex items-center gap-1.5">
        {steps.map((step, i) => {
          const done = states ? states[i]?.done : false;
          return (
            <span
              key={step.id || i}
              title={`${step.title}${done ? " · done" : ""}`}
              className={[
                "grid h-5 w-5 place-items-center rounded-md transition-colors",
                done ? "bg-[#34d399]/20 text-[#34d399]" : "bg-white/[0.05] text-white/35",
              ].join(" ")}
            >
              {done ? <Check className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
            </span>
          );
        })}
        {states && (
          <span className="ml-1 text-[11px] text-white/40">
            {doneCount}/{steps.length}
          </span>
        )}
      </div>
    </button>
  );
}
