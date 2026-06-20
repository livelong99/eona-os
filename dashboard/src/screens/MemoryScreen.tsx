import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Orbit, X, RotateCw, AlertTriangle, Sparkles, Spline } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import MemorySphere from "@/components/memory/MemorySphere";
import { MemorySidebar } from "@/components/memory/MemorySidebar";
import { NodeDetail } from "@/components/memory/NodeDetail";
import { projectColor } from "@/lib/memory";
import {
  getMemoryGraph,
  searchMemory,
  type MemoryGraph,
  type SearchResponse,
} from "@/lib/memory/engineClient";

// MemoryScreen — a 3D sphere of the *live* Obsidian vault (left: search + filters),
// with a node-detail card overlaying the sphere when a note is selected. The graph
// (nodes + edges + project palette) is loaded from the engine on mount; search is
// Brain-backed with a filesystem fallback.
export function MemoryScreen() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // Soft "related" edges (shared tag/folder) are shown by default as ambient context.
  const [showSoftEdges, setShowSoftEdges] = useState(true);

  // ── graph load ────────────────────────────────────────────────────────────
  const [graph, setGraph] = useState<MemoryGraph | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGraph = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setGraphError(null);
    getMemoryGraph(ctrl.signal)
      .then((g) => {
        setGraph(g);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setGraphError(err instanceof Error ? err.message : "Failed to load graph");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => loadGraph(), [loadGraph]);

  // ── Brain search (debounced) ──────────────────────────────────────────────
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearch(null);
      searchAbort.current?.abort();
      return;
    }
    const handle = setTimeout(() => {
      searchAbort.current?.abort();
      const ctrl = new AbortController();
      searchAbort.current = ctrl;
      searchMemory(q, 20, ctrl.signal)
        .then((res) => {
          if (!ctrl.signal.aborted) setSearch(res);
        })
        .catch(() => {
          // Search failure falls back to the sphere's literal query dimming.
          if (!ctrl.signal.aborted) setSearch(null);
        });
    }, 280);
    return () => clearTimeout(handle);
  }, [query]);

  const matchIds = useMemo(
    () => (search ? search.results.map((r) => r.id) : null),
    [search],
  );

  // Project legend (deduped, stable colour) for the bottom-left chips.
  const projects = useMemo(() => {
    if (!graph) return [];
    const provided = graph.projects?.length
      ? graph.projects
      : [...new Set(graph.nodes.map((n) => n.project).filter(Boolean))].map((id) => ({
          id: id as string,
          label: id as string,
          color: projectColor(id),
        }));
    // top projects by node count so the legend stays compact
    const counts = new Map<string, number>();
    for (const n of graph.nodes) if (n.project) counts.set(n.project, (counts.get(n.project) ?? 0) + 1);
    return [...provided]
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
      .slice(0, 8);
  }, [graph]);

  const stats = useMemo(() => {
    if (!graph) return { notes: 0, links: 0, projects: 0 };
    const projectSet = new Set(graph.nodes.map((n) => n.project).filter(Boolean));
    return { notes: graph.nodes.length, links: graph.links.length, projects: projectSet.size };
  }, [graph]);

  // Only surface the soft-edge toggle/legend when the engine actually sent them
  // (older engines omit softLinks — stay graceful).
  const hasSoftEdges = (graph?.softLinks?.length ?? 0) > 0;

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="relative flex w-full max-w-[1440px] gap-4">
        {/* Left panel — search + filters */}
        <GlassPanel className="w-[300px] shrink-0">
          <div className="flex h-full flex-col gap-4 p-4">
            <header className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5227FF]/20">
                <Brain className="h-5 w-5 text-[#a78bfa]" />
              </span>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
                  Agent OS
                </p>
                <h1 className="text-xl font-semibold tracking-tight text-white">Memory</h1>
              </div>
            </header>

            <div className="min-h-0 flex-1">
              <MemorySidebar
                query={query}
                onQuery={setQuery}
                stats={stats}
                searchSource={search?.source ?? null}
                searchCount={search?.results.length ?? null}
              />
            </div>
          </div>
        </GlassPanel>

        {/* Right panel — the node sphere */}
        <GlassPanel className="min-w-0 flex-1">
          <div className="relative h-full">
            {/* legend / hint */}
            <div className="pointer-events-none absolute left-5 top-4 z-10 flex items-center gap-2 text-[12px] text-white/45">
              <Orbit className="h-4 w-4 text-[#a78bfa]" />
              <span>Knowledge graph · drag to rotate · click a node</span>
            </div>

            {/* project legend */}
            {projects.length > 0 && (
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
            {graph && !graphError && (
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
                    onClick={() => setShowSoftEdges((v) => !v)}
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

            {/* active search chip + brain/fs hint */}
            {query && (
              <div className="absolute right-5 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[12px] text-white/75 backdrop-blur-md">
                {search && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide"
                    style={{ color: search.source === "brain" ? "#a78bfa" : "#8a8fa3" }}
                    title={search.source === "brain" ? "Semantic results via Brain" : "Literal results via filesystem"}
                  >
                    <Sparkles className="h-3 w-3" />
                    via {search.source}
                  </span>
                )}
                <span className="text-white/45">filter:</span>
                <span className="font-medium">{query}</span>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear filter"
                  className="grid h-4 w-4 place-items-center rounded-full text-white/50 hover:text-white cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* loading skeleton — reserves layout */}
            {loading && (
              <div className="absolute inset-0 z-20 grid place-items-center">
                <div className="flex flex-col items-center gap-3 text-white/45">
                  <div className="h-24 w-24 animate-pulse rounded-full border border-white/10 bg-white/[0.04]" />
                  <p className="text-[12px]">Loading knowledge graph…</p>
                </div>
              </div>
            )}

            {/* error + retry */}
            {!loading && graphError && (
              <div className="absolute inset-0 z-20 grid place-items-center">
                <div className="flex max-w-[320px] flex-col items-center gap-3 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f87171]/15">
                    <AlertTriangle className="h-6 w-6 text-[#f87171]" />
                  </span>
                  <p className="text-[13px] text-white/70">Couldn’t reach the vault graph.</p>
                  <p className="text-[11px] text-white/35">{graphError}</p>
                  <button
                    type="button"
                    onClick={loadGraph}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.09] cursor-pointer"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* the sphere — only mounts once a graph is present */}
            {graph && !graphError && (
              <MemorySphere
                nodes={graph.nodes}
                links={graph.links}
                softLinks={graph.softLinks}
                showSoftEdges={showSoftEdges}
                query={query}
                matchIds={matchIds}
                selectedId={selected}
                onSelect={setSelected}
              />
            )}

            {selected && (
              <NodeDetail
                nodeId={selected}
                onClose={() => setSelected(null)}
                onSelect={setSelected}
              />
            )}
          </div>
        </GlassPanel>
      </div>
    </section>
  );
}
