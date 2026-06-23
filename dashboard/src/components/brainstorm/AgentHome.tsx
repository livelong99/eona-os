import {
  Brain,
  Lightbulb,
  Wrench,
  ShieldAlert,
  Map as MapIcon,
  Bot,
  Layers,
} from "lucide-react";
import type { AgentLane, LaneStatus } from "./useBrainstormRun";
import { ALL_AGENTS } from "./ExecutionConsole";

const STATUS_META: Record<LaneStatus, { label: string; color: string; pulse: boolean }> = {
  thinking: { label: "Thinking", color: "#a78bfa", pulse: true },
  writing: { label: "Writing", color: "#34d399", pulse: true },
  reviewing: { label: "Reviewing", color: "#4f8cff", pulse: true },
  idle: { label: "Idle", color: "#8a8fa3", pulse: false },
  done: { label: "Done", color: "#34d399", pulse: false },
};

// The specialists the PM spawns — shown as a queued roster before they appear in
// the live lanes, so the swarm is legible from the first moment.
const ROSTER: { metric: string; label: string }[] = [
  { metric: "creativity", label: "Creativity" },
  { metric: "feasibility", label: "Feasibility" },
  { metric: "reliability", label: "Reliability" },
  { metric: "roadmap", label: "Roadmap" },
];

function metricIcon(metric?: string, isPm = false) {
  if (isPm) return Brain;
  switch (metric) {
    case "creativity":
      return Lightbulb;
    case "feasibility":
      return Wrench;
    case "reliability":
      return ShieldAlert;
    case "roadmap":
      return MapIcon;
    default:
      return Bot;
  }
}

interface AgentHomeProps {
  lanes: AgentLane[];
  /** Currently selected lane id (ALL_AGENTS shows every agent). */
  selectedId: string;
  onSelect: (id: string) => void;
}

// AgentHome — the left panel: the live swarm. The Sage PM plus each specialist,
// each with its role and live status. Click an agent to focus the execution view
// on just that agent's run; "All agents" shows the whole swarm.
export function AgentHome({ lanes, selectedId, onSelect }: AgentHomeProps) {
  const active = lanes.filter((l) => l.active).length;
  const liveMetrics = new Set(lanes.map((l) => l.metric).filter(Boolean));
  const queued = ROSTER.filter((r) => !liveMetrics.has(r.metric));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
          Swarm
        </p>
        <p className="mt-0.5 text-[12px] text-white/50">
          {active > 0 ? `${active} agent${active === 1 ? "" : "s"} working` : "Idle"}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <AllRow selected={selectedId === ALL_AGENTS} onClick={() => onSelect(ALL_AGENTS)} />
        {lanes.map((lane) => (
          <LaneRow
            key={lane.id}
            label={lane.label}
            role={lane.role}
            metric={lane.metric}
            isPm={lane.id === "pm"}
            status={lane.status}
            selected={selectedId === lane.id}
            onClick={() => onSelect(lane.id)}
          />
        ))}
        {queued.map((r) => (
          <LaneRow
            key={`queued-${r.metric}`}
            label={r.label}
            role="Specialist"
            metric={r.metric}
            isPm={false}
            status="idle"
            queued
            selected={selectedId === r.metric}
            onClick={() => onSelect(r.metric)}
          />
        ))}
      </div>
    </div>
  );
}

function AllRow({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl border bg-white/[0.02] p-3 text-left transition-colors cursor-pointer ${
        selected ? "border-white/30 bg-white/[0.06]" : "border-white/[0.06] hover:bg-white/[0.04]"
      }`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06]">
        <Layers className="h-4 w-4 text-white/70" />
      </span>
      <span className="text-[13px] font-semibold text-white/85">All agents</span>
    </button>
  );
}

function LaneRow({
  label,
  role,
  metric,
  isPm,
  status,
  selected,
  onClick,
  queued = false,
}: {
  label: string;
  role: string;
  metric?: string;
  isPm: boolean;
  status: LaneStatus;
  selected: boolean;
  onClick: () => void;
  queued?: boolean;
}) {
  const Icon = metricIcon(metric, isPm);
  const meta = STATUS_META[status];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border bg-white/[0.02] p-3 text-left transition-colors cursor-pointer ${
        selected
          ? "border-white/30 bg-white/[0.06]"
          : isPm
            ? "border-[#a78bfa]/25 hover:bg-white/[0.04]"
            : "border-white/[0.06] hover:bg-white/[0.04]"
      } ${queued ? "opacity-55" : ""}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: `${meta.color}1f` }}
        >
          <Icon className="h-4 w-4" style={{ color: meta.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-white/90">{label}</span>
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/55">
              {role}
            </span>
          </div>
        </div>
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.pulse ? "animate-pulse" : ""}`}
          style={{ background: meta.color }}
          title={queued ? "Queued" : meta.label}
        />
      </div>
    </button>
  );
}
