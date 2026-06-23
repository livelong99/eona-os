import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft, Send, Loader, FolderGit2, FileText, MessageCircleQuestion,
  Check, RotateCcw, Play, ListTree, Terminal, GitBranch,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { ExecutionConsole, ALL_AGENTS } from "@/components/brainstorm/ExecutionConsole";
import { QnAView } from "@/components/brainstorm/QnAView";
import { WorkspaceAgentPanel } from "@/components/workspace/WorkspaceAgentPanel";
import { PhaseStepper } from "@/components/workspace/PhaseStepper";
import { DesignDocView } from "@/components/workspace/DesignDocView";
import { EpicsStoriesView } from "@/components/workspace/EpicsStoriesView";
import { AutoManualToggle } from "@/components/workspace/AutoManualToggle";
import { StoryReviewGate } from "@/components/workspace/StoryReviewGate";
import { FeatureBar } from "@/components/workspace/FeatureBar";
import { LogsPanel } from "@/components/workspace/LogsPanel";
import { GitModal } from "@/components/workspace/GitModal";
import { useWorkspaceRun } from "@/components/workspace/useWorkspaceRun";
import {
  getLatestRun,
  getRunStatus,
  resumeWorkspace,
  WORKSPACE_TOOL_ID,
} from "@/lib/workspace/workspaceClient";

interface NavState {
  name?: string;
  runId?: string;
  sessionId?: string;
}
interface Resolved {
  phase: "loading" | "ready" | "missing";
  runId: string | null;
  live: boolean;
}

