// SwarmToolRun — the GENERIC glass-box run screen for any swarm tool. Lane
// sidebar + ExecutionConsole + a right panel with a Q&A tab (universal
// clarification channel) and an Output tab (the run's artifacts, rendered by
// kind), plus a directive composer. Driven by the tool manifest; no per-tool code.

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft, Send, Loader, FileText, MessageCircleQuestion, Files, Layers,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Markdown } from "@/components/ui/markdown";
import { ExecutionConsole, ALL_AGENTS } from "@/components/toolkit/ExecutionConsole";
import { QnAView } from "@/components/toolkit/QnAView";
import { useAgentRun } from "@/components/toolkit/useAgentRun";
import { DEFAULT_ROLES } from "@/components/toolkit/agentRun";
import {
  getTool, getLatestRun, getRunStatus, getProjectArtifacts, projectArtifactRawUrl,
  type ToolManifest, type ArtifactFile,
} from "@/lib/labs/toolsClient";

interface NavState { name?: string; runId?: string; manifest?: ToolManifest }

const HIDDEN_ARTIFACTS = new Set(["qna.json", "workspace.json", ".swarm-provisioned"]);

export function SwarmToolRun() {
  const { toolId = "", projectId = "" } = useParams();
  const navigate = useNavigate();
  const navState = (useLocation().state as NavState | null) ?? null;

  const [manifest, setManifest] = useState<ToolManifest | null>(navState?.manifest ?? null);
  const [runId, setRunId] = useState<string | null>(navState?.runId ?? null);
  const [live, setLive] = useState<boolean>(Boolean(navState?.runId));
  const [resolving, setResolving] = useState(!navState?.runId);

  // Load the manifest if we arrived without it.
  useEffect(() => {
    if (manifest || !toolId) return;
    getTool(toolId).then(setManifest).catch(() => {});
  }, [toolId, manifest]);

  // Resolve the run (deep-link / reload): latest run for this project.
  useEffect(() => {
    if (navState?.runId || !toolId) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await getLatestRun(toolId, projectId);
        if (cancelled) return;
        if (!latest) { setResolving(false); return; }
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

  const mainLane = useMemo(
    () => ({ id: "main", label: manifest?.title || "Orchestrator", role: "Orchestrator" }),
    [manifest?.title],
  );

  const { lanes, qna, artifacts, streaming, error, submitAnswers, directive, rawUrl, fetchText } =
    useAgentRun(toolId, runId, { roles: DEFAULT_ROLES, mainLane, streamLive: live });

  // Fallback for reviewing a saved project when no run is live (the run registry
  // is ephemeral): read artifacts straight from the project folder on disk.
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
  const outRawUrl = reviewOnly ? (rel: string) => projectArtifactRawUrl(toolId, projectId, rel) : rawUrl;
  const outFetchText = reviewOnly ? projFetchText : fetchText;

  const name = manifest?.title || navState?.name || projectId;
  const [selectedAgent, setSelectedAgent] = useState<string>(ALL_AGENTS);
  const [composer, setComposer] = useState("");
  const [view, setView] = useState<"output" | "qna">("output");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const openQuestions = (qna?.questions ?? []).filter((q) => !q.answered);
  const hasQna = openQuestions.length > 0;
  useEffect(() => { if (hasQna) setView("qna"); }, [hasQna]);

  const send = async () => {
    const text = composer.trim();
    if (!text || streaming) return;
    setComposer("");
    await directive(text);
  };
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
        <div className="flex items-center gap-3 px-1">
          <button type="button" onClick={() => navigate(`/labs/${toolId}`)} aria-label="Back"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Layers className="h-4 w-4 text-[#a78bfa]" />
          <h1 className="text-sm font-semibold tracking-tight text-white">{name}</h1>
          <span className="text-[11px] text-white/35">{projectId}</span>
          {streaming && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-white/45">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#34d399]" /> live
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* left: agent lanes */}
          <GlassPanel className="w-[260px] shrink-0">
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

          {/* right: Q&A + Output + composer */}
          <GlassPanel className="w-[460px] shrink-0">
            <header className="flex items-center gap-2 px-4 py-3">
              <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                <Tab active={view === "output"} onClick={() => setView("output")} icon={<Files className="h-4 w-4" />} label="Output" />
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
                ) : (
                  <OutputView artifacts={outFiles} rawUrl={outRawUrl} fetchText={outFetchText} />
                )}
              </div>
            </div>

            {error && (
              <p className="px-4 pt-2 text-[11.5px] text-[#f87171]">
                {error.includes("409") || error.toLowerCase().includes("busy")
                  ? "The orchestrator is mid-turn — wait for it to finish, then send again."
                  : error}
              </p>
            )}

            <div className="flex items-end gap-2 px-4 py-3">
              <textarea value={composer} onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={1} placeholder="Message the orchestrator…"
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

// ── Output view: a file list + a viewer rendering by artifact kind ───────────
function OutputView({
  artifacts, rawUrl, fetchText,
}: {
  artifacts: ArtifactFile[];
  rawUrl: (relpath: string) => string;
  fetchText: (relpath: string) => Promise<string | null>;
}) {
  const files = artifacts.filter((f) => !HIDDEN_ARTIFACTS.has(f.relpath) && !HIDDEN_ARTIFACTS.has(f.name));
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  // Default-select the most recent file.
  useEffect(() => {
    if (selected || files.length === 0) return;
    const newest = [...files].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))[0];
    setSelected(newest.relpath);
  }, [files, selected]);

  const sel = files.find((f) => f.relpath === selected) ?? null;
  const ext = (sel?.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  const isMd = ext === "md" || ext === "markdown";
  const isHtml = ext === "html" || ext === "htm";
  const isImg = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);

  useEffect(() => {
    if (!sel || !isMd) { setText(null); return; }
    let live = true;
    fetchText(sel.relpath).then((t) => live && setText(t));
    return () => { live = false; };
    // sel.mtime so a live in-place rewrite (same path) re-fetches the content.
  }, [sel?.relpath, sel?.mtime, isMd, fetchText]);

  if (files.length === 0) {
    return <p className="py-10 text-center text-[12.5px] text-white/40">Artifacts appear here as the swarm produces them.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-white/[0.07] p-2.5">
        {files.map((f) => (
          <button key={f.relpath} type="button" onClick={() => setSelected(f.relpath)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer ${
              f.relpath === selected ? "bg-white/12 text-white" : "text-white/55 hover:bg-white/[0.06]"
            }`}>
            <FileText className="h-3 w-3" /> {f.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!sel ? null
          : isHtml ? <iframe title={sel.name} src={rawUrl(sel.relpath)} className="h-full w-full bg-white" sandbox="allow-scripts allow-same-origin" />
          : isImg ? <div className="p-4"><img src={rawUrl(sel.relpath)} alt={sel.name} className="mx-auto max-w-full rounded-lg" /></div>
          : isMd ? <div className="px-5 py-4">{text ? <Markdown>{text}</Markdown> : <p className="text-[12px] text-white/40">Loading…</p>}</div>
          : <div className="p-4"><a href={rawUrl(sel.relpath)} target="_blank" rel="noreferrer" className="text-[12.5px] text-[#7c9cff] underline">Open {sel.name}</a></div>}
      </div>
    </div>
  );
}

function LaneButton({ label, role, live, active, onClick }: { label: string; role?: string; live?: boolean; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
        active ? "border-white/30 bg-white/[0.06]" : "border-white/[0.06] hover:bg-white/[0.04]"
      }`}>
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
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
        active ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80"
      }`}>
      {icon}{label}
    </button>
  );
}
