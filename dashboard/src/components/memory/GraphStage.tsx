import { lazy, Suspense, useMemo } from "react";
import { Orbit, Network, RotateCw, AlertTriangle, Spline } from "lucide-react";
import { projectColor } from "@/lib/memory";
import type { MemoryGraph, GraphProject } from "@/lib/memory/engineClient";

// MemorySphere renders the 3D graph via three.js (~498kB). Lazy-load it once here
// so the chunk stays off the eager bundle and is shared by both stages in the
// split ("Both") view.
const MemorySphere = lazy(() => import("@/components/memory/MemorySphere"));

export type StageVariant = "vault" | "cognee";

interface GraphStageProps {
  variant: StageVariant;
  graph: MemoryGraph | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  query: string;
  /** Brain-search hit ids (vault paths). Only the vault stage receives these. */
  matchIds: string[] | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showSoftEdges: boolean;
  onToggleSoftEdges: () => void;
}

const COPY: Record<StageVariant, { label: string; accent: string; emptyTitle: string; emptyHint: string }> = {
  vault: {
    label: "Obsidian vault",
    accent: "#a78bfa",
    emptyTitle: "No notes in the vault graph.",
    emptyHint: "The vault graph came back empty.",
  },
  cognee: {
    label: "Cognee graph",
    accent: "#22d3ee",
    emptyTitle: "No Cognee data yet.",
    emptyHint: "Cognee isn’t running or hasn’t ingested the vault yet — start the cognee profile and ingest to populate this brain.",
  },
};

// GraphStage — one brain's graph: the 3D sphere plus its loading / error / empty
// overlays and legends. Rendered once in single-brain mode and twice (vault left,
// Cognee right) in the split "Both" view, so the overlay JSX lives here once
// instead of being duplicated per column. Distinct styling between brains is the
// `variant` prop (palette only) — the renderer itself is reused verbatim.
export function GraphStage({
  variant,
  graph,
  loading,
  error,
  onRetry,
  query,
  matchIds,
  selectedId,
  onSelect,
  showSoftEdges,
  onToggleSoftEdges,
}: GraphStageProps) {
  const copy = COPY[variant];
  const HintIcon = variant === "cognee" ? Network : Orbit;

  // Project / cluster legend — engine-provided palette when present, else derived
  // from the nodes. Top clusters by node count so the legend stays compact.
  const projects = useMemo<GraphProject[]>(() => {
    if (!graph) return [];
    const provided = graph.projects?.length
      ? graph.projects
      : [...new Set(graph.nodes.map((n) => n.project).filter(Boolean))].map((id) => ({
          id: id as string,
          label: id as string,
          color: projectColor(id),
        }));
    const counts = new Map<string, number>();
    for (const n of graph.nodes) if (n.project) counts.set(n.project, (counts.get(n.project) ?? 0) + 1);
    return [...provided]
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
      .slice(0, 8);
  }, [graph]);

  const hasSoftEdges = (graph?.softLinks?.length ?? 0) > 0;
  const isEmpty = !loading && !error && graph != null && graph.nodes.length === 0;
  const hasGraph = graph != null && graph.nodes.length > 0;

  return (
    <div className="relative h-full w-full">
      {/* brain label / hint */}
      <div className="pointer-events-none absolute left-5 top-4 z-10 flex items-center gap-2 text-[12px] text-white/45">
        <HintIcon className="h-4 w-4" style={{ color: copy.accent }} />
        <span>{copy.label} · drag to rotate · click a node</span>
      </div>

      {/* cluster legend */}
      {projects.length > 0 && !error && (
        <div className="absolute bottom-4 left-5 z-10 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1">
          {projects.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5 text-[11px] text-white/50">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
          ))}
        </div>
      )}

      {/* link-type legend + soft-edge toggle (bottom-right) */}
      {hasGraph && !error && (
        <div className="absolute bottom-4 right-5 z-10 flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-3 text-[11px] text-white/45">
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-4 rounded-full bg-[#9ab4ff]" />
              links
            </span>
            {hasSoftEdges && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-[2px] w-4 rounded-full"
                  style={{ background: "#6b7280", opacity: showSoftEdges ? 0.7 : 0.25 }}
                />
                related
              </span>
            )}
          </div>
          {hasSoftEdges && (
            <button
              type="button"
              onClick={onToggleSoftEdges}
              aria-pressed={showSoftEdges}
              title="Toggle the faint shared-tag / shared-folder web"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/70 backdrop-blur-md transition-colors hover:bg-white/[0.09] cursor-pointer"
            >
              <Spline className="h-3 w-3" style={{ color: showSoftEdges ? "#a78bfa" : "#8a8fa3" }} />
              Related links
              <span
                className="ml-0.5 inline-flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors"
                style={{ background: showSoftEdges ? "#5227FF" : "rgba(255,255,255,0.15)" }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full bg-white transition-transform"
                  style={{ transform: showSoftEdges ? "translateX(10px)" : "translateX(0)" }}
                />
              </span>
            </button>
          )}
        </div>
      )}

      {/* loading skeleton */}
      {loading && (
        <div className="absolute inset-0 z-20 grid place-items-center">
          <div className="flex flex-col items-center gap-3 text-white/45">
            <div className="h-24 w-24 animate-pulse rounded-full border border-white/10 bg-white/[0.04]" />
            <p className="text-[12px]">Loading {copy.label}…</p>
          </div>
        </div>
      )}

      {/* error + retry */}
      {!loading && error && (
        <div className="absolute inset-0 z-20 grid place-items-center">
          <div className="flex max-w-[320px] flex-col items-center gap-3 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f87171]/15">
              <AlertTriangle className="h-6 w-6 text-[#f87171]" />
            </span>
            <p className="text-[13px] text-white/70">Couldn’t reach the {copy.label}.</p>
            <p className="text-[11px] text-white/35">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.09] cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* empty (fail-open) state — e.g. Cognee not ingested yet */}
      {isEmpty && (
        <div className="absolute inset-0 z-20 grid place-items-center">
          <div className="flex max-w-[320px] flex-col items-center gap-3 text-center">
            <span
              className="grid h-12 w-12 place-items-center rounded-full"
              style={{ background: `${copy.accent}22` }}
            >
              <HintIcon className="h-6 w-6" style={{ color: copy.accent }} />
            </span>
            <p className="text-[13px] text-white/70">{copy.emptyTitle}</p>
            <p className="text-[11px] text-white/35">{copy.emptyHint}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.09] cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* the sphere — only mounts once a non-empty graph is present */}
      {hasGraph && !error && (
        <Suspense fallback={null}>
          <MemorySphere
            variant={variant}
            nodes={graph.nodes}
            links={graph.links}
            softLinks={graph.softLinks}
            showSoftEdges={showSoftEdges}
            query={query}
            matchIds={matchIds}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </Suspense>
      )}
    </div>
  );
}
