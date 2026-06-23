import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  getArtifacts,
  artifactRawUrl,
  type ArtifactFile,
} from "@/lib/labs/toolsClient";
import { formatBytes, renderInline } from "@/components/labs/workbenchText";

interface StageFileCardsProps {
  toolId: string;
  runId: string;
}

// StageFileCards — lists every file the run produced as a card: images preview as
// thumbnails, markdown/text expand inline with a copy button, all are downloadable.
export function StageFileCards({ toolId, runId }: StageFileCardsProps) {
  const [files, setFiles] = useState<ArtifactFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const next = await getArtifacts(toolId, runId, signal);
        if (signal?.aborted) return;
        setFiles(next);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="text-[12.5px] text-white/55">
          {files ? `${files.length} file${files.length === 1 ? "" : "s"}` : "Artifacts"}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-1">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {!error && files && files.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] py-12 text-center">
            <FileIcon className="h-6 w-6 text-white/30" />
            <p className="text-[13px] text-white/50">No files produced yet.</p>
            <p className="text-[12px] text-white/40">Refresh once the agent has written its outputs.</p>
          </div>
        )}

        {!error && !files && loading && (
          <div className="flex items-center gap-2 px-1 text-[13px] text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            Listing artifacts…
          </div>
        )}

        {files?.map((file) => (
          <FileCard key={file.relpath} toolId={toolId} runId={runId} file={file} />
        ))}
      </div>
    </div>
  );
}

function FileCard({
  toolId,
  runId,
  file,
}: {
  toolId: string;
  runId: string;
  file: ArtifactFile;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const rawUrl = artifactRawUrl(toolId, runId, file.relpath);
  const isText = file.kind === "markdown" || file.kind === "other";
  const Icon =
    file.kind === "image" ? ImageIcon : file.kind === "markdown" ? FileText : FileIcon;

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
      // Clipboard or fetch unavailable — silently no-op; the download link remains.
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
          <Icon className="h-4.5 w-4.5 text-white/55" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white/90">{file.name}</p>
          <p className="text-[11.5px] text-white/40">
            {file.kind} · {formatBytes(file.size)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isText && (
            <button
              type="button"
              onClick={() => void onCopy()}
              aria-label="Copy file contents"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:text-white/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#34d399]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <a
            href={rawUrl}
            download={file.name}
            aria-label="Download file"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:text-white/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      {file.kind === "image" && (
        <a href={rawUrl} target="_blank" rel="noreferrer" className="block cursor-pointer">
          <img
            src={rawUrl}
            alt={file.name}
            loading="lazy"
            className="max-h-72 w-full border-t border-white/[0.07] bg-black/30 object-contain"
          />
        </a>
      )}

      {isText && (
        <div className="border-t border-white/[0.07]">
          <button
            type="button"
            onClick={() => void onToggle()}
            className="flex w-full items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-white/55 transition-colors hover:text-white/80 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5227FF]/60"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
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
      )}
    </div>
  );
}
