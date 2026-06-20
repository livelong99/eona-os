import { Play, Workflow, Zap } from "lucide-react";
import { type Tool, TOOL_STATUS_META } from "@/lib/labs";
import { TOOL_ICONS } from "@/components/labs/toolIcon";

interface ToolCardProps {
  tool: Tool;
  onOpen: (id: string) => void;
}

// ToolCard — one created tool in the Labs gallery. Shows its icon (tinted to the
// tool's accent), category, status, and run/step counts. Hover lifts + reveals a
// Run affordance.
export function ToolCard({ tool, onOpen }: ToolCardProps) {
  const Icon = TOOL_ICONS[tool.icon];
  const status = TOOL_STATUS_META[tool.status];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(tool.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(tool.id);
        }
      }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_18px_50px_rgba(0,0,0,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/70"
    >
      {/* accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-40 blur-3xl transition-opacity duration-300 group-hover:opacity-70"
        style={{ background: tool.accent }}
      />

      <div className="relative flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10"
          style={{ background: `${tool.accent}22` }}
        >
          <Icon className="h-5 w-5" style={{ color: tool.accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-white">
              {tool.name}
            </h3>
          </div>
          <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">
            {tool.category}
          </span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10.5px] font-medium text-white/70">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
            style={{ background: status.color }}
          />
          {status.label}
        </span>
      </div>

      <p className="relative mt-3 line-clamp-2 text-[13px] leading-relaxed text-white/50">
        {tool.tagline}
      </p>

      <div className="relative mt-4 flex items-center gap-4 border-t border-white/[0.06] pt-3.5 text-[12px] text-white/50">
        <span className="inline-flex items-center gap-1.5">
          <Workflow className="h-3.5 w-3.5 text-white/40" />
          {tool.steps} steps
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-white/40" />
          {tool.runs} runs
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-white/40 transition-colors group-hover:text-[#a78bfa]">
          <Play className="h-3.5 w-3.5" />
          Run
        </span>
      </div>
    </div>
  );
}
