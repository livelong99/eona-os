import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, FolderPlus, FolderSearch, GitBranch } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import {
  SEED_WORKSPACES,
  makeMockWorkspace,
  type Workspace,
} from "@/lib/workspaces";

// CodeScreen — a single glass panel (>90% of the viewport) that hosts the
// workspace picker. On load it lists every workspace; when none exist it offers
// to load one. Mockup only — actions add/remove mock workspaces locally.
export function CodeScreen() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(SEED_WORKSPACES);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.path.toLowerCase().includes(q) ||
        w.language.toLowerCase().includes(q),
    );
  }, [workspaces, query]);

  const activeCount = workspaces.filter((w) => w.agents > 0).length;

  const addWorkspace = () =>
    setWorkspaces((prev) => [makeMockWorkspace(prev.length + 1), ...prev]);

  const removeWorkspace = (id: string) =>
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));

  const isEmpty = workspaces.length === 0;
  const noMatches = !isEmpty && filtered.length === 0;

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <GlassPanel className="w-full max-w-[1440px]">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-4 px-6 py-5 sm:px-8">
          <div className="mr-auto">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
              Agent OS
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
              Workspaces
            </h1>
            <p className="mt-1 text-sm text-white/45">
              {workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}
              {activeCount > 0 && ` · ${activeCount} with agents running`}
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workspaces"
              aria-label="Search workspaces"
              className="w-56 rounded-full border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors duration-200 placeholder:text-white/40 focus:border-white/25 focus:bg-white/[0.08]"
            />
          </div>

          {/* New workspace */}
          <button
            type="button"
            onClick={addWorkspace}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors duration-200 cursor-pointer"
            style={{ background: "#5227FF" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#6438ff")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#5227FF")}
          >
            <Plus className="h-4 w-4" />
            New workspace
          </button>
        </header>

        <div className="h-px w-full bg-white/10" />

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {isEmpty ? (
            <EmptyState onLoad={addWorkspace} />
          ) : noMatches ? (
            <NoMatches query={query} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((w) => (
                <WorkspaceCard
                  key={w.id}
                  workspace={w}
                  onOpen={(wid) => navigate(`/workspace/${wid}`)}
                  onRemove={removeWorkspace}
                />
              ))}
            </div>
          )}
        </div>
      </GlassPanel>
    </section>
  );
}

// Shown when there are zero workspaces — invites loading one.
function EmptyState({ onLoad }: { onLoad: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div
        className="grid h-20 w-20 place-items-center rounded-2xl border border-white/10"
        style={{
          background: "rgba(255,255,255,0.04)",
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.18)",
        }}
      >
        <FolderPlus className="h-9 w-9 text-white/55" />
      </div>
      <h2 className="mt-6 text-xl font-semibold tracking-tight text-white">
        No workspaces yet
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">
        Open a project folder and the agent will index it, attach a team, and
        start working alongside you.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onLoad}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 cursor-pointer"
          style={{ background: "#5227FF" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#6438ff")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#5227FF")}
        >
          <FolderPlus className="h-4 w-4" />
          Load workspace
        </button>
        <button
          type="button"
          onClick={onLoad}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/85 transition-colors duration-200 hover:bg-white/[0.08] cursor-pointer"
        >
          <GitBranch className="h-4 w-4" />
          Clone from Git
        </button>
      </div>
    </div>
  );
}

// Shown when a search filters everything out.
function NoMatches({ query }: { query: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
      <FolderSearch className="h-10 w-10 text-white/35" />
      <p className="mt-4 text-sm text-white/55">
        No workspaces match{" "}
        <span className="font-medium text-white/80">“{query}”</span>
      </p>
    </div>
  );
}
