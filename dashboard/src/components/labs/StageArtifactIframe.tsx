import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ExternalLink, AlertTriangle, FileX } from "lucide-react";
import {
  getArtifacts,
  artifactRawUrl,
  type ArtifactFile,
  type ToolStep,
} from "@/lib/labs/toolsClient";
import { matchesGlobs } from "@/components/labs/workbenchText";

interface StageArtifactIframeProps {
  toolId: string;
  runId: string;
  step: ToolStep;
}

// Picks the HTML artifact this step is waiting on: prefer a name matching the
// step's declared globs, else the first html-kind file.
function pickHtml(files: ArtifactFile[], step: ToolStep): ArtifactFile | null {
  const byGlob = files.find(
    (f) => matchesGlobs(f.relpath, step.artifacts) || matchesGlobs(f.name, step.artifacts),
  );
  if (byGlob) return byGlob;
  return files.find((f) => f.kind === "html") ?? null;
}

// StageArtifactIframe — lists the run's artifacts, finds the expected HTML
// mockup, and renders it in a sandboxed iframe with refresh + open-raw controls.
export function StageArtifactIframe({ toolId, runId, step }: StageArtifactIframeProps) {
  const [files, setFiles] = useState<ArtifactFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumps the iframe key to force a reload of the same src.
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const next = await getArtifacts(toolId, runId, signal);
        if (signal?.aborted) return;
        setFiles(next);
        setNonce((n) => n + 1);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Could not list artifacts.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [toolId, runId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const html = files ? pickHtml(files, step) : null;
  const src = html ? artifactRawUrl(toolId, runId, html.relpath) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="truncate text-[12.5px] text-white/55">
          {html ? html.name : "Mockup preview"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {src && (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:text-white/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open raw
            </a>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:text-white/90 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-white">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-black/40 px-6 text-center">
            <AlertTriangle className="h-6 w-6 text-[#f87171]" />
            <p className="text-[13px] text-[#f8a3a3]">{error}</p>
          </div>
        ) : src ? (
          <iframe
            key={`${src}#${nonce}`}
            src={src}
            title={html?.name ?? "Artifact preview"}
            sandbox="allow-same-origin"
            className="h-full w-full border-0 bg-white"
          />
        ) : loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            <p className="text-[13px] text-white/45">Looking for the mockup…</p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-black/40 px-6 text-center">
            <FileX className="h-6 w-6 text-white/35" />
            <p className="text-[13px] text-white/55">Waiting for the mockup…</p>
            <p className="text-[12px] text-white/40">
              The agent hasn't produced an HTML artifact yet. Refresh once it has.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
