// Mock data for the workspace detail view (the two-panel screen you land on
// after opening a workspace). Agents, sessions, Claude-style execution logs, the
// active plan, and a file index for search. Mockup only — no engine wiring.

// ── Agents ───────────────────────────────────────────────────────────────────
export type AgentStatus = "working" | "review" | "idle" | "blocked";

export interface WorkspaceAgent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  task: string;
  model: string;
  sessionId?: string;
}

export const AGENT_STATUS_META: Record<
  AgentStatus,
  { label: string; color: string; pulse: boolean }
> = {
  working: { label: "Working", color: "#34d399", pulse: true },
  review: { label: "Reviewing", color: "#4f8cff", pulse: true },
  idle: { label: "Idle", color: "#8a8fa3", pulse: false },
  blocked: { label: "Blocked", color: "#f4694d", pulse: false },
};

export const AGENTS: WorkspaceAgent[] = [
  { id: "winston", name: "Winston", role: "Architect", status: "review", task: "Reviewing data-layer contract", model: "Opus 4.8", sessionId: "s1" },
  { id: "ada", name: "Ada", role: "Coder", status: "working", task: "Implementing /workspace route", model: "Sonnet 4.6", sessionId: "s1" },
  { id: "lin", name: "Lin", role: "Coder", status: "working", task: "Building terminal log view", model: "Sonnet 4.6", sessionId: "s2" },
  { id: "mira", name: "Mira", role: "Tester", status: "blocked", task: "Waiting on Ada's route", model: "Haiku 4.5", sessionId: "s4" },
  { id: "kai", name: "Kai", role: "Researcher", status: "idle", task: "Indexed 1,204 files", model: "Haiku 4.5", sessionId: "s3" },
];

// ── Execution log ──────────────────────────────────────────────────────────
export type LogKind =
  | "user"
  | "assistant"
  | "thinking"
  | "tool"
  | "result"
  | "error";

