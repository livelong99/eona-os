// Mock data + types for Mission Control — manage models, feature enablement,
// usage tracking, and end-to-end settings for the Hermes agent, Claude Code, and
// Obsidian. Settings surfaces mirror the real config of each system. Mockup only.

export type SectionId = "overview" | "models" | "features" | "hermes" | "claude" | "obsidian";

export interface ControlSection {
  id: SectionId;
  label: string;
  icon: "gauge" | "cpu" | "toggle" | "bot" | "terminal" | "vault";
  blurb: string;
}

export const SECTIONS: ControlSection[] = [
  { id: "overview", label: "Overview", icon: "gauge", blurb: "Usage & system health" },
  { id: "models", label: "Models", icon: "cpu", blurb: "Model roster & routing" },
  { id: "features", label: "Features", icon: "toggle", blurb: "Capability enablement" },
  { id: "hermes", label: "Hermes agent", icon: "bot", blurb: "Autonomy, voice, budget" },
  { id: "claude", label: "Claude Code", icon: "terminal", blurb: "Model, thinking, hooks" },
  { id: "obsidian", label: "Obsidian", icon: "vault", blurb: "Vault, sync, embeddings" },
];

// ── Usage tracking ───────────────────────────────────────────────────────────
export interface UsageStat {
  label: string;
  value: string;
  sub: string;
  trend: number; // +/- % vs last period
  icon: "coins" | "zap" | "activity" | "bot";
}

export const USAGE_STATS: UsageStat[] = [
  { label: "Spend (MTD)", value: "$86.40", sub: "of $200 budget", trend: 12, icon: "coins" },
  { label: "Tokens", value: "12.4M", sub: "in + out, this month", trend: 8, icon: "zap" },
  { label: "Requests", value: "3,420", sub: "across all surfaces", trend: -4, icon: "activity" },
  { label: "Active agents", value: "4", sub: "running right now", trend: 0, icon: "bot" },
];

// 14-day spend sparkline (relative units)
export const SPEND_SERIES = [3, 4, 2, 5, 6, 4, 7, 5, 8, 6, 9, 7, 10, 8];

export interface ModelUsage {
  name: string;
  share: number; // 0–100
  color: string;
  cost: string;
}
export const MODEL_USAGE: ModelUsage[] = [
  { name: "Sonnet 4.6", share: 52, color: "#4f8cff", cost: "$41.10" },
  { name: "Opus 4.8", share: 28, color: "#a78bfa", cost: "$32.80" },
  { name: "Haiku 4.5", share: 18, color: "#34d399", cost: "$10.20" },
  { name: "Fable 5", share: 2, color: "#f4c14d", cost: "$2.30" },
];

export interface SystemService {
  name: string;
  status: "healthy" | "degraded" | "off";
  detail: string;
}
export const SERVICES: SystemService[] = [
  { name: "Hermes engine", status: "healthy", detail: "uptime 6d 4h" },
  { name: "Claude bridge", status: "healthy", detail: "12ms latency" },
  { name: "Obsidian vault", status: "healthy", detail: "synced 30s ago" },
  { name: "Cron scheduler", status: "off", detail: "autonomy disabled" },
];

export const SERVICE_STATUS_COLOR: Record<SystemService["status"], string> = {
  healthy: "#34d399",
  degraded: "#f4c14d",
  off: "#8a8fa3",
};

// ── Models ───────────────────────────────────────────────────────────────────
export interface ModelInfo {
  id: string;
  name: string;
  tier: "Reasoning" | "Balanced" | "Fast" | "Creative";
  context: string;
  cost: string;
  role: string;
  enabled: boolean;
  color: string;
}

export const MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6", tier: "Balanced", context: "200K", cost: "$3 / $15", role: "Fast, capable all-rounder", enabled: true, color: "#4f8cff" },
  { id: "claude-opus-4-8", name: "Opus 4.8", tier: "Reasoning", context: "200K", cost: "$15 / $75", role: "Deepest reasoning for heavy creative & coding work", enabled: true, color: "#a78bfa" },
];

// 3-tier routing → which model handles each tier
export interface RoutingTier {
  id: string;
  tier: string;
  desc: string;
  model: string;
  options: string[];
}
export const ROUTING: RoutingTier[] = [
  { id: "t1", tier: "Tier 1 · Voice & Planner", desc: "Home voice agent and the planner", model: "Sonnet 4.6", options: ["Sonnet 4.6", "Opus 4.8"] },
  { id: "t2", tier: "Tier 2 · Brainstorm, Tools & Workspace", desc: "Brainstorming, Labs tools, and the workspace", model: "Opus 4.8", options: ["Sonnet 4.6", "Opus 4.8"] },
];

// ── Feature enablement ───────────────────────────────────────────────────────
export interface FeatureFlag {
  id: string;
  label: string;
  desc: string;
  icon: "brain" | "shield" | "wallet" | "clock" | "mic" | "target" | "globe" | "plug";
  value: boolean;
  risk?: "safe" | "caution";
}
export const FEATURES: FeatureFlag[] = [
  { id: "brain", label: "Memory prefetch", desc: "Inject Brain.retrieve() context into every run", icon: "brain", value: true, risk: "safe" },
  { id: "trustgate", label: "TrustGate", desc: "Gate autonomous & cron acts before they run", icon: "shield", value: true, risk: "safe" },
  { id: "budget", label: "Budget governor", desc: "Allocate + cap spend before dispatch", icon: "wallet", value: true, risk: "safe" },
  { id: "cron", label: "Cron autonomy", desc: "Let the agent act on a schedule unattended", icon: "clock", value: false, risk: "caution" },
  { id: "voice", label: "Voice (Jarvis)", desc: "Local wake-word voice front-end", icon: "mic", value: true, risk: "safe" },
  { id: "goal", label: "Goal mode", desc: "Autonomous judge-loop toward an objective", icon: "target", value: true, risk: "caution" },
  { id: "web", label: "Web access", desc: "Allow agents to browse & search the web", icon: "globe", value: true, risk: "caution" },
  { id: "mcp", label: "MCP servers", desc: "Expose external tools via Model Context Protocol", icon: "plug", value: true, risk: "safe" },
];

