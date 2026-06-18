"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AGENTS, NAV, type ViewId } from "@/lib/nav";
import { getHealth } from "@/lib/hermes";
import { registerNavigate } from "@/lib/workbench";
import { VIEW_FADE } from "@/lib/aurora";
import { Dock } from "@/components/ui/Dock";
import { CommandBridge } from "@/components/CommandBridge";
import { Icon } from "@/components/ui/Icon";
import { LivePill } from "@/components/ui/LivePill";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { MissionControl } from "@/components/views/MissionControl";
import { CockpitView } from "@/components/views/CockpitView";
import { KanbanView } from "@/components/views/KanbanView";
import { ChatView } from "@/components/views/ChatView";
import { MemoryView } from "@/components/views/MemoryView";
import { PromptFoundryView } from "@/components/views/PromptFoundryView";
import { GoalModeView } from "@/components/views/GoalModeView";
import { LaunchpadView } from "@/components/views/LaunchpadView";
import { WorkbenchView } from "@/components/views/WorkbenchView";
import { TrustRailView } from "@/components/views/TrustRailView";
import type { DockItem } from "@/components/ui/contracts";

export default function Home() {
  const [view, setView] = useState<ViewId>("mission-control");
  const [live, setLive] = useState(false);

  // Let views (e.g. Launchpad → Workbench) request navigation via lib/workbench.
  useEffect(() => {
    registerNavigate(setView);
  }, []);

  // Health poll — preserved verbatim.
  useEffect(() => {
    let active = true;
    const check = () =>
      getHealth().then(({ live }) => active && setLive(live));
    check();
    const t = setInterval(check, 10_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  // Build dock items from NAV groups (flattened) + agent entries.
  const dockItems: DockItem[] = [
    // Flatten all NAV groups into a single item list.
    ...NAV.flatMap((group) =>
      group.items.map((item): DockItem => ({
        id: item.id,
        label: item.label,
        icon: item.agentId
          ? <AgentIcon agent={AGENTS[item.agentId]} size="sm" />
          : <Icon name={item.icon} className="h-4 w-4" />,
        active: view === item.id,
        onSelect: () => setView(item.id),
      }))
    ),
  ];

  // Trailing dock slot: live status pill + ⌘K hint.
  const dockTrailing = (
    <div className="flex items-center gap-2 pl-1 pr-0.5">
      <LivePill live={live} />
      <kbd
        className="rounded border font-sans text-[10px] text-muted px-1.5 py-0.5"
        style={{ borderColor: "var(--border)" }}
        title="Open Command Bridge (⌘K / Ctrl+K)"
      >
        ⌘K
      </kbd>
    </div>
  );

  return (
    // Full-screen column: Dock is fixed overlay; main fills remainder with top padding.
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top centered Dock — fixed overlay; replaces the left Sidebar */}
      <Dock items={dockItems} trailing={dockTrailing} />

      {/* Main content — pt-20 clears the fixed Dock height (~64px pill + 16px top gap) */}
      <main
        className="relative min-w-0 flex-1 overflow-hidden pt-20"
        style={{ perspective: "var(--perspective)", transformStyle: "preserve-3d" }}
      >
        {/* AnimatePresence keyed by ViewId drives the view→view transition.
            mode="wait" ensures the outgoing view fully exits before the
            incoming one enters, preventing overlap flicker. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            variants={VIEW_FADE}
            initial="initial"
            animate="enter"
            exit="exit"
            className="absolute inset-0"
          >
            {renderView(view, setView)}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* CommandBridge — Overlay-plane omnibox; mounted outside main so it
          sits above the perspective context and is never clipped by overflow. */}
      <CommandBridge setView={setView} />
    </div>
  );
}

function renderView(view: ViewId, onSelect: (id: ViewId) => void) {
  if (view.startsWith("agent:")) {
    const id = view.slice("agent:".length);
    const agent = AGENTS[id];
    return agent ? <ChatView key={id} agent={agent} /> : null;
  }
  switch (view) {
    case "mission-control":
      return <MissionControl onSelect={onSelect} />;
    case "cockpit":
      return <CockpitView />;
    case "kanban":
      return <KanbanView />;
    case "memory":
      return <MemoryView />;
    case "prompt-foundry":
      return <PromptFoundryView />;
    case "goal-mode":
      return <GoalModeView />;
    case "launchpad":
      return <LaunchpadView />;
    case "workbench":
      return <WorkbenchView />;
    case "trust-rail":
      return <TrustRailView />;
    default:
      return null;
  }
}
