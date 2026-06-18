"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AGENTS, type ViewId } from "@/lib/nav";
import { getHealth } from "@/lib/hermes";
import { VIEW_VARIANTS } from "@/lib/aurora";
import { Sidebar } from "@/components/Sidebar";
import { CommandBridge } from "@/components/CommandBridge";
import { MissionControl } from "@/components/views/MissionControl";
import { CockpitView } from "@/components/views/CockpitView";
import { KanbanView } from "@/components/views/KanbanView";
import { ChatView } from "@/components/views/ChatView";
import { MemoryView } from "@/components/views/MemoryView";
import { PromptFoundryView } from "@/components/views/PromptFoundryView";
import { GoalModeView } from "@/components/views/GoalModeView";
import { LaunchpadView } from "@/components/views/LaunchpadView";
import { TrustRailView } from "@/components/views/TrustRailView";

export default function Home() {
  const [view, setView] = useState<ViewId>("mission-control");
  const [live, setLive] = useState(false);

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={view} onSelect={setView} live={live} />

      {/* Main content — perspective context for camera dolly transitions (§5). */}
      <main
        className="relative min-w-0 flex-1 overflow-hidden"
        style={{ perspective: "var(--perspective)", transformStyle: "preserve-3d" }}
      >
        {/* AnimatePresence keyed by ViewId drives the view→view camera dolly.
            mode="wait" ensures the outgoing view fully exits before the
            incoming one enters, preventing z-fighting during overlap. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            variants={VIEW_VARIANTS}
            initial="initial"
            animate="enter"
            exit="exit"
            className="absolute inset-0"
            // Reduced-motion: VIEW_VARIANTS already carry opacity-only fallback
            // via the root MotionConfig reducedMotion="user" in layout.tsx.
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
    case "trust-rail":
      return <TrustRailView />;
    default:
      return null;
  }
}
