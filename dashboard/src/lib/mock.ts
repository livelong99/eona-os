// Offline mock data so the dashboard runs and is demonstrable before the
// Hermes gateway (127.0.0.1:8642) is up. Replaced by live data when available.
import type { MemoryGraph, Task, TaskEvent } from "./types";

const now = Date.now();
const min = (m: number) => now - m * 60_000;

export const MOCK_TASKS: Task[] = [
  { id: "t1", title: "Research: free Veo prompt patterns", status: "running", assignee: "researcher", tier: "fallback", updatedAt: min(2) },
  { id: "t2", title: "Draft launch post for Agent Home", status: "ready", assignee: "writer", tier: "fallback", updatedAt: min(9) },
  { id: "t3", title: "SEO pass on architecture note", status: "todo", assignee: "seo", tier: "bulk", updatedAt: min(14) },
  { id: "t4", title: "Generate hero image + teaser prompts", status: "running", assignee: "prompt-writer", tier: "fallback", updatedAt: min(1) },
  { id: "t5", title: "Triage: weekly content backlog", status: "triage", updatedAt: min(30) },
  { id: "t6", title: "Refactor vault sync script", status: "blocked", assignee: "claude", tier: "primary", updatedAt: min(22) },
  { id: "t7", title: "Summarize provider pricing", status: "done", assignee: "openrouter", tier: "bulk", updatedAt: min(50) },
  { id: "t8", title: "Bulk-tag 200 archive notes", status: "done", assignee: "openrouter", tier: "bulk", updatedAt: min(70) },
];

export const MOCK_EVENTS: TaskEvent[] = [
  { id: "e1", taskId: "t4", kind: "progress", message: "prompt-writer drafted 2/3 shots", ts: min(1) },
  { id: "e2", taskId: "t1", kind: "tool", message: "researcher: vault search hit 4 notes", ts: min(2) },
  { id: "e3", taskId: "t6", kind: "blocked", message: "claude: awaiting test fixture", ts: min(22) },
];

// A deterministic "memory galaxy" — radial layout with light jitter.
function galaxy(): MemoryGraph {
  const labels = [
    "architecture", "design-research", "prompt-foundry", "hermes", "obsidian-memory",
    "provider-mesh", "kanban", "goal-mode", "gemini", "claude-code", "openrouter",
    "google-flow", "seo", "writer", "researcher", "security", "tailscale", "veo-rules",
  ];
  const nodes = labels.map((label, i) => {
    const ring = i % 3; // 3 rings
    const r = 0.16 + ring * 0.17;
    const a = (i / labels.length) * Math.PI * 2 + ring * 0.6;
    const jitter = ((i * 9301 + 49297) % 233280) / 233280 - 0.5;
    return {
      id: label,
      label,
      x: 0.5 + Math.cos(a) * (r + jitter * 0.05),
      y: 0.5 + Math.sin(a) * (r + jitter * 0.05),
      weight: 0.6 + ((i * 7) % 5) / 5,
    };
  });
  const edges = nodes.slice(1).map((n, i) => ({
    from: n.id,
    to: nodes[(i * 3 + 1) % nodes.length].id,
  }));
  // anchor a hub
  edges.push({ from: "architecture", to: "hermes" }, { from: "architecture", to: "obsidian-memory" });
  return { nodes, edges };
}

export const MOCK_MEMORY: MemoryGraph = galaxy();
