import {
  Lightbulb,
  Telescope,
  ClipboardList,
  PenTool,
  Scale,
  ScrollText,
} from "lucide-react";
import {
  CREATIVE_AGENTS,
  CREATIVE_STATUS_META,
  type CreativeAgentSeed,
} from "@/lib/brainstorm";

const ICONS = {
  lightbulb: Lightbulb,
  telescope: Telescope,
  clipboard: ClipboardList,
  pen: PenTool,
  scale: Scale,
  scroll: ScrollText,
} as const;

// AgentHome — the left panel: the team of creative + productive agents refining
// the idea into a PRD. Each shows its role, live status, and current task.
export function AgentHome() {
  const active = CREATIVE_AGENTS.filter((a) => a.status !== "idle").length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
          Agent home
        </p>
        <p className="mt-0.5 text-[12px] text-white/50">
          {active} of {CREATIVE_AGENTS.length} agents refining
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {CREATIVE_AGENTS.map((agent) => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

function AgentRow({ agent }: { agent: CreativeAgentSeed }) {
  const Icon = ICONS[agent.icon];
  const status = CREATIVE_STATUS_META[agent.status];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: `${status.color}1f` }}
        >
          <Icon className="h-4 w-4" style={{ color: status.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-white/90">
              {agent.name}
            </span>
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/55">
              {agent.role}
            </span>
          </div>
        </div>
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
          style={{ background: status.color }}
          title={status.label}
        />
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-white/45">{agent.task}</p>
    </div>
  );
}
