import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, FolderGit2, FolderSearch, Loader, Hammer, Play, FlaskConical, Pencil, Check, X,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { NewWorkspaceModal } from "@/components/workspace/NewWorkspaceModal";
import { LogsModal } from "@/components/workspace/LogsModal";
import {
  getProjects,
  createWorkspace,
  renameWorkspace,
  WORKSPACE_TOOL_ID,
  type Project,
  type SourceType,
  type ScriptKind,
} from "@/lib/workspace/workspaceClient";

const CARD_ACTIONS: { kind: ScriptKind; label: string; icon: typeof Hammer; color: string }[] = [
  { kind: "build", label: "Build", icon: Hammer, color: "#7c9cff" },
  { kind: "run", label: "Run", icon: Play, color: "#34d399" },
  { kind: "test", label: "Test", icon: FlaskConical, color: "#f4c14d" },
];

// CodeScreen — the /workspace list. Lists real workspaces (project folders the
// pipeline has created) and launches new ones from a folder, GitHub repo, or a
// promoted brainstorm.
export function CodeScreen() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [logsFor, setLogsFor] = useState<{ slug: string; name: string; scripts?: Project["scripts"]; autoStart?: ScriptKind } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProjects(WORKSPACE_TOOL_ID)
      .then((ps) => !cancelled && setProjects(ps))
      .catch(() => !cancelled && setProjects([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name || p.id).toLowerCase().includes(q));
  }, [projects, query]);

  const onCreate = async (body: { name: string; source_type: SourceType; source_ref: string }) => {
    const res = await createWorkspace(body);
    setModalOpen(false);
    navigate(`/workspace/${res.workspace_id}`, {
      state: { name: body.name, runId: res.run_id, sessionId: res.session_id },
    });
  };

  const rename = async (slug: string, name: string) => {
    setProjects((ps) => ps.map((p) => (p.id === slug ? { ...p, name } : p))); // optimistic
    try {
      await renameWorkspace(slug, name);
    } catch {
      // reload to recover the authoritative name on failure
      getProjects(WORKSPACE_TOOL_ID).then(setProjects).catch(() => {});
    }
  };

  const noMatches = projects.length > 0 && filtered.length === 0;

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="relative w-full max-w-[1440px]">
        <GlassPanel className="h-full w-full">
          <header className="flex flex-wrap items-center gap-4 px-6 py-5 sm:px-8">
            <div className="mr-auto">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">Agent OS</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Workspaces</h1>
              <p className="mt-1 text-sm text-white/45">
                {projects.length} {projects.length === 1 ? "workspace" : "workspaces"}
              </p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workspaces"
                aria-label="Search workspaces"
                className="w-56 rounded-full border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/25 focus:bg-white/[0.08]"
              />
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors cursor-pointer"
              style={{ background: "#5227FF" }}
            >
              <Plus className="h-4 w-4" />
              New workspace
            </button>
          </header>

          <div className="h-px w-full bg-white/10" />

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-white/45">
                <Loader className="h-4 w-4 animate-spin" /> Loading workspaces…
              </div>
            ) : projects.length === 0 ? (
              <EmptyState onNew={() => setModalOpen(true)} />
            ) : noMatches ? (
              <NoMatches query={query} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((p) => (
                  <WorkspaceProjectCard
                    key={p.id}
                    project={p}
                    onOpen={() => navigate(`/workspace/${p.id}`)}
                    onScript={(kind) => setLogsFor({ slug: p.id, name: p.name || p.id, scripts: p.scripts, autoStart: kind })}
                    onRename={(name) => rename(p.id, name)}
                  />
                ))}
              </div>
            )}
          </div>
        </GlassPanel>

        {modalOpen && (
          <NewWorkspaceModal
            onClose={() => setModalOpen(false)}
            onCreate={onCreate}
            onOpenWorkspace={(slug) => {
              setModalOpen(false);
              navigate(`/workspace/${slug}`);
            }}
          />
        )}

        {logsFor && (
          <LogsModal
            slug={logsFor.slug}
            name={logsFor.name}
            scripts={logsFor.scripts}
            autoStart={logsFor.autoStart}
            onClose={() => setLogsFor(null)}
          />
        )}
      </div>
    </section>
  );
}

function WorkspaceProjectCard({
  project, onOpen, onScript, onRename,
}: {
  project: Project;
  onOpen: () => void;
  onScript: (kind: ScriptKind) => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name || project.id);
  const scripts = project.scripts;

  const save = () => {
    const v = draft.trim();
    if (v && v !== (project.name || project.id)) onRename(v);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(project.name || project.id);
    setEditing(false);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !editing && onOpen()}
      onKeyDown={(e) => {
        if (!editing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04] cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5227FF]/15">
          <FolderGit2 className="h-4.5 w-4.5 text-[#a78bfa]" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1" onClick={stop}>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") cancel();
                }}
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[14px] font-semibold text-white outline-none focus:border-white/30"
              />
              <button type="button" onClick={save} title="Save"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#34d399] hover:bg-white/10 cursor-pointer">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={cancel} title="Cancel"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/45 hover:bg-white/10 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-white/90">
              {project.name || project.id}
            </h3>
          )}
          <p className="mt-0.5 font-mono text-[11.5px] text-white/40">10_Projects/{project.id}</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={(e) => { stop(e); setEditing(true); }}
            title="Rename"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/35 opacity-0 transition-opacity hover:bg-white/10 hover:text-white/80 group-hover:opacity-100 cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-md bg-[#5227FF]/15 px-2 py-0.5 text-[11.5px] font-medium text-[#a78bfa]">
          {project.phase ?? "workspace"}
        </span>
        <div className="ml-auto flex items-center gap-1" onClick={stop}>
          {CARD_ACTIONS.map(({ kind, label, icon: Icon, color }) => {
            const available = scripts ? Boolean(scripts[kind]) : true;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onScript(kind)}
                disabled={!available}
                title={available ? label : `scripts/${kind}.sh not authored yet`}
                className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11.5px] font-medium transition-colors hover:bg-white/[0.07] disabled:opacity-30 cursor-pointer"
                style={{ color }}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div
        className="grid h-20 w-20 place-items-center rounded-2xl border border-white/10"
        style={{ background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.18)" }}
      >
        <FolderGit2 className="h-9 w-9 text-white/55" />
      </div>
      <h2 className="mt-6 text-xl font-semibold tracking-tight text-white">No workspaces yet</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">
        Ingest a folder, a GitHub repo, or a finished brainstorm — the Architect provisions a team
        and drives it through design, planning, and implementation.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-7 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-colors cursor-pointer"
        style={{ background: "#5227FF" }}
      >
        <Plus className="h-4 w-4" />
        New workspace
      </button>
    </div>
  );
}

function NoMatches({ query }: { query: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
      <FolderSearch className="h-10 w-10 text-white/35" />
      <p className="mt-4 text-sm text-white/55">
        No workspaces match <span className="font-medium text-white/80">“{query}”</span>
      </p>
    </div>
  );
}
