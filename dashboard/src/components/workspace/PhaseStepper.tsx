import { Check, Loader, Circle } from "lucide-react";
import type { WorkspacePhase } from "@/lib/workspace/workspaceClient";

// Coarse pipeline stages (the workspace.json phase maps to one of these).
const STAGES: { key: string; label: string; phases: WorkspacePhase[] }[] = [
  { key: "setup", label: "Setup", phases: ["ingesting", "provisioning", "documenting", "ready", "working"] },
  { key: "design", label: "Design", phases: ["designing", "design-qna", "design-review", "design-approved"] },
  { key: "sprint", label: "Sprint", phases: ["sprint-planning", "sprint-qna", "sprint-approved"] },
  { key: "implement", label: "Implement", phases: ["implementing"] },
  { key: "done", label: "Done", phases: ["done"] },
];

function stageIndex(phase: WorkspacePhase | null): number {
  if (!phase) return 0;
  const i = STAGES.findIndex((s) => s.phases.includes(phase));
  return i < 0 ? 0 : i;
}

export function PhaseStepper({ phase }: { phase: WorkspacePhase | null }) {
  const active = stageIndex(phase);
  return (
    <div className="flex items-center gap-1 px-1">
      {STAGES.map((s, i) => {
        const done = i < active || phase === "done";
        const isActive = i === active && phase !== "done";
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium ${
                isActive
                  ? "bg-white/10 text-white"
                  : done
                    ? "text-[#34d399]"
                    : "text-white/40"
              }`}
            >
              {done ? (
                <Check className="h-3.5 w-3.5" />
              ) : isActive ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
              {s.label}
            </div>
            {i < STAGES.length - 1 && (
              <span className={`h-px w-4 ${i < active ? "bg-[#34d399]/50" : "bg-white/12"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
