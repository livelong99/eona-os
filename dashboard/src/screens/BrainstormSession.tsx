import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, FileText, MessageCircleQuestion, Rocket } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { AgentHome } from "@/components/brainstorm/AgentHome";
import { RequirementView } from "@/components/brainstorm/RequirementView";
import { QnAView } from "@/components/brainstorm/QnAView";
import {
  sessionById,
  BRAINSTORM_STATUS_META,
  QUESTIONS,
  PRD_MARKDOWN,
  PRD_DRAFT_MARKDOWN,
  type BrainstormQuestion,
  type BrainstormStatus,
} from "@/lib/brainstorm";

type RightView = "requirement" | "qna";

// Follow-up questions the team asks after the first round of answers (mockup).
const FOLLOWUPS: Omit<BrainstormQuestion, "answered" | "answer">[] = [
  { id: "f1", agent: "Nova", category: "Edge cases", question: "What happens on a day with no input — silence, a nudge, or a recap of yesterday?" },
  { id: "f2", agent: "Piper", category: "Scope", question: "For v1, which single platform do we ship first — web, iOS, or desktop?" },
  { id: "f3", agent: "Cit", category: "Risk", question: "What's the biggest reason this could fail, and how do we de-risk it early?" },
];

export function BrainstormSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { title?: string; brief?: string } | null;

  const found = sessionById(id);
  const title = found?.title ?? navState?.title ?? "New idea";
  const brief = found?.brief ?? navState?.brief ?? "A fresh idea, just handed to the team.";
  const status: BrainstormStatus = found?.status ?? "drafting";
  const statusMeta = BRAINSTORM_STATUS_META[status];
  const ready = status === "prd-ready";
  const generating = status === "drafting";
  const markdown = generating ? PRD_DRAFT_MARKDOWN : PRD_MARKDOWN;

  const [view, setView] = useState<RightView>(ready ? "requirement" : "qna");
  const [questions, setQuestions] = useState<BrainstormQuestion[]>(QUESTIONS);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [followIdx, setFollowIdx] = useState(0);

  const submitAnswers = () => {
    setQuestions((prev) =>
      prev.map((q) => {
        const draft = (drafts[q.id] ?? "").trim();
        return !q.answered && draft ? { ...q, answered: true, answer: draft } : q;
      }),
    );
    setDrafts({});
    setProcessing(true);
    window.setTimeout(() => {
      if (followIdx < FOLLOWUPS.length) {
        const next = FOLLOWUPS[followIdx];
        setQuestions((prev) => [{ ...next, answer: "", answered: false }, ...prev]);
        setFollowIdx((i) => i + 1);
      }
      setProcessing(false);
    }, 1400);
  };

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="flex w-full max-w-[1440px] gap-4">
        {/* Left: agent home */}
        <GlassPanel className="w-[300px] shrink-0">
          <div className="flex h-full flex-col gap-3 p-4">
            <header className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => navigate("/brainstorm")}
                aria-label="Back to brainstorms"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight text-white">
                  {title}
                </h1>
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-white/50">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${statusMeta.pulse ? "animate-pulse" : ""}`}
                    style={{ background: statusMeta.color }}
                  />
                  {statusMeta.label}
                </p>
              </div>
            </header>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/35">
                Idea brief
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/60">{brief}</p>
            </div>

            <div className="min-h-0 flex-1">
              <AgentHome />
            </div>
          </div>
        </GlassPanel>

        {/* Right: requirement / QnA */}
        <GlassPanel className="min-w-0 flex-1">
          <header className="flex items-center gap-3 px-4 py-3">
            {/* segmented toggle */}
            <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <ToggleButton
                active={view === "requirement"}
                onClick={() => setView("requirement")}
                icon={<FileText className="h-4 w-4" />}
                label="Requirement"
              />
              <ToggleButton
                active={view === "qna"}
                onClick={() => setView("qna")}
                icon={<MessageCircleQuestion className="h-4 w-4" />}
                label="Q&A"
              />
            </div>

            <div className="ml-auto">
              {ready ? (
                <button
                  type="button"
                  onClick={() => navigate("/workspace")}
                  className="flex items-center gap-2 rounded-lg bg-[#34d399]/15 px-3.5 py-1.5 text-[13px] font-semibold text-[#34d399] transition-colors duration-200 hover:bg-[#34d399]/25 cursor-pointer"
                >
                  <Rocket className="h-4 w-4" />
                  Promote to workspace
                </button>
              ) : (
                <span className="text-[12px] text-white/45">
                  {found?.progress ?? 15}% refined
                </span>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 px-4 pb-4">
            <div
              className="h-full min-h-0 overflow-hidden rounded-xl border border-white/[0.08]"
              style={{ background: "rgba(0,0,0,0.22)" }}
            >
              {view === "requirement" ? (
                <RequirementView markdown={markdown} generating={generating} />
              ) : (
                <QnAView
                  questions={questions}
                  drafts={drafts}
                  onDraftChange={(qid, value) =>
                    setDrafts((d) => ({ ...d, [qid]: value }))
                  }
                  onSubmit={submitAnswers}
                  processing={processing}
                />
              )}
            </div>
          </div>
        </GlassPanel>
      </div>
    </section>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 cursor-pointer ${
        active
          ? "bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.18)]"
          : "text-white/55 hover:text-white/80"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
