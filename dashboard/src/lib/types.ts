// Core domain types for the Agent Home dashboard.

/** Provider role. Claude is the only runtime, so there is a single tier. */
export type Tier = "primary";

export interface TierMeta {
  tier: Tier;
  label: string;
}

export interface Agent {
  id: string;
  name: string;
  /** tailwind gradient classes for the circular icon */
  gradient: string;
  tier: Tier;
  /** default model id surfaced in the composer */
  model: string;
  blurb: string;
}

export type ChatRole = "user" | "agent";

export interface Message {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
}

/** Hermes Kanban statuses. */
export type TaskStatus =
  | "triage"
  | "todo"
  | "ready"
  | "running"
  | "blocked"
  | "done"
  | "archived";

export const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "triage", label: "Triage" },
  { status: "todo", label: "To Do" },
  { status: "ready", label: "Ready" },
  { status: "running", label: "Running" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  /** assigned profile/agent id */
  assignee?: string;
  tier?: Tier;
  updatedAt: number;
}

export interface MemoryNode {
  id: string;
  label: string;
  /** 0..1 normalized position for the static galaxy layout */
  x: number;
  y: number;
  /** relative size */
  weight: number;
}

export interface MemoryEdge {
  from: string;
  to: string;
}

export interface MemoryGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

/** A streamed Hermes task_event. */
export interface TaskEvent {
  id: string;
  taskId: string;
  kind: string;
  message: string;
  ts: number;
}

// --- RunEvent (CONTRACT, Phase 0) -------------------------------------------
// The canonical run-stream event the Glass Cockpit, the tools Workbench, and the
// Trust Rail consume. MUST stay in lockstep with engine/agent/run_events.py.
// Worker W-A produces these (extending streamRunEvents parsing); consumers must
// tolerate unknown kinds/fields (render generically, never crash).
export type RunEventKind =
  | "run.header"
  | "message.delta"
  | "reasoning.available"
  | "tool.started"
  | "tool.completed"
  | "diff"
  | "terminal"
  | "subagent.started"
  | "subagent.completed"
  | "approval.request"
  | "approval.responded"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";

export const RUN_EVENT_KINDS: readonly RunEventKind[] = [
  "run.header", "message.delta", "reasoning.available",
  "tool.started", "tool.completed", "diff", "terminal",
  "subagent.started", "subagent.completed",
  "approval.request", "approval.responded",
  "run.completed", "run.failed", "run.cancelled",
] as const;

export interface RunEvent {
  event: RunEventKind;
  runId: string;
  timestamp: number;
  // kind-specific (all optional; mirror run_events.py)
  text?: string;
  tool?: string;
  preview?: string;
  duration?: number;
  error?: boolean | string;
  path?: string;
  patch?: string;
  spanId?: string;
  parentToolUseId?: string | null;
  subagentType?: string;
  model?: string;
  tools?: string[];
  mcpServers?: string[];
  choices?: string[];
  choice?: string;
  output?: string;
  usage?: Record<string, unknown>;
}
