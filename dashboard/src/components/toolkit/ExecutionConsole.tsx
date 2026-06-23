// ExecutionConsole — the glass-box view of a tool's agent swarm. One panel per
// running agent (the orchestrator + each spawned specialist), each showing its
// live thinking, response prose, and tool activity, so the user watches the
// complete execution unfold. Shared by every Eona OS tool.

import { useRef, useEffect } from "react";
import {
  Brain, Lightbulb, Wrench, ShieldAlert, Map as MapIcon, Layout, Server,
  ClipboardList, FlaskConical, Eye, Search, BarChart3, Palette, Bot, ChevronRight,
} from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import type { AgentLane, LaneStatus } from "./agentRun";

const STATUS_META: Record<LaneStatus, { label: string; color: string; pulse: boolean }> = {
  thinking: { label: "Thinking", color: "#a78bfa", pulse: true },
  writing: { label: "Writing", color: "#34d399", pulse: true },
  reviewing: { label: "Reviewing", color: "#4f8cff", pulse: true },
  idle: { label: "Idle", color: "#8a8fa3", pulse: false },
  done: { label: "Done", color: "#34d399", pulse: false },
};

const isMain = (lane: AgentLane) =>
  lane.id === "pm" || lane.id === "architect" || /orchestrat/i.test(lane.role);

function laneIcon(lane: AgentLane) {
  if (isMain(lane)) return Brain;
  switch (lane.metric) {
    case "creativity": return Lightbulb;
    case "feasibility": return Wrench;
    case "reliability": return ShieldAlert;
    case "roadmap": return MapIcon;
    case "pm": return ClipboardList;
    case "frontend": return Layout;
    case "backend": return Server;
    case "ux": return Palette;
    case "test": return FlaskConical;
    case "review": return Eye;
    case "research": case "researcher": return Search;
    case "analyst": return BarChart3;
    default: return Bot;
  }
}

export const ALL_AGENTS = "__all__";

interface ExecutionConsoleProps {
  lanes: AgentLane[];
  streaming: boolean;
  /** When set (and not ALL_AGENTS), only this lane's execution is shown. */
  selectedId?: string;
}

export function ExecutionConsole({ lanes, streaming, selectedId }: ExecutionConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const focused = selectedId && selectedId !== ALL_AGENTS;
  const shown = focused ? lanes.filter((l) => l.id === selectedId) : lanes;
  const focusedLabel = focused
    ? lanes.find((l) => l.id === selectedId)?.label ?? "Selected agent"
    : null;

  useEffect(() => {
    if (streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lanes, streaming, selectedId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-2.5">
        <Brain className="h-4 w-4 text-[#a78bfa]" />
        <span className="text-[12.5px] font-medium text-white/65">Execution</span>
        <span className="text-[11px] text-white/35">
          {focused ? focusedLabel : `${lanes.length} agent${lanes.length === 1 ? "" : "s"}`}
        </span>
        {streaming && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-white/45">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#34d399]" />
            live
          </span>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {lanes.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12.5px] text-white/40">
            Waiting for the orchestrator to spin up the swarm…
          </p>
        ) : shown.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12.5px] text-white/40">
            {focusedLabel} hasn't started yet — it'll appear here once it's spawned.
          </p>
        ) : (
          shown.map((lane) => <LaneCard key={lane.id} lane={lane} />)
        )}
      </div>
    </div>
  );
}

function LaneCard({ lane }: { lane: AgentLane }) {
  const Icon = laneIcon(lane);
  const status = STATUS_META[lane.status];

  return (
    <div className={`rounded-xl border bg-white/[0.02] p-3 ${isMain(lane) ? "border-[#a78bfa]/25" : "border-white/[0.07]"}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${status.color}1f` }}>
          <Icon className="h-4 w-4" style={{ color: status.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-white/90">{lane.label}</span>
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/55">{lane.role}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-white/45">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`} style={{ background: status.color }} />
          {status.label}
        </span>
      </div>

      {lane.thinking && (
        <div className="mt-2.5 rounded-lg border border-white/[0.05] bg-black/20 p-2.5">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-white/30">Thinking</p>
          <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-white/45">{lane.thinking}</p>
        </div>
      )}

      {lane.response && (
        <div className="mt-2.5 text-[12.5px] leading-relaxed text-white/75">
          <Markdown>{lane.response}</Markdown>
        </div>
      )}

      {lane.activity.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {lane.activity.slice(-6).map((a, i) => (
            <p key={i} className="flex items-center gap-1 truncate font-mono text-[10.5px] text-white/40">
              <ChevronRight className="h-3 w-3 shrink-0 text-white/25" />
              {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
