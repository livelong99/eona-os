import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Plus, Loader, FileText } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { NewSessionModal } from "@/components/brainstorm/NewSessionModal";
import {
  getProjects,
  launchBrainstorm,
  slugify,
  BRAINSTORM_TOOL_ID,
  type Project,
} from "@/lib/brainstorm/brainstormClient";

// BrainstormScreen — lists past brainstorm sessions (brand folders on disk) and
// launches new ones. "New brainstorm" opens the idea-brief form; on submit it
// launches the PM-swarm tool and routes into the live glass-box session.
export function BrainstormScreen() {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getProjects(BRAINSTORM_TOOL_ID);
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startSession = async (brief: { title: string; pitch: string; detail: string }) => {
    setModalOpen(false);
    setLaunching(true);
    const project = brief.title.trim();
    const ideaBrief = [brief.pitch.trim(), brief.detail.trim()].filter(Boolean).join("\n\n");
    const slug = slugify(project);
    try {
      const run = await launchBrainstorm(project, ideaBrief);
      navigate(`/brainstorm/${slug}`, {
        state: { title: project, brief: ideaBrief, runId: run.run_id, sessionId: run.session_id },
      });
    } catch {
      setLaunching(false);
    }
  };

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="relative w-full max-w-[1440px]">
        <GlassPanel className="h-full w-full">
          {/* Header */}
          <header className="flex flex-wrap items-center gap-4 px-6 py-5 sm:px-8">
            <div className="mr-auto flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5227FF]/20">
                <Sparkles className="h-5 w-5 text-[#a78bfa]" />
              </span>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
                  Eona OS
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Brainstorm</h1>
              </div>
            </div>

            <p className="hidden text-sm text-white/45 sm:block">
              {projects.length} session{projects.length === 1 ? "" : "s"}
            </p>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={launching}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors duration-200 disabled:opacity-60 cursor-pointer"
              style={{ background: "#5227FF" }}
            >
              {launching ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New brainstorm
            </button>
          </header>

          <div className="h-px w-full bg-white/10" />

          {/* Sessions grid */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-white/45">
                <Loader className="h-4 w-4 animate-spin" /> Loading sessions…
              </div>
            ) : projects.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-[14px] text-white/55">No brainstorm sessions yet.</p>
                <p className="mt-1 text-[12.5px] text-white/35">
                  Start one — the PM swarm will refine it into a dev-ready PRD.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onOpen={() => navigate(`/brainstorm/${p.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </GlassPanel>

        {modalOpen && (
          <NewSessionModal onClose={() => setModalOpen(false)} onSubmit={startSession} />
        )}
      </div>
    </section>
  );
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-left transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.04] cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5227FF]/15">
          <FileText className="h-4.5 w-4.5 text-[#a78bfa]" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-white/90">
            {project.name || project.id}
          </h3>
          <p className="mt-0.5 text-[12px] text-white/40">{project.updated}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11.5px] text-white/45">
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5">
          {project.artifact_count} file{project.artifact_count === 1 ? "" : "s"}
        </span>
        {project.kinds?.slice(0, 3).map((k) => (
          <span key={k} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-white/40">
            {k}
          </span>
        ))}
      </div>
    </button>
  );
}
