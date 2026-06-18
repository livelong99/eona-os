// Sidebar navigation config + agent registry. Claude is the only runtime
// (turns delegate to the local `claude` CLI via the claude_code api_mode).
import type { Agent, Tier, TierMeta } from "./types";

export type ViewId =
  | "mission-control"
  | "cockpit"
  | "kanban"
  | "agent:claude"
  | "prompt-foundry"
  | "memory"
  | "goal-mode"
  | "launchpad"
  | "trust-rail";

export type IconName =
  | "grid"
  | "cockpit"
  | "kanban"
  | "sparkles"
  | "share2"
  | "target"
  | "bot"
  | "rocket"
  | "shield";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: IconName;
  /** agent id, when this item is an agent chat */
  agentId?: string;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

export const TIERS: Record<Tier, TierMeta> = {
  primary: { tier: "primary", label: "Primary" },
};

export const AGENTS: Record<string, Agent> = {
  claude: {
    id: "claude",
    name: "Claude",
    gradient: "from-orange-400 to-amber-600",
    tier: "primary",
    model: "claude-code-cli",
    blurb: "Claude Code CLI (subscription) — the only executor, via the bridge.",
  },
};

export const NAV: NavGroup[] = [
  {
    heading: "Workspace",
    items: [
      { id: "mission-control", label: "Mission Control", icon: "grid" },
      { id: "cockpit", label: "Cockpit", icon: "cockpit" },
      { id: "kanban", label: "Kanban", icon: "kanban" },
    ],
  },
  {
    heading: "Agents",
    items: [
      { id: "agent:claude", label: "Claude", icon: "bot", agentId: "claude" },
    ],
  },
  {
    heading: "Studio",
    items: [
      { id: "launchpad", label: "Launchpad", icon: "rocket" },
      { id: "trust-rail", label: "Trust Rail", icon: "shield" },
    ],
  },
  {
    heading: "Self",
    items: [
      { id: "prompt-foundry", label: "Prompt Foundry", icon: "sparkles" },
      { id: "memory", label: "Memory", icon: "share2" },
      { id: "goal-mode", label: "Goal Mode", icon: "target" },
    ],
  },
];
