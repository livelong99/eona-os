import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  FileText,
  Copy,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Upload as UploadIcon,
} from "lucide-react";
import {
  getArtifacts,
  artifactRawUrl,
  type ArtifactFile,
} from "@/lib/labs/toolsClient";
import { formatBytes, renderInline } from "@/components/labs/workbenchText";
import { ImproveApproveBar } from "@/components/labs/run/ImproveApproveBar";
import { RunTranscript } from "@/components/labs/run/RunTranscript";
import { AssetUploadZone } from "@/components/labs/run/AssetUploadZone";
import type { RunTurn } from "@/components/labs/run/useRunStages";

interface PromptsStepProps {
  toolId: string;
  runId: string;
  turns: RunTurn[];
  streaming: boolean;
  isLast?: boolean;
  nextTitle?: string;
  onImprove: (text: string) => void;
  onLooksGood: () => void;
  /** Resolves an artifact relpath → raw URL. Defaults to the run-scoped URL;
   * project mode passes a project-scoped resolver. */
  artifactSrc?: (relpath: string) => string;
  /** Lists the artifacts. Defaults to the run-scoped listing; project mode
   * passes the brand-folder listing. */
  listArtifacts?: (signal?: AbortSignal) => Promise<ArtifactFile[]>;
  /** Hide the asset upload zone (project mode has no live run to upload into). */
  readOnly?: boolean;
}

// Generated prompt files are the markdown/text artifacts that are NOT in the
// uploaded "assets/" tree.
function isPromptFile(f: ArtifactFile): boolean {
  if (f.relpath.startsWith("assets/")) return false;
  return f.kind === "markdown" || f.kind === "other";
}

// PromptsStep (Image Prompts, Marketing Video) — renders each generated prompt
// file as a copyable, expandable card, plus an asset upload zone for the user's
// generated images/videos, plus the Improve/Approve bar.
export function PromptsStep({
  toolId,
  runId,
  turns,
  streaming,
  isLast,
  nextTitle,
  onImprove,
  onLooksGood,
  artifactSrc,
  listArtifacts,
  readOnly,
}: PromptsStepProps) {
  const [files, setFiles] = useState<ArtifactFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Re-list once a streaming turn settles (the agent likely wrote new prompts).
  useEffect(() => {
    if (!streaming) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const prompts = (files ?? []).filter(isPromptFile);
  const assets = (files ?? []).filter((f) => f.relpath.startsWith("assets/"));

  return (
    <div className={readOnly ? "grid gap-5" : "grid gap-5 lg:grid-cols-[1fr_360px]"}>
      {/* Prompt cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-white/55">
            {prompts.length} prompt{prompts.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh prompts"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:text-white/90 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {!error && prompts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] py-12 text-center">
            {streaming || loading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-white/35" />
                <p className="text-[13px] text-white/50">Generating prompts…</p>
              </>
            ) : (
              <>
                <FileText className="h-6 w-6 text-white/30" />
                <p className="text-[13px] text-white/50">No prompts produced yet.</p>
              </>
            )}
          </div>
        )}

        {prompts.map((file) => (
          <PromptCard key={file.relpath} rawUrl={srcOf(file.relpath)} file={file} />
        ))}

        {/* Asset upload — live-run mode only (project mode has no run to write to). */}
        {!readOnly && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-white/45">
              <UploadIcon className="h-4 w-4" />
              Your generated assets
            </div>
            <AssetUploadZone
              toolId={toolId}
              runId={runId}
              assets={assets}
              onUploaded={() => void refresh()}
            />
          </div>
        )}
      </div>

      {/* Compact chat + bar — hidden in read-only project mode. */}
      {!readOnly && (
        <div className="flex min-h-0 flex-col gap-4">
          <div className="max-h-[300px] overflow-y-auto">
            <RunTranscript
              turns={turns}
              emptyHint="Ask the agent to refine the prompts, then refresh."
            />
          </div>
          <ImproveApproveBar
            streaming={streaming}
            isLast={isLast}
            nextTitle={nextTitle}
            placeholder="Tell the agent how to refine the prompts…"
            onImprove={onImprove}
            onLooksGood={onLooksGood}
          />
        </div>
      )}
    </div>
  );
}

// One generated prompt file: a card with a Copy button (fetches raw text →
// clipboard) and an expandable preview. `rawUrl` is resolved by the parent so
// the same card serves both run-scoped and project-scoped artifacts.
function PromptCard({
  rawUrl,
  file,
}: {
  rawUrl: string;
  file: ArtifactFile;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadText = useCallback(async (): Promise<string> => {
    if (text !== null) return text;
    setTextLoading(true);
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const body = await res.text();
      setText(body);
      return body;
    } finally {
      setTextLoading(false);
    }
  }, [rawUrl, text]);

  const onToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && text === null) {
      try {
        await loadText();
      } catch {
        setText("(could not load preview)");
      }
    }
  };

  const onCopy = async () => {
    try {
      const body = await loadText();
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard or fetch unavailable — silently no-op.
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
          <FileText className="h-4 w-4 text-white/55" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white/90">{file.name}</p>
          <p className="text-[11.5px] text-white/40">
            {file.kind} · {formatBytes(file.size)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label={`Copy ${file.name}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:text-white/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
        >
          {copied ? (
            <CheckCheck className="h-3.5 w-3.5 text-[#34d399]" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="border-t border-white/[0.07]">
        <button
          type="button"
          onClick={() => void onToggle()}
          className="flex w-full items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-white/55 transition-colors hover:text-white/80 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5227FF]/60"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {open ? "Hide preview" : "Preview"}
        </button>
        {open && (
          <div className="max-h-72 overflow-y-auto border-t border-white/[0.07] px-3.5 py-3">
            {textLoading && text === null ? (
              <div className="flex items-center gap-2 text-[12px] text-white/40">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-white/70">
                {renderInline(text ?? "")}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
