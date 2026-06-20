import { Users, MessageSquareText } from "lucide-react";
import {
  AGENTS,
  SESSIONS,
  AGENT_STATUS_META,
  SESSION_STATUS_META,
  agentById,
} from "@/lib/workspace-detail";

export type SidebarView = "sessions" | "agents";

interface WorkspaceSidebarProps {
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  selectedSessionId: string;
  onSelectSession: (id: string) => void;
}

// WorkspaceSidebar — the small left panel. A segmented toggle switches between
// Sessions and Agents; each lists the workspace's items. Active sessions are
// visually distinct from inactive ones.
export function WorkspaceSidebar({
  view,
  onViewChange,
  selectedSessionId,
  onSelectSession,
}: WorkspaceSidebarProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Segmented toggle */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        <ToggleButton
          active={view === "sessions"}
          onClick={() => onViewChange("sessions")}
          icon={<MessageSquareText className="h-4 w-4" />}
          label="Sessions"
        />
        <ToggleButton
          active={view === "agents"}
          onClick={() => onViewChange("agents")}
          icon={<Users className="h-4 w-4" />}
          label="Agents"
        />
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {view === "sessions"
          ? SESSIONS.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                selected={s.id === selectedSessionId}
                onClick={() => onSelectSession(s.id)}
              />
            ))
          : AGENTS.map((a) => <AgentRow key={a.id} agent={a} onClick={() => a.sessionId && onSelectSession(a.sessionId)} />)}
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors duration-200 cursor-pointer ${
        active
          ? "bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.18)]"
          : "text-white/55 hover:text-white/80"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SessionRow({
  session,
  selected,
  onClick,
}: {
  session: (typeof SESSIONS)[number];
  selected: boolean;
  onClick: () => void;
}) {
  const status = SESSION_STATUS_META[session.status];
  const owner = agentById(session.agentId);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-all duration-200 cursor-pointer ${
        selected
          ? "border-white/20 bg-white/[0.08]"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.05]"
      } ${session.active ? "" : "opacity-65"}`}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-[3px] rounded-full"
          style={{ background: "#5227FF" }}
        />
      )}
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.active ? "animate-pulse" : ""}`}
          style={{ background: status.color }}
        />
        <span className="truncate text-[13px] font-medium text-white/90">
          {session.title}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-3.5 text-[11px] text-white/45">
        <span className="truncate">{owner?.name ?? "—"}</span>
        <span className="text-white/20">·</span>
        <span className="whitespace-nowrap">{session.messages} msgs</span>
        <span className="ml-auto whitespace-nowrap text-white/35">{session.updated}</span>
      </div>
    </button>
  );
}

function AgentRow({
  agent,
  onClick,
}: {
  agent: (typeof AGENTS)[number];
  onClick: () => void;
}) {
  const status = AGENT_STATUS_META[agent.status];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition-all duration-200 hover:border-white/12 hover:bg-white/[0.05] cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-[13px] font-semibold text-white/90">
          {agent.name}
        </span>
        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/55">
          {agent.role}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
            style={{ background: status.color }}
          />
          <span className="text-[11px] text-white/50">{status.label}</span>
        </span>
      </div>
      <p className="mt-1.5 truncate text-[11px] text-white/45">{agent.task}</p>
      <p className="mt-0.5 text-[10.5px] text-white/30">{agent.model}</p>
    </button>
  );
}
