// toolkit/agentRun — shared primitives for the glass-box, swarm-aware run
// experience used by every Agent OS tool (Brainstorm, Workspace, Brand Maker,
// and anything the Tool Forge creates). The brainstorm/workspace hooks predate
// this and re-export the types from here so there is a single source of truth.

export type LaneStatus = "thinking" | "writing" | "reviewing" | "idle" | "done";

// One execution lane = the main orchestrator OR a spawned specialist sub-agent.
// The run's SSE/transcript events are projected into lanes for the glass-box view.
export interface AgentLane {
  /** the main lane's id (e.g. "pm"/"architect"), else the spawning Task's id/role key. */
  id: string;
  label: string;
  role: string;
  /** a coarse role/metric key (creativity|feasibility|frontend|…) when inferable. */
  metric?: string;
  status: LaneStatus;
  /** accumulated reasoning ("thinking"). */
  thinking: string;
  /** accumulated assistant prose ("response"). */
  response: string;
  /** tool-call previews this agent made. */
  activity: string[];
  /** whether the lane is currently live. */
  active: boolean;
}

// A tool supplies its roster of specialist roles so spawn labels / transcript
// briefs route into a stable lane (the spawn lane merges with the transcript lane).
export interface LaneRole {
  key: string;
  label: string;
  match: RegExp;
}

/** Resolve a spawn label / brief to a role, or undefined when it's the main lane. */
export function inferRole(text: string, roles: LaneRole[]): { key: string; label: string } | undefined {
  for (const r of roles) if (r.match.test(text)) return { key: r.key, label: r.label };
  return undefined;
}

// A broad default roster so a generic swarm tool's spawns route into sensible
// lanes without per-tool config. Tools may pass their own roles to override.
export const DEFAULT_ROLES: LaneRole[] = [
  { key: "pm", label: "PM", match: /\bpm\b|product manager/i },
  { key: "strategist", label: "Strategist", match: /strateg/i },
  { key: "ux", label: "UX Designer", match: /\bux\b|user experience|experience design/i },
  { key: "designer", label: "Designer", match: /design(er)?|visual|art director/i },
  { key: "frontend", label: "Frontend", match: /front.?end|\bui\b/i },
  { key: "backend", label: "Backend", match: /back.?end|\bapi\b|server/i },
  { key: "prompt", label: "Prompt Engineer", match: /prompt/i },
  { key: "research", label: "Researcher", match: /research/i },
  { key: "analyst", label: "Analyst", match: /analyst|analysis/i },
  { key: "test", label: "Test", match: /test|\bqa\b/i },
  { key: "review", label: "Reviewer", match: /review|critic/i },
  { key: "writer", label: "Writer", match: /writer|copy|author/i },
];