export function WorkspaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as NavState | null) ?? null;
  const slug = id ?? "";

  const [resolved, setResolved] = useState<Resolved>({
    phase: navState?.runId ? "ready" : "loading",
    runId: navState?.runId ?? null,
    live: Boolean(navState?.runId),
  });

  useEffect(() => {
    if (navState?.runId) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await getLatestRun(WORKSPACE_TOOL_ID, slug);
        if (cancelled) return;
        if (!latest) {
          setResolved({ phase: "missing", runId: null, live: false });
          return;
        }
        const status = await getRunStatus(latest.run_id);
        if (cancelled) return;
        setResolved({ phase: "ready", runId: latest.run_id, live: Boolean(status?.live) });
      } catch {
        if (!cancelled) setResolved({ phase: "missing", runId: null, live: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, navState?.runId]);

  const {
    lanes, state, qna, design, epics, phase, streaming, error, directive, submitAnswers,
    features, activeFeature, liveFeature, setActiveFeature, createFeature, switchFeature,
  } = useWorkspaceRun(resolved.runId, { streamLive: resolved.live });

  const name = state?.name || navState?.name || slug;
  const [selectedAgent, setSelectedAgent] = useState<string>(ALL_AGENTS);
  const [composer, setComposer] = useState("");
  const [view, setView] = useState<"design" | "epics" | "qna">("design");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showLogs, setShowLogs] = useState(false);
  const [showGit, setShowGit] = useState(false);
  const [resuming, setResuming] = useState(false);

  // Relaunch the orchestrator against the existing folder when there's no live
  // run (e.g. the in-memory run was lost on an engine restart).
  const resume = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      const r = await resumeWorkspace(slug);
      setResolved({ phase: "ready", runId: r.run_id, live: true });
    } catch {
      /* stays missing; the Resume button remains for another try */
    } finally {
      setResuming(false);
    }
  };

  // Workspace SETUP lifecycle (top-level phase) vs. the per-feature cycle.
  const setupPhase = phase === "ingesting" || phase === "provisioning" || phase === "documenting";
  const isLegacy = (features?.length ?? 0) === 0; // pre-feature workspaces use top-level state
  const viewedFeature = features?.find((f) => f.slug === activeFeature) ?? null;
  // The design→sprint→implement state we render: from the viewed feature, or
  // (legacy) the top-level workspace state.
  const cyclePhase = isLegacy ? phase : viewedFeature?.phase ?? null;
  const gates = isLegacy ? state?.gates : viewedFeature?.gates;
  const sprint = isLegacy ? state?.sprint : viewedFeature?.sprint;
  // Actions are only valid on the feature the orchestrator is actually working.
  const canAct = isLegacy || (viewedFeature != null && viewedFeature.slug === liveFeature);
  // Show feature navigation once the workspace is set up (or already feature-based).
  // Hidden for legacy mid-cycle workspaces (top-level phase is a cycle phase).
  const showFeatureBar = (features?.length ?? 0) > 0 || phase === "ready" || phase === "working";

  const openQuestions = (qna?.questions ?? []).filter((q) => !q.answered);
  const hasQna = openQuestions.length > 0;
  const inDesign = cyclePhase != null && cyclePhase.startsWith("design");
  const inSprint = cyclePhase != null && cyclePhase.startsWith("sprint");
  const inImplement = cyclePhase === "implementing" || cyclePhase === "done";
  const sprintPending = gates?.sprint === "pending" && Boolean(epics);
  const mode = state?.mode ?? "manual";
  const reviewStory = sprint?.stories?.find((s) => s.status === "review");

  // Surface the right tab automatically as the cycle advances.
  useEffect(() => {
    if ((cyclePhase === "design-qna" || cyclePhase === "sprint-qna") && hasQna) setView("qna");
    else if (inSprint || inImplement) setView("epics");
  }, [cyclePhase, hasQna, inSprint, inImplement]);

  const send = async () => {
    const text = composer.trim();
    if (!text || streaming || resuming) return;
    // No live run (e.g. after an engine restart) — resume first and keep the
    // typed text so it isn't lost; the user can send once the run is live.
    if (!resolved.runId) {
      await resume();
      return;
    }
    setComposer("");
    await directive(text);
  };

  const submitQnA = async () => {
    const answers: Record<string, string> = {};
    for (const q of openQuestions) {
      const v = (drafts[q.id] ?? "").trim();
      if (v) answers[q.id] = v;
    }
    if (Object.keys(answers).length === 0) return;
    setDrafts({});
    await submitAnswers(answers);
  };

  const approveDesign = () =>
    directive("I approve the design. Proceed to sprint planning.");
  const startSprint = () => directive("Start sprint planning.");
  const approveSprint = () =>
    directive("I approve the epics and stories. Begin implementation.");
  const setMode = (m: "manual" | "auto") =>
    directive(
      m === "auto"
        ? "Switch to auto mode and implement the remaining stories autonomously, halting only on a hard-stop or when all are done."
        : "Switch to manual mode and pause for my review after each story.",
    );
  const approveStory = () =>
    directive(`Story ${reviewStory?.id ?? "current"} approved. Proceed to the next story.`);

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="flex w-full max-w-[1600px] flex-col gap-3">
        {/* top bar: back + name + phase stepper */}
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            aria-label="Back to workspaces"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <FolderGit2 className="h-4 w-4 shrink-0 text-[#a78bfa]" />
          <h1 className="truncate text-sm font-semibold tracking-tight text-white">{name}</h1>
          <span className="hidden truncate text-[11px] text-white/35 sm:inline">10_Projects/{slug}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* stepper hidden on narrow (it's the widest element); Terminal stays */}
            <div className="hidden md:block">
              <PhaseStepper phase={cyclePhase ?? phase} />
            </div>
            <button
              type="button"
              onClick={() => setShowGit(true)}
              title="Branch, commits & push"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/[0.06] cursor-pointer"
            >
              <GitBranch className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Git</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLogs((v) => !v)}
              title="Build · Run · Test"
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                showLogs ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/60 hover:bg-white/[0.06]"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Terminal</span>
            </button>
          </div>
        </div>

        {/* feature navigation (each feature = an OpenSpec change) */}
        {showFeatureBar && (
          <FeatureBar
            features={features}
            activeFeature={activeFeature}
            liveFeature={liveFeature}
            streaming={streaming}
            setupPhase={setupPhase}
            onSelect={setActiveFeature}
            onCreate={createFeature}
          />
        )}

        <div className="flex min-h-0 flex-1 gap-3 xl:gap-4">
          {/* left: team — hidden on narrow screens (the execution console shows
              all agents anyway) so the center + right panels get the room. */}
          <GlassPanel className="hidden w-[240px] shrink-0 lg:block 2xl:w-[280px]">
            <div className="flex h-full flex-col gap-3 p-4">
              {state?.summary && (
                <div className="group relative shrink-0">
                  {/* compact: clamped to 3 lines so the team stays visible */}
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-white/35">Status</p>
                    <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-white/60">
                      {state.summary}
                    </p>
                  </div>
                  {/* full on hover: an overlay so it doesn't shift the layout */}
                  <div className="invisible absolute left-0 right-0 top-0 z-30 rounded-xl border border-white/15 p-3 opacity-0 shadow-[0_24px_70px_rgba(0,0,0,0.6)] transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                    style={{ background: "rgba(16,17,26,0.98)", backdropFilter: "blur(12px)" }}>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-white/35">Status</p>
                    <p className="mt-1.5 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/70">
                      {state.summary}
                    </p>
                  </div>
                </div>
              )}
              <div className="min-h-0 flex-1">
                <WorkspaceAgentPanel lanes={lanes} team={state?.team} selectedId={selectedAgent} onSelect={setSelectedAgent} />
              </div>
            </div>
          </GlassPanel>

          {/* center: glass-box execution */}
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
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                  <p className="max-w-md text-[13px] leading-relaxed text-white/55">
                    No live run for this workspace — the orchestrator session ended (or the engine
                    restarted). Resume it to keep working; your project + team are intact on disk.
                  </p>
                  <button
                    type="button"
                    onClick={resume}
                    disabled={resuming}
                    className="flex items-center gap-2 rounded-lg bg-[#5227FF] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#6438ff] disabled:opacity-50 cursor-pointer"
                  >
                    {resuming ? <Loader className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {resuming ? "Resuming…" : "Resume workspace"}
                  </button>
                </div>
              ) : (
                <ExecutionConsole lanes={lanes} streaming={streaming} selectedId={selectedAgent} />
              )}
            </div>
          </GlassPanel>

          {/* right: phase-aware panel (Design / Q&A) + actions + composer */}
          <GlassPanel className="w-[380px] shrink-0 2xl:w-[440px]">
            <header className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                <Tab active={view === "design"} onClick={() => setView("design")}
                  icon={<FileText className="h-4 w-4" />} label="Design" />
                <Tab active={view === "epics"} onClick={() => setView("epics")}
                  icon={<ListTree className="h-4 w-4" />} label="Epics" />
                <Tab active={view === "qna"} onClick={() => setView("qna")}
                  icon={<MessageCircleQuestion className="h-4 w-4" />}
                  label={`Q&A${hasQna ? ` · ${openQuestions.length}` : ""}`} />
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2 [&>button]:whitespace-nowrap">
                {!canAct && viewedFeature && (
                  <button type="button" onClick={() => switchFeature(viewedFeature.slug)} disabled={streaming}
                    title="Make this the active feature and resume it"
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50 cursor-pointer">
                    <Play className="h-3.5 w-3.5" /> Resume this feature
                  </button>
                )}
                {canAct && cyclePhase === "ready" && (
                  <button type="button" onClick={() => directive("Start the design.")} disabled={streaming}
                    className="flex items-center gap-1.5 rounded-lg bg-[#5227FF] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#6438ff] disabled:opacity-50 cursor-pointer">
                    <Play className="h-3.5 w-3.5" /> Start design
                  </button>
                )}
                {canAct && cyclePhase === "design-review" && (
                  <button type="button" onClick={approveDesign} disabled={streaming}
                    className="flex items-center gap-1.5 rounded-lg bg-[#34d399]/15 px-3 py-1.5 text-[12.5px] font-semibold text-[#34d399] transition-colors hover:bg-[#34d399]/25 disabled:opacity-50 cursor-pointer">
                    <Check className="h-3.5 w-3.5" /> Approve design
                  </button>
                )}
                {canAct && cyclePhase === "design-approved" && (
                  <button type="button" onClick={startSprint} disabled={streaming}
                    className="flex items-center gap-1.5 rounded-lg bg-[#5227FF] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#6438ff] disabled:opacity-50 cursor-pointer">
                    <Play className="h-3.5 w-3.5" /> Start sprint planning
                  </button>
                )}
                {canAct && sprintPending && (
                  <button type="button" onClick={approveSprint} disabled={streaming}
                    className="flex items-center gap-1.5 rounded-lg bg-[#34d399]/15 px-3 py-1.5 text-[12.5px] font-semibold text-[#34d399] transition-colors hover:bg-[#34d399]/25 disabled:opacity-50 cursor-pointer">
                    <Check className="h-3.5 w-3.5" /> Approve epics &amp; stories
                  </button>
                )}
                {canAct && inImplement && (
                  <AutoManualToggle mode={mode} streaming={streaming} onChange={setMode} />
                )}
              </div>
            </header>

            {reviewStory && inImplement && (
              <div className="px-4 pb-2">
                <StoryReviewGate
                  story={reviewStory}
                  auto={mode === "auto"}
                  streaming={streaming}
                  onApprove={approveStory}
                  onRequestChanges={send}
                />
              </div>
            )}

            <div className="min-h-0 flex-1 px-4">
              <div className="h-full min-h-0 overflow-hidden rounded-xl border border-white/[0.08]" style={{ background: "rgba(0,0,0,0.22)" }}>
                {view === "qna" ? (
                  <QnAView
                    questions={qna?.questions ?? []}
                    drafts={drafts}
                    onDraftChange={(qid, value) => setDrafts((d) => ({ ...d, [qid]: value }))}
                    onSubmit={submitQnA}
                    processing={streaming}
                  />
                ) : view === "epics" ? (
                  <EpicsStoriesView
                    epics={epics}
                    stories={sprint?.stories}
                    generating={inSprint && !epics && streaming}
                  />
                ) : (
                  <DesignDocView markdown={design} generating={inDesign && !design && streaming} />
                )}
              </div>
            </div>

            {error && (
              <p className="px-4 pt-2 text-[11.5px] text-[#f87171]">
                {error.includes("409") || error.toLowerCase().includes("busy")
                  ? "Winston is mid-turn — wait for it to finish, then send again."
                  : error}
              </p>
            )}

            {/* free-form directive (request changes / give direction) */}
            <div className="flex items-end gap-2 px-4 py-3">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={
                  cyclePhase === "design-review" || sprintPending
                    ? "Request changes or give input…"
                    : cyclePhase === "ready"
                      ? "Start the design…"
                      : "Message Winston…"
                }
                className="flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.06]"
              />
              {(cyclePhase === "design-review" || sprintPending) && (
                <button type="button" onClick={send} disabled={!composer.trim() || streaming}
                  title="Request changes"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40 cursor-pointer">
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={send} disabled={!composer.trim() || streaming}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white transition-all disabled:opacity-40 cursor-pointer"
                style={{ background: "#5227FF" }}>
                {streaming ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </GlassPanel>
        </div>

        {/* bottom drawer: Build / Run / Test logs */}
        {showLogs && (
          <GlassPanel className="h-64 shrink-0">
            <LogsPanel slug={slug} scripts={state?.scripts} onClose={() => setShowLogs(false)} />
          </GlassPanel>
        )}

        {showGit && <GitModal slug={slug} name={name} onClose={() => setShowGit(false)} />}
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

function Tab({
  active, onClick, icon, label,
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
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
        active ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
