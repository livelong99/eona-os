import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  MessageCircleQuestion,
  Gauge,
  Rocket,
  Loader,
  Send,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { AgentHome } from "@/components/brainstorm/AgentHome";
import { RequirementView } from "@/components/brainstorm/RequirementView";
import { QnAView } from "@/components/brainstorm/QnAView";
import { ReadinessCard } from "@/components/brainstorm/ReadinessCard";
import { ExecutionConsole, ALL_AGENTS } from "@/components/brainstorm/ExecutionConsole";
import { useBrainstormRun } from "@/components/brainstorm/useBrainstormRun";
import {
  getLatestRun,
  getRunStatus,
  BRAINSTORM_TOOL_ID,
} from "@/lib/brainstorm/brainstormClient";
import { createWorkspace } from "@/lib/workspace/workspaceClient";

type RightView = "qna" | "readiness" | "requirement";

interface NavState {
  title?: string;
  brief?: string;
  runId?: string;
  sessionId?: string;
}

interface Resolved {
  phase: "loading" | "ready" | "missing";
  runId: string | null;
  live: boolean;
}

export function BrainstormSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as NavState | null) ?? null;
  const slug = id ?? "";

  // Resolve the run: fresh launch passes runId via nav state; a deep-link / hard
  // reload recovers it from the latest run for this slug + its liveness.
  const [resolved, setResolved] = useState<Resolved>({
    phase: navState?.runId ? "ready" : "loading",
    runId: navState?.runId ?? null,
    live: Boolean(navState?.runId),
  });

  useEffect(() => {
    if (navState?.runId) return; // already have a live run from launch
    let cancelled = false;
    (async () => {
      try {
        const latest = await getLatestRun(BRAINSTORM_TOOL_ID, slug);
        if (cancelled) return;
        if (!latest) {
          setResolved({ phase: "missing", runId: null, live: false });
          return;
        }
        const status = await getRunStatus(latest.run_id);
        if (cancelled) return;
        setResolved({
          phase: "ready",
          runId: latest.run_id,
          live: Boolean(status?.live),
        });
      } catch {
        if (!cancelled) setResolved({ phase: "missing", runId: null, live: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, navState?.runId]);

  const { lanes, qna, readiness, prd, phase, streaming, submitAnswers, reviseDraft } =
    useBrainstormRun(resolved.runId, { streamLive: resolved.live });

  const title = qna?.project || navState?.title || slug || "New idea";
  const brief = qna?.brief || navState?.brief || "A fresh idea, just handed to the swarm.";
  const ready = phase === "prd-ready";

  const [view, setView] = useState<RightView>("qna");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [promoting, setPromoting] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>(ALL_AGENTS);
  const [prdNote, setPrdNote] = useState("");

  const sendPrdNote = async () => {
    const text = prdNote.trim();
    if (!text || streaming) return;
    setPrdNote("");
    await reviseDraft(text);
  };

  // When the PRD lands, surface it.
  useEffect(() => {
    if (ready) setView("requirement");
  }, [ready]);

  const openQuestions = useMemo(
    () => (qna?.questions ?? []).filter((q) => !q.answered),
    [qna],
  );

  const handleSubmit = async () => {
    const answers: Record<string, string> = {};
    for (const q of openQuestions) {
      const v = (drafts[q.id] ?? "").trim();
      if (v) answers[q.id] = v;
    }
    if (Object.keys(answers).length === 0) return;
    setDrafts({});
    await submitAnswers(answers);
  };

  const handlePromote = async () => {
    if (!resolved.runId) return;
    setPromoting(true);
    try {
      // Promote = create a workspace from this brainstorm: the engine copies the
      // PRD into 10_Projects/{slug} and launches the Architect orchestrator.
      const res = await createWorkspace({
        name: title,
        source_type: "brainstorm",
        source_ref: slug,
      });
      navigate(`/workspace/${res.workspace_id}`, {
        state: { name: title, runId: res.run_id, sessionId: res.session_id },
      });
    } catch {
      setPromoting(false);
    }
  };

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="flex w-full max-w-[1600px] gap-4">
        {/* Left: swarm roster + brief */}
        <GlassPanel className="w-[280px] shrink-0">
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
                    className={`h-1.5 w-1.5 rounded-full ${streaming ? "animate-pulse" : ""}`}
                    style={{ background: ready ? "#34d399" : "#4f8cff" }}
                  />
                  {ready ? "PRD ready" : streaming ? "Swarm working" : "Refining"}
                </p>
              </div>
            </header>

            {/* compact: clamped to a few lines so the agent roster stays visible;
                full text shows in a hover overlay so it never eats the column. */}
            <div className="group relative shrink-0">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-white/35">
                  Idea brief
                </p>
                <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-relaxed text-white/60">{brief}</p>
              </div>
              <div className="invisible absolute left-0 right-0 top-0 z-30 rounded-xl border border-white/15 p-3 opacity-0 shadow-[0_24px_70px_rgba(0,0,0,0.6)] transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                style={{ background: "rgba(16,17,26,0.98)", backdropFilter: "blur(12px)" }}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-white/35">
                  Idea brief
                </p>
                <p className="mt-1.5 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/70">{brief}</p>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <AgentHome lanes={lanes} selectedId={selectedAgent} onSelect={setSelectedAgent} />
            </div>
          </div>
        </GlassPanel>

        {/* Center: glass-box execution */}
        <GlassPanel className="min-w-0 flex-1">
          <div
            className="m-3 h-[calc(100%-1.5rem)] overflow-hidden rounded-xl border border-white/[0.08]"
            style={{ background: "rgba(0,0,0,0.22)" }}
          >
            {resolved.phase === "loading" ? (
              <Centered>
                <Loader className="h-4 w-4 animate-spin text-white/50" /> Resolving run…
              </Centered>
            ) : resolved.phase === "missing" ? (
              <Centered>No run found for this idea yet.</Centered>
            ) : (
              <ExecutionConsole lanes={lanes} streaming={streaming} selectedId={selectedAgent} />
            )}
          </div>
        </GlassPanel>

        {/* Right: Q&A / Readiness / PRD */}
        <GlassPanel className="w-[440px] shrink-0">
          <header className="flex items-center gap-2 px-4 py-3">
            <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <ToggleButton
                active={view === "qna"}
                onClick={() => setView("qna")}
                icon={<MessageCircleQuestion className="h-4 w-4" />}
                label="Q&A"
              />
              <ToggleButton
                active={view === "readiness"}
                onClick={() => setView("readiness")}
                icon={<Gauge className="h-4 w-4" />}
                label="Readiness"
              />
              <ToggleButton
                active={view === "requirement"}
                onClick={() => setView("requirement")}
                icon={<FileText className="h-4 w-4" />}
                label="PRD"
              />
            </div>

            <div className="ml-auto">
              {ready && (
                <button
                  type="button"
                  onClick={handlePromote}
                  disabled={promoting}
                  className="flex items-center gap-2 rounded-lg bg-[#34d399]/15 px-3 py-1.5 text-[12.5px] font-semibold text-[#34d399] transition-colors duration-200 hover:bg-[#34d399]/25 disabled:opacity-50 cursor-pointer"
                >
                  {promoting ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Promote
                </button>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 px-4 pb-4">
            <div
              className="h-full min-h-0 overflow-hidden rounded-xl border border-white/[0.08]"
              style={{ background: "rgba(0,0,0,0.22)" }}
            >
              {view === "qna" ? (
                <QnAView
                  questions={qna?.questions ?? []}
                  drafts={drafts}
                  onDraftChange={(qid, value) => setDrafts((d) => ({ ...d, [qid]: value }))}
                  onSubmit={handleSubmit}
                  processing={streaming}
                />
              ) : view === "readiness" ? (
                <ReadinessCard readiness={readiness} />
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <RequirementView
                      markdown={prd ?? "_The PRD is drafted once the product is dev-ready._"}
                      generating={!prd && streaming}
                    />
                  </div>
                  {/* Chat to request PRD changes once it's drafted. */}
                  {prd && (
                    <div className="shrink-0 border-t border-white/10 p-2.5">
                      <div className="flex items-end gap-2">
                        <textarea
                          value={prdNote}
                          onChange={(e) => setPrdNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void sendPrdNote();
                            }
                          }}
                          rows={1}
                          placeholder="Suggest a change to the PRD…"
                          disabled={streaming}
                          className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-white/25 disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={() => void sendPrdNote()}
                          disabled={streaming || !prdNote.trim()}
                          title="Send to the swarm"
                          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg bg-[#5227FF] text-white transition-colors hover:bg-[#6438ff] disabled:opacity-40 cursor-pointer"
                        >
                          {streaming ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </GlassPanel>
      </div>
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 px-6 text-center text-[12.5px] text-white/45">
      {children}
    </div>
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
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-200 cursor-pointer ${
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