// ── Integration settings (generic, schema-driven) ───────────────────────────
export type Setting =
  | { kind: "toggle"; id: string; label: string; desc?: string; value: boolean }
  | { kind: "select"; id: string; label: string; desc?: string; value: string; options: string[] }
  | { kind: "slider"; id: string; label: string; desc?: string; value: number; min: number; max: number; step: number; unit?: string }
  | { kind: "text"; id: string; label: string; desc?: string; value: string; mono?: boolean };

export interface SettingGroup {
  title: string;
  settings: Setting[];
}

export const HERMES_SETTINGS: SettingGroup[] = [
  {
    title: "Autonomy",
    settings: [
      { kind: "select", id: "h_level", label: "Autonomy level", desc: "How far the agent can act without you", value: "L2 · Confirm", options: ["L1 · Suggest", "L2 · Confirm", "L3 · Auto-safe", "L4 · Autonomous", "L5 · Full"] },
      { kind: "slider", id: "h_trust", label: "Trust threshold", desc: "Min TrustGate score to proceed unattended", value: 70, min: 0, max: 100, step: 5, unit: "%" },
      { kind: "toggle", id: "h_confirm", label: "Confirm irreversible acts", desc: "Always ask before deletes, pushes, sends", value: true },
    ],
  },
  {
    title: "Budget",
    settings: [
      { kind: "slider", id: "h_daily", label: "Daily spend cap", desc: "Budget governor stops dispatch above this", value: 20, min: 0, max: 50, step: 1, unit: "$" },
      { kind: "select", id: "h_oncap", label: "On cap reached", value: "Pause & notify", options: ["Pause & notify", "Queue for review", "Hard stop"] },
    ],
  },
  {
    title: "Voice",
    settings: [
      { kind: "toggle", id: "h_wake", label: "Wake word", desc: "Listen for “Jarvis” locally", value: true },
      { kind: "select", id: "h_stt", label: "Speech-to-text", value: "Whisper (local)", options: ["Whisper (local)", "Deepgram", "Off"] },
      { kind: "select", id: "h_tts", label: "Voice", value: "Custom (fine-tuned)", options: ["Custom (fine-tuned)", "System", "ElevenLabs"] },
    ],
  },
];

export const CLAUDE_SETTINGS: SettingGroup[] = [
  {
    title: "Model & reasoning",
    settings: [
      { kind: "select", id: "c_model", label: "Default model", value: "Sonnet 4.6", options: ["Sonnet 4.6", "Opus 4.8", "Haiku 4.5"] },
      { kind: "toggle", id: "c_think", label: "Adaptive thinking", desc: "Let the model decide when to think (Opus 4.7+)", value: true },
      { kind: "slider", id: "c_budget", label: "Task budget", desc: "Token target across an agentic loop (min 20K)", value: 60, min: 20, max: 200, step: 10, unit: "K" },
    ],
  },
  {
    title: "Permissions",
    settings: [
      { kind: "select", id: "c_perm", label: "Permission mode", desc: "Rules evaluate deny → ask → allow", value: "Ask", options: ["Ask", "Accept edits", "Plan", "Bypass (danger)"] },
      { kind: "toggle", id: "c_hooks", label: "Lifecycle hooks", desc: "Run configured PreToolUse / PostToolUse hooks", value: true },
      { kind: "toggle", id: "c_managed", label: "Managed hooks only", desc: "Block ad-hoc hooks; allow approved ones", value: false },
    ],
  },
  {
    title: "Tools & MCP",
    settings: [
      { kind: "select", id: "c_mcp", label: "MCP servers", value: "3 connected", options: ["3 connected", "Manage…"] },
      { kind: "text", id: "c_allow", label: "Allowed tools", desc: "Comma-separated allowlist", value: "Read, Edit, Bash(npm *), Grep", mono: true },
    ],
  },
];

export const OBSIDIAN_SETTINGS: SettingGroup[] = [
  {
    title: "Vault",
    settings: [
      { kind: "text", id: "o_path", label: "Vault path", value: "~/Documents/Obsidian/Vault", mono: true },
      { kind: "toggle", id: "o_sync", label: "Live sync", desc: "Mirror changes between agent and vault", value: true },
      { kind: "toggle", id: "o_daily", label: "Daily notes", desc: "Voice captures land in today's note", value: true },
    ],
  },
  {
    title: "Knowledge index",
    settings: [
      { kind: "toggle", id: "o_graph", label: "Graph indexing", desc: "Build the memory sphere from links", value: true },
      { kind: "select", id: "o_embed", label: "Embedding model", value: "text-embedding-3-large", options: ["text-embedding-3-large", "nomic-embed (local)", "Off"] },
      { kind: "toggle", id: "o_autoembed", label: "Auto-embed on save", desc: "Re-index notes as you edit them", value: true },
    ],
  },
  {
    title: "Guardrails",
    settings: [
      { kind: "toggle", id: "o_noDelete", label: "Never delete notes", desc: "Agent may append/patch only", value: true },
      { kind: "select", id: "o_scope", label: "Writable folders", value: "Content folders", options: ["Content folders", "Inbox only", "All (danger)"] },
    ],
  },
];
