// Workspace model + mock seed data for the Code screen (mockup — no wiring yet).
// A "workspace" is a project the agent can open and work inside.

export type WorkspaceStatus = "idle" | "active" | "syncing";

export interface Workspace {
  id: string;
  name: string;
  path: string;
  language: string;
  branch: string;
  /** Human-relative string for the mockup (e.g. "12m ago"). */
  lastOpened: string;
  status: WorkspaceStatus;
  /** Agents currently attached to this workspace. */
  agents: number;
  openTasks: number;
}

// Language → accent color used for the card's dot + left rail.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#4f8cff",
  JavaScript: "#eab308",
  Python: "#f4c14d",
  Rust: "#f97316",
  Go: "#2dd4bf",
  Swift: "#ff6f4d",
};

export function languageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? "#8a8fa3";
}

// Status → label + indicator color.
export const STATUS_META: Record<
  WorkspaceStatus,
  { label: string; color: string; pulse: boolean }
> = {
  idle: { label: "Idle", color: "#8a8fa3", pulse: false },
  active: { label: "Agent active", color: "#34d399", pulse: true },
  syncing: { label: "Syncing", color: "#4f8cff", pulse: true },
};

export const SEED_WORKSPACES: Workspace[] = [
  {
    id: "hermes-engine",
    name: "hermes-engine",
    path: "~/dev/agent-home/hermes",
    language: "Python",
    branch: "main",
    lastOpened: "12m ago",
    status: "active",
    agents: 3,
    openTasks: 5,
  },
  {
    id: "agent-os-dashboard",
    name: "agent-os-dashboard",
    path: "~/dev/agent-home/dashboard",
    language: "TypeScript",
    branch: "feat/dark-glass",
    lastOpened: "just now",
    status: "syncing",
    agents: 2,
    openTasks: 8,
  },
  {
    id: "trust-rail",
    name: "trust-rail",
    path: "~/dev/agent-home/trust-rail",
    language: "Rust",
    branch: "main",
    lastOpened: "2h ago",
    status: "idle",
    agents: 0,
    openTasks: 1,
  },
  {
    id: "vault-sync",
    name: "vault-sync",
    path: "~/dev/tools/vault-sync",
    language: "Go",
    branch: "release/0.4",
    lastOpened: "yesterday",
    status: "idle",
    agents: 1,
    openTasks: 3,
  },
  {
    id: "voice-pipeline",
    name: "voice-pipeline",
    path: "~/dev/agent-home/voice",
    language: "Python",
    branch: "exp/whisper",
    lastOpened: "3d ago",
    status: "active",
    agents: 1,
    openTasks: 2,
  },
];

const MOCK_TEMPLATES: ReadonlyArray<Omit<Workspace, "id" | "lastOpened" | "status">> = [
  { name: "new-service", path: "~/dev/new-service", language: "Go", branch: "main", agents: 0, openTasks: 0 },
  { name: "landing-site", path: "~/dev/landing-site", language: "TypeScript", branch: "main", agents: 0, openTasks: 0 },
  { name: "ml-sandbox", path: "~/dev/ml-sandbox", language: "Python", branch: "main", agents: 0, openTasks: 0 },
];

// Build a fresh mock workspace for the "New / Load workspace" actions (mockup only).
export function makeMockWorkspace(seed: number): Workspace {
  const template = MOCK_TEMPLATES[seed % MOCK_TEMPLATES.length];
  return {
    ...template,
    id: `ws-${seed}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${template.name}-${seed}`,
    lastOpened: "just now",
    status: "idle",
  };
}