export interface LogEvent {
  id: string;
  kind: LogKind;
  time: string;
  /** For kind="tool": the tool name (Bash, Read, Edit, …). */
  tool?: string;
  text: string;
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export type SessionStatus = "running" | "done" | "idle";

export interface WorkspaceSession {
  id: string;
  title: string;
  agentId: string;
  active: boolean;
  updated: string;
  messages: number;
  status: SessionStatus;
  log: LogEvent[];
}

export const SESSION_STATUS_META: Record<
  SessionStatus,
  { label: string; color: string }
> = {
  running: { label: "Running", color: "#34d399" },
  idle: { label: "Idle", color: "#f4c14d" },
  done: { label: "Done", color: "#8a8fa3" },
};

const SESSION_1_LOG: LogEvent[] = [
  { id: "e1", kind: "user", time: "14:31:02", text: "Add a /workspace route and move the workspace screen onto it." },
  { id: "e2", kind: "thinking", time: "14:31:03", text: "No router installed yet — I'll add react-router-dom and wrap the app." },
  { id: "e3", kind: "assistant", time: "14:31:04", text: "I'll add react-router-dom, then wire BrowserRouter and the routes." },
  { id: "e4", kind: "tool", tool: "Bash", time: "14:31:05", text: "npm ls react-router-dom" },
  { id: "e5", kind: "result", time: "14:31:06", text: "(empty)" },
  { id: "e6", kind: "tool", tool: "Bash", time: "14:31:07", text: "npm install react-router-dom" },
  { id: "e7", kind: "result", time: "14:31:09", text: "added 14 packages, and audited 312 packages in 1.2s\nfound 0 vulnerabilities" },
  { id: "e8", kind: "tool", tool: "Read", time: "14:31:10", text: "src/main.tsx" },
  { id: "e9", kind: "result", time: "14:31:10", text: "11 lines read" },
  { id: "e10", kind: "tool", tool: "Edit", time: "14:31:14", text: "src/main.tsx — wrap <App /> in <BrowserRouter>" },
  { id: "e11", kind: "result", time: "14:31:14", text: "Applied 1 edit to src/main.tsx" },
  { id: "e12", kind: "tool", tool: "Edit", time: "14:31:22", text: "src/App.tsx — replace screen state with <Routes>" },
  { id: "e13", kind: "result", time: "14:31:22", text: "Applied 1 edit to src/App.tsx" },
  { id: "e14", kind: "tool", tool: "Bash", time: "14:31:25", text: "npx tsc --noEmit" },
  { id: "e15", kind: "result", time: "14:31:31", text: "TSC OK" },
  { id: "e16", kind: "assistant", time: "14:31:32", text: "Done. /workspace now routes to the Code screen; unknown paths fall back to Home." },
];

const SESSION_2_LOG: LogEvent[] = [
  { id: "f1", kind: "user", time: "14:28:40", text: "Build a terminal log component that replicates Claude execution logs." },
  { id: "f2", kind: "assistant", time: "14:28:41", text: "I'll model log events (tool/result/assistant) and render them monospace with status glyphs." },
  { id: "f3", kind: "tool", tool: "Write", time: "14:28:48", text: "src/components/ui/terminal-log.tsx" },
  { id: "f4", kind: "result", time: "14:28:48", text: "Created file (134 lines)" },
  { id: "f5", kind: "tool", tool: "Bash", time: "14:28:52", text: "npx tsc --noEmit" },
  { id: "f6", kind: "error", time: "14:28:55", text: "src/components/ui/terminal-log.tsx(42,7): error TS2304: Cannot find name 'LogKind'." },
  { id: "f7", kind: "thinking", time: "14:28:56", text: "Forgot to import the type — adding it." },
  { id: "f8", kind: "tool", tool: "Edit", time: "14:28:59", text: "import { type LogEvent, type LogKind } from '@/lib/workspace-detail'" },
  { id: "f9", kind: "result", time: "14:28:59", text: "Applied 1 edit" },
  { id: "f10", kind: "tool", tool: "Bash", time: "14:29:03", text: "npx tsc --noEmit" },
  { id: "f11", kind: "result", time: "14:29:09", text: "TSC OK" },
];

const SESSION_3_LOG: LogEvent[] = [
  { id: "g1", kind: "user", time: "09:12:00", text: "Index the repository so agents have context." },
  { id: "g2", kind: "tool", tool: "Bash", time: "09:12:01", text: "git ls-files | wc -l" },
  { id: "g3", kind: "result", time: "09:12:02", text: "1204" },
  { id: "g4", kind: "assistant", time: "09:12:40", text: "Indexed 1,204 files across 86 directories. Embeddings stored to the workspace brain." },
];

export const SESSIONS: WorkspaceSession[] = [
  { id: "s1", title: "Implement /workspace route", agentId: "ada", active: true, updated: "now", messages: 16, status: "running", log: SESSION_1_LOG },
  { id: "s2", title: "Terminal log component", agentId: "lin", active: true, updated: "2m ago", messages: 11, status: "running", log: SESSION_2_LOG },
  { id: "s4", title: "Fix dock active state", agentId: "mira", active: false, updated: "1h ago", messages: 4, status: "idle", log: SESSION_1_LOG.slice(0, 5) },
  { id: "s3", title: "Initial repo index", agentId: "kai", active: false, updated: "yesterday", messages: 4, status: "done", log: SESSION_3_LOG },
];

// ── Plan ─────────────────────────────────────────────────────────────────────
export type StepStatus = "done" | "active" | "pending";

export interface PlanStep {
  id: string;
  title: string;
  agentId?: string;
  status: StepStatus;
  note?: string;
}

export interface WorkspacePlan {
  title: string;
  goal: string;
  steps: PlanStep[];
}

export const PLAN: WorkspacePlan = {
  title: "Wire the workspace screen to live data",
  goal: "Ship the two-panel workspace view backed by the engine's session + run streams.",
  steps: [
    { id: "p1", title: "Index repository & build context", agentId: "kai", status: "done", note: "1,204 files embedded" },
    { id: "p2", title: "Define session + log data contract", agentId: "winston", status: "done" },
    { id: "p3", title: "Add /workspace/:id route", agentId: "ada", status: "active", note: "tsc green, wiring nav" },
    { id: "p4", title: "Terminal execution-log view", agentId: "lin", status: "active", note: "rendering glyphs" },
    { id: "p5", title: "Workspace file search", agentId: "ada", status: "pending" },
    { id: "p6", title: "Integration tests for the route", agentId: "mira", status: "pending", note: "blocked on p3" },
    { id: "p7", title: "Review & merge", agentId: "winston", status: "pending" },
  ],
};

// ── File index (for search) ──────────────────────────────────────────────────
export interface WorkspaceFile {
  path: string;
  kind: "code" | "doc" | "config";
}

export const FILES: WorkspaceFile[] = [
  { path: "src/App.tsx", kind: "code" },
  { path: "src/main.tsx", kind: "code" },
  { path: "src/screens/HomeScreen.tsx", kind: "code" },
  { path: "src/screens/CodeScreen.tsx", kind: "code" },
  { path: "src/screens/WorkspaceDetail.tsx", kind: "code" },
  { path: "src/components/ui/glass-panel.tsx", kind: "code" },
  { path: "src/components/ui/workspace-card.tsx", kind: "code" },
  { path: "src/components/ui/terminal-log.tsx", kind: "code" },
  { path: "src/lib/workspaces.ts", kind: "code" },
  { path: "src/lib/workspace-detail.ts", kind: "code" },
  { path: "src/index.css", kind: "config" },
  { path: "vite.config.ts", kind: "config" },
  { path: "tsconfig.json", kind: "config" },
  { path: "package.json", kind: "config" },
  { path: "README.md", kind: "doc" },
  { path: "docs/architecture.md", kind: "doc" },
];

export function agentById(id?: string): WorkspaceAgent | undefined {
  return AGENTS.find((a) => a.id === id);
}
