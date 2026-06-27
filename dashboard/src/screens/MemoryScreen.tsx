import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, X, Sparkles } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { MemorySidebar } from "@/components/memory/MemorySidebar";
import { NodeDetail } from "@/components/memory/NodeDetail";
import { CogneeNodeDetail } from "@/components/memory/CogneeNodeDetail";
import { BrainToggle, type Brain as BrainMode } from "@/components/memory/BrainToggle";
import { GraphStage } from "@/components/memory/GraphStage";
import {
  getMemoryGraph,
  getCogneeGraph,
  searchMemory,
  type MemoryGraph,
  type SearchResponse,
} from "@/lib/memory/engineClient";

// A selected node, tagged with the brain that produced it. Cognee nodes carry an
// id like `cognee:<entity>` (not a vault path) — so they route to CogneeNodeDetail
// and must NEVER hit getNote(); only real vault ids do.
type Selection = { id: string; brain: "vault" | "cognee" };

const isCogneeId = (id: string) => id.startsWith("cognee:");

// MemoryScreen — a 3D sphere of the *live* Obsidian vault, now dual-brain: an
// Obsidian · Cognee · Both selector switches the active brain (or shows both side
// by side). The vault and Cognee graphs share one contract and one renderer
// (MemorySphere), so the Cognee view differs only by accent palette. Search is
// Brain-backed (vault) with a filesystem fallback; the source chip reports which
// brain answered. Defaults to Obsidian so the screen is unchanged on load.
export function MemoryScreen() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selection | null>(null);
  // Soft "related" edges (shared tag/folder) are shown by default as ambient context.
  const [showSoftEdges, setShowSoftEdges] = useState(true);
  // Active brain — default Obsidian keeps the current view byte-for-byte on load.
  const [brain, setBrain] = useState<BrainMode>("obsidian");

  // ── vault graph load ──────────────────────────────────────────────────────
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

  // ── Cognee graph load (lazy — only fetched when a Cognee-bearing brain is on) ─
  const [cogneeGraph, setCogneeGraph] = useState<MemoryGraph | null>(null);
  const [cogneeError, setCogneeError] = useState<string | null>(null);
  const [cogneeLoading, setCogneeLoading] = useState(false);
  const cogneeAbort = useRef<AbortController | null>(null);
  const cogneeRequested = useRef(false);

  const loadCogneeGraph = useCallback(() => {
    cogneeAbort.current?.abort();
    const ctrl = new AbortController();
    cogneeAbort.current = ctrl;
    cogneeRequested.current = true;
    setCogneeLoading(true);
    setCogneeError(null);
    getCogneeGraph(ctrl.signal)
      .then((g) => {
        if (ctrl.signal.aborted) return;
        setCogneeGraph(g);
        setCogneeLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setCogneeError(err instanceof Error ? err.message : "Failed to load Cognee graph");
        setCogneeLoading(false);
      });
  }, []);

  // Kick the Cognee load the first time the user views it; abort only on unmount
  // (not on every brain toggle) so switching Cognee↔Both reuses the loaded graph.
  useEffect(() => {
    if (brain !== "obsidian" && !cogneeRequested.current) loadCogneeGraph();
  }, [brain, loadCogneeGraph]);
  useEffect(() => () => cogneeAbort.current?.abort(), []);

  // Switching brains clears the selection so a stale vault note can't linger over
  // the Cognee view (and vice-versa).
  useEffect(() => setSelected(null), [brain]);

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

  // Sidebar stats stay vault-centric (the search box queries the vault brain).
  const stats = useMemo(() => {
    if (!graph) return { notes: 0, links: 0, projects: 0 };
    const projectSet = new Set(graph.nodes.map((n) => n.project).filter(Boolean));
    return { notes: graph.nodes.length, links: graph.links.length, projects: projectSet.size };
  }, [graph]);

  // The selected Cognee node, resolved from the already-loaded graph (no fetch).
  const cogneeNode = useMemo(() => {
    if (!selected || !cogneeGraph) return null;
    if (selected.brain !== "cognee" && !isCogneeId(selected.id)) return null;
    return cogneeGraph.nodes.find((n) => n.id === selected.id) ?? null;
  }, [selected, cogneeGraph]);

  const selectVault = useCallback(
    (id: string | null) => setSelected(id ? { id, brain: "vault" } : null),
    [],
  );
  const selectCognee = useCallback(
    (id: string | null) => setSelected(id ? { id, brain: "cognee" } : null),
    [],
  );
  const toggleSoft = useCallback(() => setShowSoftEdges((v) => !v), []);

  const vaultStage = (
    <GraphStage
      variant="vault"
      graph={graph}
      loading={loading}
      error={graphError}
      onRetry={loadGraph}
      query={query}
      matchIds={matchIds}
      selectedId={selected?.brain === "vault" ? selected.id : null}
      onSelect={selectVault}
      showSoftEdges={showSoftEdges}
      onToggleSoftEdges={toggleSoft}
    />
  );

  const cogneeStage = (
    <GraphStage
      variant="cognee"
      graph={cogneeGraph}
      loading={cogneeLoading}
      error={cogneeError}
      onRetry={loadCogneeGraph}
      query={query}
      // Brain-search hits are vault paths; don't dim the Cognee sphere with them.
      matchIds={null}
      selectedId={selected?.brain === "cognee" ? selected.id : null}
      onSelect={selectCognee}
      showSoftEdges={showSoftEdges}
      onToggleSoftEdges={toggleSoft}
    />
  );

  // Cognee ids never resolve to a vault note — route them to CogneeNodeDetail and
  // never to getNote(). Vault detail only renders for real vault ids.
  const showCogneeDetail = !!selected && (selected.brain === "cognee" || isCogneeId(selected.id));
  const showVaultDetail = !!selected && !showCogneeDetail;

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="relative flex w-full max-w-[1440px] gap-4">
        {/* Left panel — brain selector, search + filters */}
        <GlassPanel className="w-[300px] shrink-0">
          <div className="flex h-full flex-col gap-4 p-4">
            <header className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5227FF]/20">
                <Brain className="h-5 w-5 text-[#a78bfa]" />
              </span>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
                  Eona OS
                </p>
                <h1 className="text-xl font-semibold tracking-tight text-white">Memory</h1>
              </div>
            </header>

            <BrainToggle value={brain} onChange={setBrain} />

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

        {/* Right panel — the node sphere(s) */}
        <GlassPanel className="min-w-0 flex-1">
          <div className="relative h-full">
            {/* active search chip + brain/fs/cognee hint */}
            {query && (
              <div className="absolute right-5 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[12px] text-white/75 backdrop-blur-md">
                {search && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide"
                    style={{
                      color:
                        search.source === "brain"
                          ? "#a78bfa"
                          : search.source === "cognee"
                            ? "#22d3ee"
                            : "#8a8fa3",
                    }}
                    title={
                      search.source === "brain"
                        ? "Semantic results via Brain"
                        : search.source === "cognee"
                          ? "Semantic results via Cognee"
                          : "Literal results via filesystem"
                    }
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

            {/* stage(s): single brain, or a split view for "Both" */}
            {brain === "both" ? (
              <div className="flex h-full gap-3">
                <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.06]">
                  {vaultStage}
                </div>
                <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.06]">
                  {cogneeStage}
                </div>
              </div>
            ) : brain === "cognee" ? (
              cogneeStage
            ) : (
              vaultStage
            )}

            {/* brain-aware detail card */}
            {showVaultDetail && selected && (
              <NodeDetail
                nodeId={selected.id}
                onClose={() => setSelected(null)}
                onSelect={selectVault}
              />
            )}
            {showCogneeDetail && cogneeNode && (
              <CogneeNodeDetail node={cogneeNode} onClose={() => setSelected(null)} />
            )}
          </div>
        </GlassPanel>
      </div>
    </section>
  );
}
