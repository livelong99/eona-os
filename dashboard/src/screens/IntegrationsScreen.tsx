import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Blocks, Search, RefreshCw, TriangleAlert } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { ManageModal } from "@/components/integrations/ManageModal";
import { CATEGORIES, toEngineId, type IntegrationCategory } from "@/lib/integrations";
import { getIntegrations, setEnabled } from "@/lib/integrations/engineClient";
import {
  mergeIntegrations,
  displayStatus,
  type IntegrationView,
} from "@/lib/integrations/view";

type Filter = "All" | IntegrationCategory;

// IntegrationsScreen — the channels & services the Hermes agent can connect to.
// Live status comes from the engine over /api/hermes; configured platforms can be
// enabled/disabled (optimistic + re-fetch). Secrets are never collected here.
export function IntegrationsScreen() {
  const [items, setItems] = useState<IntegrationView[]>(() => mergeIntegrations([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [managing, setManaging] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setError(null);
    try {
      const engine = await getIntegrations(ac.signal);
      if (ac.signal.aborted) return;
      setItems(mergeIntegrations(engine));
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => acRef.current?.abort();
  }, [load]);

  // Toggle a configured platform: optimistic flip, POST, then re-fetch truth.
  const onToggleEnabled = useCallback(
    async (uiId: string, enabled: boolean) => {
      setBusy((p) => new Set(p).add(uiId));
      setItems((p) =>
        p.map((i) =>
          i.id === uiId && i.engine ? { ...i, engine: { ...i.engine, enabled } } : i,
        ),
      );
      try {
        await setEnabled(toEngineId(uiId), enabled);
      } catch {
        // Re-fetch reconciles the optimistic flip with the engine's truth.
      } finally {
        await load();
        setBusy((p) => {
          const next = new Set(p);
          next.delete(uiId);
          return next;
        });
      }
    },
    [load],
  );

  const connectedCount = useMemo(
    () => items.filter((i) => displayStatus(i) === "connected").length,
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const matchesQ = !q || i.name.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q);
      const matchesCat = filter === "All" || i.category === filter;
      return matchesQ && matchesCat;
    });
  }, [items, query, filter]);

  const managed = items.find((i) => i.id === managing) ?? null;

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="relative w-full max-w-[1440px]">
        <GlassPanel className="h-full w-full">
          {/* Header */}
          <header className="flex flex-wrap items-center gap-4 px-6 py-5 sm:px-8">
            <div className="mr-auto flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5227FF]/20">
                <Blocks className="h-5 w-5 text-[#a78bfa]" />
              </span>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">Agent OS</p>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Integrations</h1>
              </div>
            </div>

            <p className="hidden text-sm text-white/45 sm:block">
              {loading ? "Loading…" : `${connectedCount} of ${items.length} connected`}
            </p>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search integrations"
                aria-label="Search integrations"
                className="w-52 rounded-full border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/25 focus:bg-white/[0.08]"
              />
            </div>
          </header>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2 px-6 pb-4 sm:px-8">
            {(["All", ...CATEGORIES] as Filter[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors duration-200 cursor-pointer ${
                  filter === c
                    ? "border-[#5227FF]/50 bg-[#5227FF]/20 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/80"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="h-px w-full bg-white/10" />

          {/* Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
            {error && (
              <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-[#f4694d]/25 bg-[#f4694d]/10 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[#f4a48d]">
                  <TriangleAlert className="h-4 w-4" />
                  Couldn't reach the engine. Showing the last known state.
                </span>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.1] cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {loading
                ? // Skeletons reserve the layout so the grid doesn't jump on load.
                  Array.from({ length: 9 }).map((_, i) => <CardSkeleton key={i} />)
                : filtered.map((it) => (
                    <IntegrationCard
                      key={it.id}
                      integration={it}
                      busy={busy.has(it.id)}
                      onToggleEnabled={onToggleEnabled}
                      onManage={(id) => setManaging(id)}
                    />
                  ))}
            </div>
            {!loading && filtered.length === 0 && (
              <p className="py-10 text-center text-sm text-white/40">No integrations match your search.</p>
            )}
          </div>
        </GlassPanel>

        {managed && (
          <ManageModal
            integration={managed}
            busy={busy.has(managed.id)}
            onToggleEnabled={onToggleEnabled}
            onClose={() => setManaging(null)}
          />
        )}
      </div>
    </section>
  );
}

// Matches the IntegrationCard footprint so the grid reserves space while loading.
function CardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-start gap-3">
        <span className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-white/[0.05]" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-24 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.04]" />
        </div>
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
      </div>
      <div className="mt-3 min-h-[2.4em] space-y-1.5">
        <div className="h-2.5 w-full animate-pulse rounded bg-white/[0.04]" />
        <div className="h-2.5 w-3/4 animate-pulse rounded bg-white/[0.04]" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
        <div className="h-3 w-20 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-6 w-11 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
    </div>
  );
}
