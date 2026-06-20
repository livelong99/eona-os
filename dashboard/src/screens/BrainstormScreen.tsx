import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Plus } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SessionCard } from "@/components/brainstorm/SessionCard";
import { NewSessionModal } from "@/components/brainstorm/NewSessionModal";
import { SESSIONS } from "@/lib/brainstorm";

// BrainstormScreen — the list of brainstorming sessions. PRD-ready sessions can
// be promoted to a workspace; "New brainstorm" opens the idea-brief form, which
// hands the idea to the team in the two-panel refinement view.
export function BrainstormScreen() {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  const readyCount = SESSIONS.filter((s) => s.status === "prd-ready").length;

  const startSession = (brief: { title: string; pitch: string; detail: string }) => {
    setModalOpen(false);
    navigate("/brainstorm/new", {
      state: { title: brief.title, brief: brief.detail },
    });
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
                Agent OS
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Brainstorm
              </h1>
            </div>
          </div>

          <p className="hidden text-sm text-white/45 sm:block">
            {SESSIONS.length} sessions · {readyCount} ready to build
          </p>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors duration-200 cursor-pointer"
            style={{ background: "#5227FF" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#6438ff")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#5227FF")}
          >
            <Plus className="h-4 w-4" />
            New brainstorm
          </button>
        </header>

        <div className="h-px w-full bg-white/10" />

        {/* Sessions grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SESSIONS.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onOpen={(sid) => navigate(`/brainstorm/${sid}`)}
                onPromote={() => navigate("/workspace")}
              />
            ))}
          </div>
        </div>
      </GlassPanel>

      {modalOpen && (
        <NewSessionModal onClose={() => setModalOpen(false)} onSubmit={startSession} />
      )}
      </div>
    </section>
  );
}
