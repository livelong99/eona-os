// Sidebar navigation config + agent registry. Mirrors the reference UI
// (docs/reference/montages/) trimmed to the v1 provider set.
import type { Agent, Tier, TierMeta } from "./types";

export type ViewId =
  | "mission-control"
  | "kanban"
  | "agent:claude"
  | "agent:gemini"
  | "agent:local"
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
  A: { tier: "A", label: "Local", logged: false, sensitiveOk: true },
  B: { tier: "B", label: "Free cloud", logged: true, sensitiveOk: false },
  C: { tier: "C", label: "Gemini", logged: false, sensitiveOk: true },
  D: { tier: "D", label: "Claude Code", logged: false, sensitiveOk: true },
};

export const AGENTS: Record<string, Agent> = {
  claude: {
    id: "claude",
    name: "Claude",
    gradient: "from-orange-400 to-amber-600",
    tier: "D",
    model: "claude-code-cli",
    blurb: "Claude Code CLI — premium runtime, own session.",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    gradient: "from-violet-400 to-fuchsia-600",
    tier: "C",
    model: "gemini-pro",
    blurb: "Google Gemini — engine brain (Pro heavy, Flash judge).",
  },
  local: {
    id: "local",
    name: "Local",
    gradient: "from-emerald-400 to-teal-600",
    tier: "A",
    model: "gemma-4-12b",
    blurb: "Ollama / LM Studio — free, private, on-device.",
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
      { id: "agent:local", label: "Local", icon: "bot", agentId: "local" },
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
