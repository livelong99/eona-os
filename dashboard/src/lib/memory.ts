// Memory screen domain helpers. The nodes/links themselves come live from the
// engine (see src/lib/memory/engineClient.ts); this module only holds the
// presentation metadata: folder→colour, a stable project→colour palette (we
// cluster + colour by project since ~all notes live under 10_Projects/<project>),
// and the shared node/link types re-exported from the engine shape.

import type { GraphFolder, GraphNode, GraphEdge } from "@/lib/memory/engineClient";

// Re-export the engine shape under the names the UI has always used, so existing
// imports keep working without a churny rename.
export type NodeFolder = GraphFolder;
export type MemoryNode = GraphNode;
export type MemoryLink = GraphEdge;

// ── PARA folder → colour (fallback when a note has no project) ──────────────
export const FOLDER_META: Record<NodeFolder, { color: string }> = {
  Projects: { color: "#7c5cff" },
  Areas: { color: "#34d399" },
  Resources: { color: "#4f8cff" },
  Archive: { color: "#8a8fa3" },
  Daily: { color: "#f4c14d" },
  Inbox: { color: "#f472b6" },
};

// ── Project → colour (stable hashed palette) ────────────────────────────────
// Most notes live under 10_Projects/<project>/, so we colour and cluster by
// project. A project's colour must be stable across reloads and independent of
// iteration order, so we hash the slug into a fixed, visually-distinct palette
// rather than assigning by index.
const PROJECT_PALETTE = [
  "#7c5cff", // violet
  "#4f8cff", // blue
  "#34d399", // green
  "#f4c14d", // amber
  "#f472b6", // pink
  "#22d3ee", // cyan
  "#fb923c", // orange
  "#a78bfa", // lavender
  "#2dd4bf", // teal
  "#facc15", // gold
  "#60a5fa", // sky
  "#c084fc", // purple
  "#4ade80", // lime
  "#f87171", // red
  "#38bdf8", // light blue
  "#fbbf24", // yellow
];

// Deterministic 32-bit string hash (FNV-1a-ish). Same slug → same index → same
// colour, regardless of how the engine ordered the projects array.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable colour for a project slug. Falls back to the Projects folder colour. */
export function projectColor(project: string | null | undefined): string {
  if (!project) return FOLDER_META.Projects.color;
  return PROJECT_PALETTE[hashString(project) % PROJECT_PALETTE.length];
}

/** Colour a node by its project, falling back to its PARA folder. */
export function nodeColor(node: Pick<MemoryNode, "project" | "folder">): string {
  if (node.project) return projectColor(node.project);
  return FOLDER_META[node.folder]?.color ?? FOLDER_META.Projects.color;
}
