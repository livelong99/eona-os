import { useCallback, useEffect, useState } from "react";
import { GitBranch, ArrowUp, ArrowDown, FileDiff, Loader, UploadCloud, RefreshCw, Check, X } from "lucide-react";
import { fetchGitStatus, pushWorkspace, type GitStatus } from "@/lib/workspace/workspaceClient";

interface Props {
  slug: string;
  name: string;
  onClose: () => void;
}

// GitModal — read-only branch + recent commits + ahead/behind/dirty, with a
// user-initiated Push. The orchestrator never auto-pushes; this is a manual,
// explicit action by the user.
export function GitModal({ slug, name, onClose }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; output: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchGitStatus(slug)
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load git status"))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const push = async () => {
    if (pushing) return;
    setPushing(true);
    setPushResult(null);
    try {
      const r = await pushWorkspace(slug);
      setPushResult(r);
      if (r.ok) load();
    } finally {
      setPushing(false);
    }
  };

  const ahead = status?.ahead ?? 0;
  const canPush = Boolean(status?.is_repo && status?.has_upstream && (ahead ?? 0) > 0);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden rounded-[28px] p-4"
      style={{ background: "rgba(2,3,8,0.55)" }} onClick={onClose}>
      <div className="flex max-h-full w-[min(640px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/12"
        style={{ background: "rgba(16,17,26,0.94)", backdropFilter: "blur(24px)", boxShadow: "0 30px 120px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <GitBranch className="h-4 w-4 text-[#a78bfa]" />
          <span className="text-[14px] font-semibold text-white">{name}</span>
          {status?.is_repo && status.branch && (
            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[11.5px] text-white/70">{status.branch}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={load} title="Refresh"
              className="grid h-7 w-7 place-items-center rounded-lg text-white/45 transition-colors hover:bg-white/10 cursor-pointer">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onClose} title="Close"
              className="grid h-7 w-7 place-items-center rounded-lg text-white/45 transition-colors hover:bg-white/10 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* status row */}
        {status?.is_repo && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-[11.5px]">
            {status.remote ? (
              <span className="max-w-[260px] truncate font-mono text-white/45" title={status.remote}>{status.remote}</span>
            ) : (
              <span className="text-[#f4c14d]">no remote</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <Badge icon={<ArrowUp className="h-3 w-3" />} value={status.ahead} label="ahead" color="#34d399" />
              <Badge icon={<ArrowDown className="h-3 w-3" />} value={status.behind} label="behind" color="#7c9cff" />
              <Badge icon={<FileDiff className="h-3 w-3" />} value={status.dirty} label="uncommitted" color="#f4c14d" />
            </span>
          </div>
        )}

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-white/45">
              <Loader className="h-4 w-4 animate-spin" /> Reading git…
            </p>
          ) : error ? (
            <p className="py-8 text-center text-[12.5px] text-[#f87171]">{error}</p>
          ) : !status?.is_repo ? (
            <p className="py-8 text-center text-[12.5px] text-white/45">This workspace isn't a git repository.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-white/30">Recent commits</p>
              {(status.commits ?? []).length === 0 ? (
                <p className="text-[12px] text-white/40">No commits yet.</p>
              ) : (
                status.commits!.map((c) => (
                  <div key={c.hash} className="flex items-baseline gap-2 rounded-md px-1 py-1 hover:bg-white/[0.03]">
                    <span className="shrink-0 font-mono text-[11px] text-[#a78bfa]">{c.hash}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/80" title={c.subject}>{c.subject}</span>
                    <span className="shrink-0 text-[10.5px] text-white/35">{c.author} · {c.date}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* push footer */}
        {status?.is_repo && (
          <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-4 py-3">
            {pushResult && (
              <span className={`flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px] ${pushResult.ok ? "text-[#34d399]" : "text-[#f87171]"}`}>
                {pushResult.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate" title={pushResult.output}>{pushResult.output}</span>
              </span>
            )}
            <button type="button" onClick={push} disabled={pushing || !canPush}
              title={!status.has_upstream ? "No upstream branch to push to" : ahead === 0 ? "Nothing to push" : "Push the current branch"}
              className="ml-auto flex shrink-0 items-center gap-2 rounded-lg bg-[#5227FF] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#6438ff] disabled:opacity-40 cursor-pointer">
              {pushing ? <Loader className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {pushing ? "Pushing…" : `Push${ahead ? ` (${ahead})` : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ icon, value, label, color }: { icon: React.ReactNode; value?: number | null; label: string; color: string }) {
  if (value == null || value === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium" style={{ background: `${color}1f`, color }}>
      {icon} {value} <span className="text-white/40">{label}</span>
    </span>
  );
}
