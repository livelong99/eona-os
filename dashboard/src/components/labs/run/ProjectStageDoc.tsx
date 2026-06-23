import { useEffect, useState } from "react";
import { Loader2, FileText, AlertTriangle, FileX } from "lucide-react";
import { renderMarkdown } from "@/components/labs/workbenchText";

interface ProjectStageDocProps {
  /** Display name of the produced file (for the header). */
  fileName?: string;
  /** Resolved raw URL of the produced .md artifact, or null when none exists. */
  src: string | null;
}

// ProjectStageDoc — a read-only view of the markdown a chat stage produced, used
// in PROJECT mode where there's no live transcript to replay. Fetches the .md
// artifact's text and renders it; mirrors AgentResponseStep's "produced this"
// framing without the Improve/Approve bar.
export function ProjectStageDoc({ fileName, src }: ProjectStageDocProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(src));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(src, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        return res.text();
      })
      .then((body) => !controller.signal.aborted && setText(body))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load this stage.");
      })
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [src]);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-white/45">
        <FileText className="h-4 w-4 text-[#a78bfa]" />
        This stage produced
        {fileName && <span className="ml-1 text-white/55">· {fileName}</span>}
      </div>

      {loading ? (
        <div className="flex min-h-[44px] items-center gap-2 text-[13px] text-white/45">
          <Loader2 className="h-4 w-4 animate-spin text-[#a78bfa]" />
          Loading this stage…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/10 px-3 py-2 text-[12px] text-[#f8a3a3]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : src && text ? (
        <div className="space-y-0.5 text-[13.5px] leading-relaxed text-white/80">
          {renderMarkdown(text)}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[13px] text-white/45">
          <FileX className="h-4 w-4 text-white/35" />
          No document was saved for this stage.
        </div>
      )}
    </div>
  );
}
