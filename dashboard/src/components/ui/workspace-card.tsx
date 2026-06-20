import { GitBranch, Cpu, ListTodo, ArrowRight, X } from "lucide-react";
import {
  type Workspace,
  languageColor,
  STATUS_META,
} from "@/lib/workspaces";

interface WorkspaceCardProps {
  workspace: Workspace;
  onOpen?: (id: string) => void;
  onRemove?: (id: string) => void;
}

// WorkspaceCard — a single project tile inside the Code screen's glass panel.
// Colored language rail, status pill, path, and a meta row (branch · agents ·
// tasks · last opened). Hover lifts the tile, brightens the border, and slides
// in an open affordance.
export function WorkspaceCard({ workspace, onOpen, onRemove }: WorkspaceCardProps) {
  const accent = languageColor(workspace.language);
  const status = STATUS_META[workspace.status];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(workspace.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(workspace.id);
        }
      }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 pl-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_18px_50px_rgba(0,0,0,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/70"
    >
      {/* language accent rail */}
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[3px] rounded-full"
        style={{ background: accent }}
      />

      {/* remove (mockup) */}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${workspace.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(workspace.id);
          }}
          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white/40 opacity-0 transition-all duration-200 hover:bg-white/10 hover:text-white/80 group-hover:opacity-100 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* header: name + status */}
      <div className="flex items-center gap-2.5 pr-6">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
        />
        <h3 className="truncate text-[15px] font-semibold tracking-tight text-white">
          {workspace.name}
        </h3>
      </div>

      <p className="mt-1 truncate font-mono text-xs text-white/45">
        {workspace.path}
      </p>

      {/* status pill */}
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
          style={{ background: status.color }}
        />
        <span className="text-[11px] font-medium text-white/70">{status.label}</span>
      </div>

      {/* meta row */}
      <div className="mt-4 flex items-center gap-4 text-xs text-white/55">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-white/40" />
          <span className="truncate">{workspace.branch}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-white/40" />
          {workspace.agents}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ListTodo className="h-3.5 w-3.5 text-white/40" />
          {workspace.openTasks}
        </span>

        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-white/40">
          {workspace.lastOpened}
          <ArrowRight className="h-4 w-4 -translate-x-1 text-white/30 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-white/70 group-hover:opacity-100" />
        </span>
      </div>
    </div>
  );
}
