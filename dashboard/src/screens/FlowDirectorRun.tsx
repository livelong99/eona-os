// FlowDirectorRun — the dedicated run screen for the Flow Cinematography Director.
// Glass-box agent lanes + a 7-stage progress rail + a tabbed right panel: Docs
// (knowledge base / research / look bible / shot list), Prompts (per-shot copy
// cards), Review (upload renders → vision critic verdicts), and Q&A. Built on the
// shared useAgentRun hook (lanes, qna, artifacts, directive, /message).

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft, Send, Loader, FileText, MessageCircleQuestion, Clapperboard, Film, Check, Zap,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Markdown } from "@/components/ui/markdown";
import { ExecutionConsole, ALL_AGENTS } from "@/components/toolkit/ExecutionConsole";
import { QnAView } from "@/components/toolkit/QnAView";
import { useAgentRun } from "@/components/toolkit/useAgentRun";
import type { LaneRole } from "@/components/toolkit/agentRun";
import { FlowPromptsView } from "@/components/labs/FlowPrompts";
import { ReviewPanel } from "@/components/labs/run/ReviewPanel";
import {
  getTool, getLatestRun, getRunStatus, getProjectArtifacts, projectArtifactRawUrl,
  type ToolManifest, type ArtifactFile,
} from "@/lib/labs/toolsClient";

interface NavState { name?: string; runId?: string; manifest?: ToolManifest }

const FLOW_ROLES: LaneRole[] = [
  { key: "research", label: "Researcher", match: /research|reference/i },
  { key: "art", label: "Art Director", match: /art.?direct|look|palette|grade/i },
  { key: "dp", label: "DP", match: /\bdp\b|director of photography|shot|camera/i },
  { key: "prompt", label: "Prompt Writer", match: /prompt|writer/i },
  { key: "review", label: "Vision Critic", match: /critic|review|vision/i },
];

const STAGES = [
  { id: "stage0", title: "Knowledge", artifact: "knowledge-base.md" },
  { id: "stage1", title: "Reference", artifact: "reference-brief.md" },
  { id: "stage2", title: "Research", artifact: "research.md" },
  { id: "stage3", title: "Direction", artifact: "direction.md" },
  { id: "stage4", title: "Structure", artifact: "structure.md" },
  { id: "stage5", title: "Prompts", artifact: "flow-prompts.md" },
  { id: "stage6", title: "Review", artifact: "review.json" },
];

const DOC_FILES = ["knowledge-base.md", "reference-brief.md", "intake.md", "research.md", "direction.md", "structure.md"];

