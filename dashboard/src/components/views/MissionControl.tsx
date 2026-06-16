"use client";

import { AGENTS, NAV, type ViewId } from "@/lib/nav";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { TierBadge } from "@/components/ui/TierBadge";
import { Icon } from "@/components/ui/Icon";

interface MissionControlProps {
  onSelect: (id: ViewId) => void;
}

export function MissionControl({ onSelect }: MissionControlProps) {
  const agents = Object.values(AGENTS);
  const shortcuts = NAV.flatMap((g) => g.items).filter(
    (i) => !i.agentId && i.id !== "mission-control",
  );

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <h2 className="text-2xl font-semibold">Mission Control</h2>
      <p className="mt-1 text-sm text-muted">
        Local orchestration over Hermes Agent — free-first provider mesh.
      </p>

      <section className="mt-7">
        <h3 className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-muted">
          AGENTS
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(`agent:${a.id}` as ViewId)}
              className="rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
            >
              <div className="mb-3 flex items-center justify-between">
                <AgentIcon agent={a} size="lg" />
                <TierBadge tier={a.tier} />
              </div>
              <p className="font-medium">{a.name}</p>
              <p className="mt-0.5 text-xs text-muted">{a.blurb}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-muted">
          WORKFLOWS
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shortcuts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
            >
              <Icon name={s.icon} className="h-5 w-5 text-accent" />
              <span className="text-sm">{s.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
