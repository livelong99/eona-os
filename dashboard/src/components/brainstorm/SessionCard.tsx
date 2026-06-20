import { MessageCircleQuestion, ArrowUpRight, Rocket } from "lucide-react";
import {
  type BrainstormSession,
  BRAINSTORM_STATUS_META,
} from "@/lib/brainstorm";

interface SessionCardProps {
  session: BrainstormSession;
  onOpen: (id: string) => void;
  onPromote: (id: string) => void;
}

// SessionCard — one brainstorming session in the list. Shows status, refinement
// progress, and Q&A counts. PRD-ready sessions expose a "Promote to workspace"
// action; others show "Continue".
export function SessionCard({ session, onOpen, onPromote }: SessionCardProps) {
  const status = BRAINSTORM_STATUS_META[session.status];
  const ready = session.status === "prd-ready";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(session.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(session.id);
        }
      }}
      className="group flex cursor-pointer flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_18px_50px_rgba(0,0,0,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/70"
    >
      {/* header */}
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight text-white">
          {session.title}
        </h3>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/70"
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${status.pulse ? "animate-pulse" : ""}`}
            style={{ background: status.color }}
          />
          {status.label}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-white/50">
        {session.brief}
      </p>

      {/* progress */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/45">
          <span>Refinement</span>
          <span className="font-medium text-white/65">{session.progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${session.progress}%`,
              background: ready
                ? "linear-gradient(90deg,#34d399,#4f8cff)"
                : "linear-gradient(90deg,#5227FF,#4f8cff)",
            }}
          />
        </div>
      </div>

      {/* footer */}
      <div className="mt-4 flex items-center gap-3 text-[12px] text-white/50">
        <span className="inline-flex items-center gap-1.5">
          <MessageCircleQuestion className="h-3.5 w-3.5 text-white/40" />
          {session.questionsAnswered} answered
          {session.questionsOpen > 0 && (
            <span className="text-white/35">· {session.questionsOpen} open</span>
          )}
        </span>
        <span className="ml-auto whitespace-nowrap text-white/35">{session.updated}</span>
      </div>

      {/* action */}
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        {ready ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPromote(session.id);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#34d399]/15 px-3 py-2 text-[13px] font-medium text-[#34d399] transition-colors duration-200 hover:bg-[#34d399]/25 cursor-pointer"
          >
            <Rocket className="h-4 w-4" />
            Promote to workspace
          </button>
        ) : (
          <span className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-white/55 transition-colors group-hover:text-white/80">
            Continue refining
            <ArrowUpRight className="h-4 w-4 -translate-x-0.5 transition-transform group-hover:translate-x-0" />
          </span>
        )}
      </div>
    </div>
  );
}
