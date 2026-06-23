import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, Plus, Search, Wand, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { ToolCard } from "@/components/labs/ToolCard";
import { ToolBuilder } from "@/components/labs/ToolBuilder";
import {
  CATEGORIES,
  manifestToTool,
  TEMPLATE_GOALS,
  TEMPLATE_STEPS,
  TEMPLATE_INPUTS,
  TEMPLATE_OUTPUTS,
  type Tool,
  type ToolCategory,
} from "@/lib/labs";
import { getTools } from "@/lib/labs/toolsClient";
import {
  type BuilderState,
  EMPTY_BUILDER,
} from "@/components/labs/builderState";

// The Brand-Maker template seeds the builder with a fully-specified example.
const BRAND_MAKER_SEED: BuilderState = {
  ...EMPTY_BUILDER,
  name: "Brand Maker",
  tagline: "Generate a full brand identity from a one-line brief.",
  category: "Creative",
  icon: "palette",
  skill: "brand-identity-design",
  goals: TEMPLATE_GOALS,
  steps: TEMPLATE_STEPS,
  inputs: TEMPLATE_INPUTS,
  outputs: TEMPLATE_OUTPUTS,
  uiNotes: "Show logo mockups in a 2-up gallery with a download action; collect the brief in a single hero textarea.",
};

type Filter = "All" | ToolCategory;

type Load =
  | { phase: "loading" }
  | { phase: "ready"; tools: Tool[] }
  | { phase: "error"; message: string };

// LabsScreen — the tool gallery. Loads real tools from the engine; "New tool"
// (or the Brand Maker template) opens the multi-stage builder workflow, which
// materializes the tool and streams its build run.
export function LabsScreen() {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [builder, setBuilder] = useState<null | { seed?: BuilderState }>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoad((prev) => (prev.phase === "ready" ? prev : { phase: "loading" }));
    try {
      const manifests = await getTools(signal);
      if (signal?.aborted) return;
      setLoad({ phase: "ready", tools: manifests.map(manifestToTool) });
    } catch (err: unknown) {
      if (signal?.aborted) return;
      setLoad({
        phase: "error",
        message: err instanceof Error ? err.message : "Could not reach the engine.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const tools = load.phase === "ready" ? load.tools : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      const matchesQ =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q);
      const matchesCat = filter === "All" || t.category === filter;
      return matchesQ && matchesCat;
    });
  }, [tools, query, filter]);

  // After a build completes: refresh the gallery, then open the new tool.
  const onPublished = (toolId: string) => {
    setBuilder(null);
    void refresh().then(() => navigate(`/labs/${toolId}`));
  };

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="relative w-full max-w-[1440px]">
      <GlassPanel className="h-full w-full">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-4 px-6 py-5 sm:px-8">
          <div className="mr-auto flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5227FF]/20">
              <FlaskConical className="h-5 w-5 text-[#a78bfa]" />
            </span>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
                Eona OS
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Labs</h1>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools"
              aria-label="Search tools"
              className="w-52 rounded-full border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/25 focus:bg-white/[0.08]"
            />
          </div>

          <button
            type="button"
            onClick={() => setBuilder({})}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors duration-200 cursor-pointer"
            style={{ background: "#5227FF" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#6438ff")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#5227FF")}
          >
            <Plus className="h-4 w-4" />
            New tool
          </button>
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

        {/* Tool grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {load.phase === "loading" && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/45">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tools…
            </div>
          )}

          {load.phase === "error" && (
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f87171]/15">
                <AlertTriangle className="h-6 w-6 text-[#f87171]" />
              </span>
              <p className="text-[14px] font-medium text-white/80">Couldn't load tools</p>
              <p className="text-[12.5px] text-white/45">{load.message}</p>
              <button
                type="button"
                onClick={() => refresh()}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white/90 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}

          {load.phase === "ready" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* Brand-Maker template starter */}
                <button
                  type="button"
                  onClick={() => setBuilder({ seed: BRAND_MAKER_SEED })}
                  className="group flex min-h-[164px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.015] p-5 text-center transition-all duration-200 hover:border-[#5227FF]/50 hover:bg-[#5227FF]/[0.06] cursor-pointer"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#5227FF]/15 transition-colors group-hover:bg-[#5227FF]/25">
                    <Wand className="h-6 w-6 text-[#a78bfa]" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-white">Start from a template</p>
                    <p className="mt-0.5 text-[12px] text-white/45">
                      Open the builder pre-filled with Brand Maker
                    </p>
                  </div>
                </button>

                {filtered.map((t) => (
                  <ToolCard key={t.id} tool={t} onOpen={(id) => navigate(`/labs/${id}`)} />
                ))}
              </div>

              {tools.length > 0 && filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-white/40">
                  No tools match your search.
                </p>
              )}
              {tools.length === 0 && (
                <p className="py-10 text-center text-sm text-white/40">
                  No tools yet — build your first one with “New tool”.
                </p>
              )}
            </>
          )}
        </div>
      </GlassPanel>

      {builder && (
        <ToolBuilder
          seed={builder.seed}
          onClose={() => setBuilder(null)}
          onPublished={onPublished}
        />
      )}
      </div>
    </section>
  );
}
