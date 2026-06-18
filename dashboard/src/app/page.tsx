"use client";

import { useEffect, useState } from "react";
import { AGENTS, type ViewId } from "@/lib/nav";
import { getHealth } from "@/lib/hermes";
import { Sidebar } from "@/components/Sidebar";
import { MissionControl } from "@/components/views/MissionControl";
import { CockpitView } from "@/components/views/CockpitView";
import { KanbanView } from "@/components/views/KanbanView";
import { ChatView } from "@/components/views/ChatView";
import { MemoryView } from "@/components/views/MemoryView";
import { PromptFoundryView } from "@/components/views/PromptFoundryView";
import { GoalModeView } from "@/components/views/GoalModeView";

export default function Home() {
  const [view, setView] = useState<ViewId>("mission-control");
  const [live, setLive] = useState(false);

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={view} onSelect={setView} live={live} />
      <main className="min-w-0 flex-1 bg-background">{renderView(view, setView)}</main>
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
    default:
      return null;
  }
}
