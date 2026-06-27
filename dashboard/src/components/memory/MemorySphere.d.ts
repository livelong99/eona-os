import type { FC } from "react";
import type { GraphNode, GraphEdge, SoftEdge } from "@/lib/memory/engineClient";

export interface MemorySphereProps {
  /** The live vault notes — rendered as one GPU points layer, coloured by project. */
  nodes?: GraphNode[];
  /** The sparse `[[wikilink]]` edges — rendered as bright slerp arc tubes. */
  links?: GraphEdge[];
  /** Inferred "related" edges (shared tag/folder) — rendered as a faint secondary web. */
  softLinks?: SoftEdge[];
  /** Whether the soft-edge layer is shown (default true). */
  showSoftEdges?: boolean;
  /** Obsidian search query — dims non-matching nodes (literal fallback). */
  query?: string;
  /** Brain search hit ids — when set, highlights these and dims the rest. */
  matchIds?: string[] | null;
  /** Selected node id — emphasizes it + its neighbors and lights their arcs. */
  selectedId?: string | null;
  /** Precomputed neighbour ids of the selected node (from getNote links/backlinks). */
  neighborIds?: string[] | null;
  onSelect?: (id: string | null) => void;
  /**
   * Which brain's accent palette to render. "vault" (default) keeps the native
   * per-project colours; "cognee" tints clusters + atmosphere toward teal so the
   * derived knowledge graph reads as a distinct brain. Palette only — no fork.
   */
  variant?: "vault" | "cognee";
}

declare const MemorySphere: FC<MemorySphereProps>;
export default MemorySphere;
