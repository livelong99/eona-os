import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  FileX,
} from "lucide-react";
import {
  getArtifacts,
  artifactRawUrl,
  type ArtifactFile,
  type ToolStep,
} from "@/lib/labs/toolsClient";
import { matchesGlobs } from "@/components/labs/workbenchText";
import { ImproveApproveBar } from "@/components/labs/run/ImproveApproveBar";
import { RunTranscript } from "@/components/labs/run/RunTranscript";
import type { RunTurn } from "@/components/labs/run/useRunStages";

interface HtmlMockupStepProps {
  toolId: string;
  runId: string;
  step: ToolStep;
  turns: RunTurn[];
  streaming: boolean;
  isLast?: boolean;
  nextTitle?: string;
  onImprove: (text: string) => void;
  onLooksGood: () => void;
  /** Resolves an artifact relpath → raw URL. Defaults to the run-scoped URL;
   * project mode passes a project-scoped resolver so an existing brand renders
   * without a live run. */
  artifactSrc?: (relpath: string) => string;
  /** Lists the artifacts this step can choose from. Defaults to the run-scoped
   * listing; project mode passes the brand-folder listing. */
  listArtifacts?: (signal?: AbortSignal) => Promise<ArtifactFile[]>;
  /** Read-only project view: hide the chat + Improve/Approve bar (the mockup is
   * already finalized; "Continue from here" lives outside this component). */
  readOnly?: boolean;
}

// Picks the HTML artifact this step waits on: prefer the step's globs, else the
// first html-kind file.
function pickHtml(files: ArtifactFile[], step: ToolStep): ArtifactFile | null {
  // The iframe can only render an actual HTML document. The step's artifact globs
  // may also list a companion markdown (e.g. design-brief.md), so restrict to HTML
  // files FIRST, then prefer one matching the globs — otherwise an mtime-sorted
  // markdown could win and the iframe would show raw text instead of the mockup.
  const htmls = files.filter(
    (f) => f.kind === "html" || f.relpath.toLowerCase().endsWith(".html"),
  );
  if (htmls.length === 0) return null;
  const byGlob = htmls.find(
    (f) => matchesGlobs(f.relpath, step.artifacts) || matchesGlobs(f.name, step.artifacts),
  );
  return byGlob ?? htmls[0];
}

// HtmlMockupStep — a large sandboxed iframe preview of the generated HTML mockup
// with Refresh + Open-raw, beside a compact transcript and the Improve/Approve
// bar. "Improve" asks the agent to regenerate; the iframe auto-refreshes once a
// streaming turn settles.
export function HtmlMockupStep({
  toolId,
  runId,
  step,
  turns,
  streaming,
  isLast,
  nextTitle,
  onImprove,
  onLooksGood,
  artifactSrc,
  listArtifacts,
  readOnly,
}: HtmlMockupStepProps) {
  const [files, setFiles] = useState<ArtifactFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const list = listArtifacts ?? ((signal?: AbortSignal) => getArtifacts(toolId, runId, signal));
  const srcOf = artifactSrc ?? ((relpath: string) => artifactRawUrl(toolId, runId, relpath));

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const next = await list(signal);
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
    // `list` is derived from props each render; toolId/runId are the stable keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolId, runId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  // Re-list the mockup each time a turn settles (the agent likely regenerated).
  useEffect(() => {
    if (!streaming) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const html = files ? pickHtml(files, step) : null;
  const src = html ? srcOf(html.relpath) : null;

  return (
    <div className={readOnly ? "grid gap-5" : "grid gap-5 lg:grid-cols-[1fr_360px]"}>
      {/* Preview */}
      <div className="flex min-h-0 flex-col">
        <div className="mb-3 flex items-center gap-2">
          <span className="truncate text-[12.5px] text-white/55">
            {html ? html.name : "Mockup preview"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {src && (
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                title="Open the mockup full-page in a new browser tab"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#5227FF]/40 bg-[#5227FF]/[0.15] px-3 py-1.5 text-[12px] font-semibold text-[#c4b5fd] transition-colors hover:border-[#5227FF]/60 hover:bg-[#5227FF]/[0.22] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </a>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh mockup"
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

        <div className="relative h-[520px] overflow-hidden rounded-xl border border-white/[0.08] bg-white">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-black/40 px-6 text-center">
              <AlertTriangle className="h-6 w-6 text-[#f87171]" />
              <p className="text-[13px] text-[#f8a3a3]">{error}</p>
            </div>
          ) : src ? (
            <iframe
              key={`${src}#${nonce}`}
              src={src}
              title={html?.name ?? "Mockup preview"}
              sandbox="allow-same-origin"
              className="h-full w-full border-0 bg-white"
            />
          ) : streaming || loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-black/40 px-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#a78bfa]" />
              <p className="text-[13px] text-white/55">Forge is generating the mockup…</p>
              <p className="text-[12px] text-white/40">This can take a minute.</p>
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

        {/* Full-page fallback — a frame can be blocked by the browser, but a
            top-level navigation never is. */}
        {src && (
          <p className="mt-2 text-[11.5px] text-white/40">
            Preview not showing?{" "}
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#a78bfa] underline-offset-2 transition-colors hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
            >
              Open in a new tab
            </a>
            .
          </p>
        )}
      </div>

      {/* Compact chat + bar — hidden in read-only project mode. */}
      {!readOnly && (
        <div className="flex min-h-0 flex-col gap-4">
          <div className="max-h-[300px] overflow-y-auto">
            <RunTranscript
              turns={turns}
              emptyHint="Ask the agent to tweak the mockup, then refresh."
            />
          </div>
          <ImproveApproveBar
            streaming={streaming}
            isLast={isLast}
            nextTitle={nextTitle}
            placeholder="Tell the agent how to refine the mockup…"
            onImprove={onImprove}
            onLooksGood={onLooksGood}
          />
        </div>
      )}
    </div>
  );
}
