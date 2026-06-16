"use client";

import { AGENTS, NAV, type NavItem, type ViewId } from "@/lib/nav";
import { Icon } from "@/components/ui/Icon";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { LivePill } from "@/components/ui/LivePill";

interface SidebarProps {
  active: ViewId;
  onSelect: (id: ViewId) => void;
  live: boolean;
}

export function Sidebar({ active, onSelect, live }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-5 pb-4 pt-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-muted">
          LOCAL · STUDIO
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          Agentic <span className="italic text-accent">OS</span>
        </h1>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.heading} className="mb-5">
            <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.18em] text-muted">
              {group.heading.toUpperCase()}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavButton
                    item={item}
                    active={active === item.id}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-muted">Obsidian vault</span>
          <LivePill live={live} />
        </div>
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-full bg-gradient-to-br from-slate-500 to-slate-700" />
          <span className="text-sm text-foreground/90">Master</span>
        </div>
      </div>
    </aside>
  );
}

interface NavButtonProps {
  item: NavItem;
  active: boolean;
  onSelect: (id: ViewId) => void;
}

function NavButton({ item, active, onSelect }: NavButtonProps) {
  const agent = item.agentId ? AGENTS[item.agentId] : null;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
        active
          ? "bg-surface-2 text-foreground"
          : "text-foreground/70 hover:bg-surface-2/60 hover:text-foreground"
      }`}
    >
      {agent ? (
        <AgentIcon agent={agent} size="sm" />
      ) : (
        <Icon name={item.icon} className="h-[18px] w-[18px] text-muted" />
      )}
      <span>{item.label}</span>
    </button>
  );
}
