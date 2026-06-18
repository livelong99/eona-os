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
  | "workbench"
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
  | "wrench"
  | "shield";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: IconName;
  /** Short description shown as a hint in the Command Bridge palette. */
  hint?: string;
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
      { id: "mission-control", label: "Mission Control", icon: "grid", hint: "Agent constellation overview" },
      { id: "cockpit", label: "Cockpit", icon: "cockpit", hint: "Live run event timeline" },
      { id: "kanban", label: "Kanban", icon: "kanban", hint: "Task board" },
    ],
  },
  {
    heading: "Agents",
    items: [
      { id: "agent:claude", label: "Claude", icon: "bot", agentId: "claude", hint: "Chat with Claude Code CLI" },
    ],
  },
  {
    heading: "Studio",
    items: [
      { id: "launchpad", label: "Launchpad", icon: "rocket", hint: "Browse and launch agent tools" },
      { id: "workbench", label: "Workbench", icon: "wrench", hint: "Drive a tool through its steps" },
      { id: "trust-rail", label: "Trust Rail", icon: "shield", hint: "Review and approve agent actions" },
    ],
  },
  {
    heading: "Self",
    items: [
      { id: "prompt-foundry", label: "Prompt Foundry", icon: "sparkles", hint: "Craft and store prompts" },
      { id: "memory", label: "Memory", icon: "share2", hint: "Knowledge graph explorer" },
      { id: "goal-mode", label: "Goal Mode", icon: "target", hint: "Set and track objectives" },
    ],
  },
];
