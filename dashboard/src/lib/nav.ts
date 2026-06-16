// Sidebar navigation config + agent registry. Mirrors the reference UI
// (docs/reference/montages/) trimmed to the v1 provider set.
import type { Agent, Tier, TierMeta } from "./types";

export type ViewId =
  | "mission-control"
  | "kanban"
  | "agent:claude"
  | "agent:gemini"
  | "agent:openrouter"
  | "prompt-foundry"
  | "memory"
  | "goal-mode";

export type IconName =
  | "grid"
  | "kanban"
  | "sparkles"
  | "share2"
  | "target"
  | "bot";

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
  fallback: { tier: "fallback", label: "Fallback" },
  bulk: { tier: "bulk", label: "Bulk" },
};

export const AGENTS: Record<string, Agent> = {
  claude: {
    id: "claude",
    name: "Claude",
    gradient: "from-orange-400 to-amber-600",
    tier: "primary",
    model: "claude-code-cli",
    blurb: "Claude Code CLI (subscription) — primary executor via the bridge.",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    gradient: "from-violet-400 to-fuchsia-600",
    tier: "fallback",
    model: "google/gemini-2.5-flash",
    blurb: "Google Gemini — fallback + Hermes engine model.",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    gradient: "from-sky-400 to-indigo-600",
    tier: "bulk",
    model: "openrouter/auto",
    blurb: "OpenRouter — cheap/bulk tier + last-resort fallback.",
  },
};

export const NAV: NavGroup[] = [
  {
    heading: "Workspace",
    items: [
      { id: "mission-control", label: "Mission Control", icon: "grid" },
      { id: "kanban", label: "Kanban", icon: "kanban" },
    ],
  },
  {
    heading: "Agents",
    items: [
      { id: "agent:claude", label: "Claude", icon: "bot", agentId: "claude" },
      { id: "agent:gemini", label: "Gemini", icon: "bot", agentId: "gemini" },
      { id: "agent:openrouter", label: "OpenRouter", icon: "bot", agentId: "openrouter" },
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
