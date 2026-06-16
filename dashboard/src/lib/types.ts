// Core domain types for the Agent Home dashboard.

/** Provider tiers, free-first. See docs/architecture.md §4.C. */
export type Tier = "A" | "B" | "C" | "D";

export interface TierMeta {
  tier: Tier;
  label: string;
  /** true = prompts may be logged by the provider (Tier B). */
  logged: boolean;
  /** allowed to handle sensitive data? */
  sensitiveOk: boolean;
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
