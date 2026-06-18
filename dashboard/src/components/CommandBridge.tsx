"use client";

// CommandBridge — the ⌘K omnibox (Overlay plane).
//
// Responsibilities:
//   1. Listens globally for ⌘K (Mac) / Ctrl+K (Win/Linux) to toggle open.
//   2. Builds CommandItem[] for three groups:
//        "Go to"  — jump to any nav view
//        "Run"    — start an async task via startRun, then route to Cockpit
//        "Tools"  — quick-launch Launchpad
//   3. Supplies items + wiring to W1's CommandPalette shell.
//
// The palette shell (CommandPalette.tsx, W1-owned) owns keyboard nav, filtering,
// and rendering — this component only owns what items exist and how ⌘K works.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Kanban,
  LayoutGrid,
  Radio,
  Rocket,
  Share2,
  Shield,
  Sparkles,
  Target,
  Play,
} from "lucide-react";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { startRun } from "@/lib/hermes";
import { NAV } from "@/lib/nav";
import type { ViewId } from "@/lib/nav";
import type { CommandItem } from "@/components/ui/contracts";

// Map IconName strings to Lucide icon elements (mirrors Icon.tsx MAP).
const ICON_MAP: Record<string, React.ReactNode> = {
  grid: <LayoutGrid className="h-4 w-4" />,
  cockpit: <Radio className="h-4 w-4" />,
  kanban: <Kanban className="h-4 w-4" />,
  sparkles: <Sparkles className="h-4 w-4" />,
  share2: <Share2 className="h-4 w-4" />,
  target: <Target className="h-4 w-4" />,
  bot: <Bot className="h-4 w-4" />,
  rocket: <Rocket className="h-4 w-4" />,
  shield: <Shield className="h-4 w-4" />,
};

interface CommandBridgeProps {
  /** Passed from page.tsx; Command Bridge routes the app by calling this. */
  setView: (id: ViewId) => void;
}

export function CommandBridge({ setView }: CommandBridgeProps) {
  const [open, setOpen] = useState(false);

  const onClose = useCallback(() => setOpen(false), []);

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const trigger = isMac
        ? e.metaKey && e.key === "k"
        : e.ctrlKey && e.key === "k";
      if (!trigger) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    // ---- "Go to" group — one item per nav entry across all NAV groups ----
    const navItems: CommandItem[] = NAV.flatMap((group) =>
      group.items.map((navItem) => ({
        id: `goto-${navItem.id}`,
        label: navItem.label,
        hint: navItem.hint,
        group: "Go to",
        icon: ICON_MAP[navItem.icon],
        keywords: [navItem.id, group.heading.toLowerCase()],
        run: () => {
          setView(navItem.id);
          onClose();
        },
      })),
    );

    // ---- "Run" group — start a task via Hermes, route to Cockpit ----------
    const runItem: CommandItem = {
      id: "run-task",
      label: "Run a task…",
      hint: "Start an async Hermes run, then watch it in Cockpit",
      group: "Run",
      icon: <Play className="h-4 w-4" />,
      keywords: ["start", "execute", "agent", "prompt"],
      run: () => {
        // window.prompt is acceptable for v1 — a richer inline input can
        // replace this once W4's chat input primitive is extracted.
        const prompt = window.prompt("Enter a task for the agent:");
        if (!prompt?.trim()) return;
        startRun(prompt.trim()).then(({ runId, live }) => {
          if (runId || !live) {
            // Route to Cockpit to observe the run (live or offline mock).
            setView("cockpit");
          }
        });
      },
    };

    // ---- "Tools" group — quick routes ------------------------------------
    const toolItems: CommandItem[] = [
      {
        id: "tools-launchpad",
        label: "Open Launchpad",
        hint: "Browse and launch agent tools",
        group: "Tools",
        icon: <Rocket className="h-4 w-4" />,
        keywords: ["tools", "agents", "browse", "launch"],
        run: () => {
          setView("launchpad");
          onClose();
        },
      },
      {
        id: "tools-trust-rail",
        label: "Open Trust Rail",
        hint: "Review and approve pending agent actions",
        group: "Tools",
        icon: <Shield className="h-4 w-4" />,
        keywords: ["approve", "review", "trust", "permissions"],
        run: () => {
          setView("trust-rail");
          onClose();
        },
      },
    ];

    return [...navItems, runItem, ...toolItems];
  }, [setView, onClose]);

  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      items={items}
      placeholder="Jump to view, run a task…"
    />
  );
}