export function FlowDirectorRun() {
  const { toolId = "flow-director", projectId = "" } = useParams();
  const navigate = useNavigate();
  const navState = (useLocation().state as NavState | null) ?? null;

  const [manifest, setManifest] = useState<ToolManifest | null>(navState?.manifest ?? null);
  const [runId, setRunId] = useState<string | null>(navState?.runId ?? null);
  const [live, setLive] = useState<boolean>(Boolean(navState?.runId));
  const [resolving, setResolving] = useState(!navState?.runId);

  useEffect(() => {
    if (manifest || !toolId) return;
    getTool(toolId).then(setManifest).catch(() => {});
  }, [toolId, manifest]);

  useEffect(() => {
    if (navState?.runId || !toolId) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await getLatestRun(toolId, projectId);
        if (cancelled || !latest) { if (!cancelled) setResolving(false); return; }
        const status = await getRunStatus(latest.run_id);
        if (cancelled) return;
        setRunId(latest.run_id);
        setLive(Boolean(status?.live));
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toolId, projectId, navState?.runId]);

  const mainLane = useMemo(() => ({ id: "main", label: "Lumière", role: "Director" }), []);
  const { lanes, qna, artifacts, streaming, error, submitAnswers, directive, rawUrl, fetchText } =
    useAgentRun(toolId, runId, { roles: FLOW_ROLES, mainLane, streamLive: live });

  // Review-only fallback (no live run): read artifacts off disk.
  const [projectFiles, setProjectFiles] = useState<ArtifactFile[]>([]);
  const reviewOnly = !resolving && !runId;
  useEffect(() => {
    if (!reviewOnly || !toolId || !projectId) return;
    getProjectArtifacts(toolId, projectId).then(setProjectFiles).catch(() => {});
  }, [reviewOnly, toolId, projectId]);
  const projFetchText = useMemo(
    () => async (rel: string): Promise<string | null> => {
      const res = await fetch(`${projectArtifactRawUrl(toolId, projectId, rel)}&_t=${Date.now()}`, { cache: "no-store" });
      return res.ok ? res.text() : null;
    },
    [toolId, projectId],
  );
  const outFiles = reviewOnly ? projectFiles : artifacts;
  const outFetchText = reviewOnly ? projFetchText : fetchText;
  const outRawUrl = reviewOnly ? (rel: string) => projectArtifactRawUrl(toolId, projectId, rel) : rawUrl;

  const name = manifest?.title || navState?.name || projectId;
  const [selectedAgent, setSelectedAgent] = useState<string>(ALL_AGENTS);
  const [composer, setComposer] = useState("");
  const [view, setView] = useState<"docs" | "prompts" | "review" | "qna">("docs");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const have = useMemo(() => new Set(outFiles.map((f) => f.relpath)), [outFiles]);
  const mtimeOf = (rel: string) => outFiles.find((f) => f.relpath === rel)?.mtime;
  const completedStages = STAGES.filter((s) => have.has(s.artifact)).length;
  const activeStage = Math.min(completedStages, STAGES.length - 1);

  const openQuestions = (qna?.questions ?? []).filter((q) => !q.answered);
  const hasQna = openQuestions.length > 0;
  useEffect(() => { if (hasQna) setView("qna"); }, [hasQna]);

  // Auto mode: progress stages 0→5 without manual approval, pausing only for QnA
  // gates and stopping once prompts are generated (the review step needs the
  // user's Flow renders). The step-gate stays intact — we just auto-send Continue.
  const [auto, setAuto] = useState(false);
  const autoRef = useRef<number>(-1);
  useEffect(() => {
    if (!auto || streaming || hasQna || reviewOnly || !runId) return;
    // Knowledge base done (>=1), not yet past prompts (<=5). Advance once per stage.
    if (completedStages < 1 || completedStages > 5) return;
    if (autoRef.current === completedStages) return;
    autoRef.current = completedStages;
    void directive("Approved. Continue to the next stage.");
  }, [auto, streaming, hasQna, reviewOnly, runId, completedStages, directive]);
  // Surface prompts/review tabs as the run reaches them.
  useEffect(() => {
    if (have.has("review.json")) setView((v) => (v === "docs" ? "review" : v));
    else if (have.has("flow-prompts.md")) setView((v) => (v === "docs" ? "prompts" : v));
  }, [have]);

  const send = async () => {
    const text = composer.trim();
    if (!text || streaming) return;
    setComposer("");
    await directive(text);
  };
  const approve = async () => {
    if (streaming) return;
    await directive("Approved. Continue to the next stage.");
  };
  const runReview = async () =>
    directive("Run the vision review: read the uploaded renders in assets/shot-*.* against the Look Bible and flow-prompts.md, write review.json with a pass/fail verdict + notes per shot, and rewrite any failing shot's prompts in place.");
  const submitQnA = async () => {
    const answers: Record<string, string> = {};
    for (const q of openQuestions) {
      const v = (drafts[q.id] ?? "").trim();
      if (v) answers[q.id] = v;
    }
    if (!Object.keys(answers).length) return;
    setDrafts({});
    await submitAnswers(answers);
  };

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="flex w-full max-w-[1600px] flex-col gap-3">
        {/* top bar + stage rail */}
        <div className="flex flex-wrap items-center gap-3 px-1">
          <button type="button" onClick={() => navigate(`/labs/${toolId}`)} aria-label="Back"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Clapperboard className="h-4 w-4 shrink-0 text-[#a78bfa]" />
          <h1 className="truncate text-sm font-semibold tracking-tight text-white">{name}</h1>
          <div className="ml-auto hidden items-center gap-1 lg:flex">
            {STAGES.map((s, i) => {
              const done = have.has(s.artifact);
              const active = i === activeStage && !done;
              return (
                <span key={s.id} className="flex items-center gap-1">
                  <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${
                    done ? "text-[#34d399]" : active ? "bg-white/10 text-white" : "text-white/35"}`}>
                    {done && <Check className="h-3 w-3" />}{s.title}
                  </span>
                  {i < STAGES.length - 1 && <span className="text-white/15">·</span>}
                </span>
              );
            })}
          </div>
          {/* Auto mode toggle — auto-advances stages 0→5, pausing on QnA + stopping at prompts. */}
          <button type="button" onClick={() => { autoRef.current = -1; setAuto((v) => !v); }}
            title={auto ? "Auto mode on — advancing stages automatically (pauses for Q&A, stops at prompts)" : "Auto mode off — approve each stage"}
            className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer lg:ml-0 ${
              auto ? "border-[#5227FF]/50 bg-[#5227FF]/15 text-white" : "border-white/10 text-white/55 hover:bg-white/[0.06]"}`}>
            <Zap className={`h-3.5 w-3.5 ${auto ? "text-[#a78bfa]" : ""}`} /> Auto
          </button>
          {streaming && <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-white/45"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#34d399]" /> live</span>}
        </div>

        <div className="flex min-h-0 flex-1 gap-3 xl:gap-4">
          {/* left: agent lanes */}
          <GlassPanel className="hidden w-[240px] shrink-0 lg:block 2xl:w-[260px]">
            <div className="flex h-full flex-col gap-2 p-3">
              <p className="px-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">Agents</p>
              <LaneButton label="All agents" active={selectedAgent === ALL_AGENTS} onClick={() => setSelectedAgent(ALL_AGENTS)} />
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {lanes.map((l) => (
                  <LaneButton key={l.id} label={l.label} role={l.role} live={l.active}
                    active={selectedAgent === l.id} onClick={() => setSelectedAgent(l.id)} />
                ))}
              </div>
            </div>
          </GlassPanel>

          {/* center: glass-box */}
          <GlassPanel className="min-w-0 flex-1">
            <div className="m-3 h-[calc(100%-1.5rem)] overflow-hidden rounded-xl border border-white/[0.08]" style={{ background: "rgba(0,0,0,0.22)" }}>
              {resolving ? (
                <Centered><Loader className="h-4 w-4 animate-spin text-white/50" /> Resolving run…</Centered>
              ) : reviewOnly ? (
                <Centered>Reviewing saved artifacts — no live run. Relaunch the tool to continue.</Centered>
              ) : (
                <ExecutionConsole lanes={lanes} streaming={streaming} selectedId={selectedAgent} />
              )}
            </div>
          </GlassPanel>

          {/* right: tabbed panel + composer */}
          <GlassPanel className="w-[400px] shrink-0 2xl:w-[460px]">
            <header className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                <Tab active={view === "docs"} onClick={() => setView("docs")} icon={<FileText className="h-4 w-4" />} label="Docs" />
                <Tab active={view === "prompts"} onClick={() => setView("prompts")} icon={<Clapperboard className="h-4 w-4" />} label="Prompts" />
                <Tab active={view === "review"} onClick={() => setView("review")} icon={<Film className="h-4 w-4" />} label="Review" />
                <Tab active={view === "qna"} onClick={() => setView("qna")} icon={<MessageCircleQuestion className="h-4 w-4" />}
                  label={`Q&A${hasQna ? ` · ${openQuestions.length}` : ""}`} />
              </div>
            </header>

            <div className="min-h-0 flex-1 px-4">
              <div className="h-full min-h-0 overflow-hidden rounded-xl border border-white/[0.08]" style={{ background: "rgba(0,0,0,0.22)" }}>
                {view === "qna" ? (
                  <QnAView questions={qna?.questions ?? []} drafts={drafts}
                    onDraftChange={(qid, v) => setDrafts((d) => ({ ...d, [qid]: v }))}
                    onSubmit={submitQnA} processing={streaming} />
                ) : view === "prompts" ? (
                  <FlowPromptsView fetchText={outFetchText} mtime={mtimeOf("flow-prompts.md")} projectName={name} />
                ) : view === "review" ? (
                  <ReviewPanel toolId={toolId} runId={runId} streaming={streaming} fetchText={outFetchText}
                    promptsMtime={mtimeOf("flow-prompts.md")} reviewMtime={mtimeOf("review.json")} onReview={runReview} />
                ) : (
                  <DocsView files={outFiles} fetchText={outFetchText} rawUrl={outRawUrl} />
                )}
              </div>
            </div>

            {error && (
              <p className="px-4 pt-2 text-[11.5px] text-[#f87171]">
                {error.includes("409") || error.toLowerCase().includes("busy")
                  ? "Lumière is mid-turn — wait for it to finish, then send again."
                  : error}
              </p>
            )}

            <div className="flex items-end gap-2 px-4 py-3">
              {!auto && !reviewOnly && !hasQna && view !== "review" && (
                <button type="button" onClick={approve} disabled={streaming} title="Approve this stage and continue"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-[12px] font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40 cursor-pointer">
                  <Check className="h-3.5 w-3.5" /> Continue
                </button>
              )}
              <textarea value={composer} onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={1} placeholder="Direct Lumière — request a change…"
                className="flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.06]" />
              <button type="button" onClick={send} disabled={!composer.trim() || streaming}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white transition-all disabled:opacity-40 cursor-pointer" style={{ background: "#5227FF" }}>
                {streaming ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </GlassPanel>
        </div>
      </div>
    </section>
  );
}

// ── Docs view: the stage markdown artifacts (KB / research / look bible / shots) ──
function DocsView({
  files, fetchText, rawUrl,
}: {
  files: ArtifactFile[];
  fetchText: (rel: string) => Promise<string | null>;
  rawUrl: (rel: string) => string;
}) {
  // Only the tool's own stage docs — never the swarm scaffolding or the prompts/
  // review artifacts (those have their own tabs).
  const docs = files.filter((f) => DOC_FILES.includes(f.relpath));
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (selected || docs.length === 0) return;
    // Prefer the most advanced doc available.
    const order = [...DOC_FILES].reverse();
    const pick = order.find((d) => docs.some((f) => f.relpath === d)) ?? docs[0].relpath;
    setSelected(pick);
  }, [docs, selected]);

  const sel = docs.find((f) => f.relpath === selected) ?? null;
  const isHtml = (sel?.name ?? "").endsWith(".html");
  useEffect(() => {
    if (!sel || isHtml) { setText(null); return; }
    let live = true;
    fetchText(sel.relpath).then((t) => live && setText(t));
    return () => { live = false; };
  }, [sel?.relpath, sel?.mtime, isHtml, fetchText]);

  if (docs.length === 0) {
    return <p className="py-10 text-center text-[12px] text-white/40">Stage documents appear here as Lumière produces them.</p>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex max-h-24 shrink-0 flex-wrap gap-1.5 overflow-y-auto border-b border-white/[0.07] p-2.5">
        {docs.map((f) => (
          <button key={f.relpath} type="button" onClick={() => setSelected(f.relpath)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer ${
              f.relpath === selected ? "bg-white/12 text-white" : "text-white/55 hover:bg-white/[0.06]"}`}>
            <FileText className="h-3 w-3" /> {f.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!sel ? null
          : isHtml ? <iframe title={sel.name} src={rawUrl(sel.relpath)} className="h-full w-full bg-white" sandbox="allow-scripts allow-same-origin" />
          : <div className="px-5 py-4">{text ? <Markdown>{text}</Markdown> : <p className="text-[12px] text-white/40">Loading…</p>}</div>}
      </div>
    </div>
  );
}

function LaneButton({ label, role, live, active, onClick }: { label: string; role?: string; live?: boolean; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
        active ? "border-white/30 bg-white/[0.06]" : "border-white/[0.06] hover:bg-white/[0.04]"}`}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-white/85">{label}</span>
        {role && <span className="block truncate text-[10.5px] text-white/40">{role}</span>}
      </span>
      {live && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#34d399]" />}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center gap-2 px-6 text-center text-[12.5px] text-white/45">{children}</div>;
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
        active ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80"}`}>
      {icon}{label}
    </button>
  );
}
