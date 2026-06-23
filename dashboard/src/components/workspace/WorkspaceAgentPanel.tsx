import {
  Building2,
  ClipboardList,
  Layout,
  Server,
  BarChart3,
  Search,
  FlaskConical,
  Eye,
  Palette,
  Layers,
  Bot,
} from "lucide-react";
import type { AgentLane, LaneStatus } from "@/components/brainstorm/useBrainstormRun";
import { ALL_AGENTS } from "@/components/brainstorm/ExecutionConsole";
import type { WorkspaceTeamMember } from "@/lib/workspace/workspaceClient";

const STATUS_META: Record<LaneStatus, { label: string; color: string; pulse: boolean }> = {
  thinking: { label: "Thinking", color: "#a78bfa", pulse: true },
  writing: { label: "Working", color: "#34d399", pulse: true },
  reviewing: { label: "Reviewing", color: "#4f8cff", pulse: true },
  idle: { label: "Idle", color: "#8a8fa3", pulse: false },
  done: { label: "Done", color: "#34d399", pulse: false },
};

// The default team (also the fallback before workspace.json.team is written). Each
// entry maps an agent slug → the lane metric the orchestrator's spawn resolves to.
const DEFAULT_ROSTER: { slug: string; label: string; metric?: string; isMain?: boolean }[] = [
  { slug: "architect", label: "Architect", isMain: true },
  { slug: "pm", label: "PM", metric: "pm" },
  { slug: "ux-designer", label: "UX Designer", metric: "ux" },
  { slug: "frontend-dev", label: "Frontend Dev", metric: "frontend" },
  { slug: "backend-dev", label: "Backend Dev", metric: "backend" },
  { slug: "analyst", label: "Analyst", metric: "analyst" },
  { slug: "researcher", label: "Researcher", metric: "researcher" },
  { slug: "test-architect", label: "Test Architect", metric: "test" },
  { slug: "code-reviewer", label: "Code Reviewer", metric: "review" },
];

const SLUG_TO_METRIC: Record<string, string> = {
  pm: "pm",
  "ux-designer": "ux",
  "frontend-dev": "frontend",
  "backend-dev": "backend",
  analyst: "analyst",
  researcher: "researcher",
  "test-architect": "test",
  "code-reviewer": "review",
};

function metricIcon(metric?: string, isMain = false) {
  if (isMain) return Building2;
  switch (metric) {
    case "pm": return ClipboardList;
    case "ux": return Palette;
    case "frontend": return Layout;
    case "backend": return Server;
    case "analyst": return BarChart3;
    case "researcher": return Search;
    case "test": return FlaskConical;
    case "review": return Eye;
    default: return Bot;
  }
}

interface RosterEntry {
  slug: string;
  name: string;
  role?: string;
  metric?: string;
  isMain: boolean;
}

interface Props {
  lanes: AgentLane[];
  /** The provisioned team from workspace.json (real persona names). */
  team?: WorkspaceTeamMember[];
  selectedId: string;
  onSelect: (id: string) => void;
}

// WorkspaceAgentPanel — the left panel. Always lists the FULL team (from
// workspace.json.team once provisioned, else the default roster), each row
// reflecting its live status when it's running and an idle state otherwise.
export function WorkspaceAgentPanel({ lanes, team, selectedId, onSelect }: Props) {
  const roster: RosterEntry[] =
    team && team.length > 0
      ? team.map((m) => ({
          slug: m.id,
          name: m.name || m.role || m.id,
          role: m.role,
          metric: m.id === "architect" ? undefined : SLUG_TO_METRIC[m.id] ?? m.id,
          isMain: m.id === "architect",
        }))
      : DEFAULT_ROSTER.map((r) => ({
          slug: r.slug,
          name: r.label,
          role: r.label,
          metric: r.metric,
          isMain: Boolean(r.isMain),
        }));

  // Resolve each roster entry's live lane (main → the "architect" lane; specialist
  // → the lane keyed by its metric). Track which lanes are accounted for so any
  // unexpected extra lane still shows.
  const used = new Set<string>();
  const rows = roster.map((r) => {
    const lane = r.isMain
      ? lanes.find((l) => l.id === "architect")
      : lanes.find((l) => l.metric && l.metric === r.metric);
    if (lane) used.add(lane.id);
    return { entry: r, lane };
  });
  const extras = lanes.filter((l) => !used.has(l.id) && l.id !== "architect");
  const activeCount = lanes.filter((l) => l.active).length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">Team</p>
        <p className="mt-0.5 text-[12px] text-white/50">
          {activeCount > 0 ? `${activeCount} working` : `${roster.length} agents`}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <AllRow selected={selectedId === ALL_AGENTS} onClick={() => onSelect(ALL_AGENTS)} />
        {rows.map(({ entry, lane }) => {
          // Selection id = the live lane id when running, else the id the lane
          // WILL take (architect / the metric), so selection persists on spawn.
          const selId = lane ? lane.id : entry.isMain ? "architect" : entry.metric ?? entry.slug;
          return (
            <Row
              key={entry.slug}
              label={entry.name}
              role={entry.role}
              metric={entry.metric}
              isMain={entry.isMain}
              status={lane?.status ?? "idle"}
              live={Boolean(lane)}
              selected={selectedId === selId}
              onClick={() => onSelect(selId)}
            />
          );
        })}
        {extras.map((l) => (
          <Row key={l.id} label={l.label} role="Specialist" metric={l.metric} isMain={false}
            status={l.status} live selected={selectedId === l.id} onClick={() => onSelect(l.id)} />
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

function Row({
  label, role, metric, isMain, status, live, selected, onClick,
}: {
  label: string; role?: string; metric?: string; isMain: boolean;
  status: LaneStatus; live: boolean; selected: boolean; onClick: () => void;
}) {
  const Icon = metricIcon(metric, isMain);
  const meta = STATUS_META[status];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border bg-white/[0.02] p-3 text-left transition-colors cursor-pointer ${
        selected ? "border-white/30 bg-white/[0.06]"
          : isMain ? "border-[#7c9cff]/30 hover:bg-white/[0.04]" : "border-white/[0.06] hover:bg-white/[0.04]"
      } ${live ? "" : "opacity-60"}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${meta.color}1f` }}>
          <Icon className="h-4 w-4" style={{ color: meta.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white/90">{label}</span>
          {role && role !== label && (
            <span className="block truncate text-[10.5px] text-white/40">{role}</span>
          )}
        </div>
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.pulse ? "animate-pulse" : ""}`}
          style={{ background: meta.color }}
          title={live ? meta.label : "Not started"}
        />
      </div>
    </button>
  );
}
