// ReviewPanel — stage 6 of the Flow Director. The user uploads their Flow-
// generated frames/clips per shot (saved to assets/shot-N.* via the brand-assets
// endpoint), triggers the vision critic, and sees per-shot pass/fail verdicts with
// the critic's notes + any rewritten prompts (from review.json).

import { useEffect, useRef, useState } from "react";
import { Upload, Loader, Check, X, Copy, Film, Eye } from "lucide-react";
import { uploadBrandAssets } from "@/lib/labs/toolsClient";
import { parsePrompts, type ParsedShot } from "@/components/labs/FlowPrompts";

interface ReviewShot {
  n: number;
  title?: string;
  verdict?: "pass" | "fail";
  notes?: string;
  rewritten_image_prompt?: string;
  rewritten_video_prompt?: string;
}

function CopyInline({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button type="button" title="Copy"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1500); } catch { /* */ } }}
      className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-0.5 text-[10px] font-medium text-white/60 transition-colors hover:bg-white/10 cursor-pointer">
      {done ? <Check className="h-3 w-3 text-[#34d399]" /> : <Copy className="h-3 w-3" />}{done ? "Copied" : "Copy"}
    </button>
  );
}

function UploadSlot({
  shot, uploaded, busy, onPick,
}: {
  shot: ParsedShot;
  uploaded?: string;
  busy?: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#5227FF]/20 text-[11px] font-bold text-[#a78bfa]">{shot.n}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-white/75">{shot.title || `Shot ${shot.n}`}</span>
      {uploaded && <span className="shrink-0 text-[10.5px] text-[#34d399]">✓ {uploaded}</span>}
      <input ref={ref} type="file" accept="image/*,video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="flex shrink-0 items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[10.5px] font-medium text-white/65 transition-colors hover:bg-white/10 disabled:opacity-50 cursor-pointer">
        {busy ? <Loader className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}{uploaded ? "Replace" : "Upload"}
      </button>
    </div>
  );
}

function VerdictCard({ shot }: { shot: ReviewShot }) {
  const pass = shot.verdict === "pass";
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: pass ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)", background: pass ? "rgba(52,211,153,0.05)" : "rgba(248,113,113,0.05)" }}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[0.06] text-[11px] font-bold text-white/70">{shot.n}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-white">{shot.title || `Shot ${shot.n}`}</span>
        <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${pass ? "bg-[#34d399]/15 text-[#34d399]" : "bg-[#f87171]/15 text-[#f87171]"}`}>
          {pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{pass ? "Pass" : "Fail"}
        </span>
      </div>
      {shot.notes && <p className="text-[11.5px] leading-relaxed text-white/65">{shot.notes}</p>}
      {!pass && (shot.rewritten_image_prompt || shot.rewritten_video_prompt) && (
        <div className="mt-2 space-y-2">
          {shot.rewritten_image_prompt && (
            <div>
              <div className="mb-1 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wide text-[#a78bfa]">Rewritten image</span><CopyInline text={shot.rewritten_image_prompt} /></div>
              <p className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-white/80">{shot.rewritten_image_prompt}</p>
            </div>
          )}
          {shot.rewritten_video_prompt && (
            <div>
              <div className="mb-1 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wide text-[#7c9cff]">Rewritten video</span><CopyInline text={shot.rewritten_video_prompt} /></div>
              <p className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-white/80">{shot.rewritten_video_prompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewPanel({
  toolId, runId, streaming, fetchText, promptsMtime, reviewMtime, onReview,
}: {
  toolId: string;
  runId: string | null;
  streaming: boolean;
  fetchText: (rel: string) => Promise<string | null>;
  promptsMtime?: number;
  reviewMtime?: number;
  onReview: () => Promise<void>;
}) {
  const [shots, setShots] = useState<ParsedShot[]>([]);
  const [uploaded, setUploaded] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [review, setReview] = useState<ReviewShot[] | null>(null);

  useEffect(() => {
    let live = true;
    fetchText("flow-prompts.md").then((t) => { if (live && t) setShots(parsePrompts(t).shots); });
    return () => { live = false; };
  }, [fetchText, promptsMtime]);

  useEffect(() => {
    let live = true;
    fetchText("review.json").then((t) => {
      if (!live || !t) return;
      try {
        const doc = JSON.parse(t) as { shots?: ReviewShot[] };
        if (Array.isArray(doc.shots)) setReview(doc.shots);
      } catch { /* not ready */ }
    });
    return () => { live = false; };
  }, [fetchText, reviewMtime]);

  const pick = async (shot: ParsedShot, file: File) => {
    if (!runId) return;
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const named = new File([file], `shot-${shot.n}.${ext}`, { type: file.type });
    setUploading((u) => ({ ...u, [shot.n]: true }));
    try {
      await uploadBrandAssets(toolId, runId, [named]);
      setUploaded((u) => ({ ...u, [shot.n]: named.name }));
    } catch { /* surfaced by the run error */ }
    finally { setUploading((u) => ({ ...u, [shot.n]: false })); }
  };

  const anyUploaded = Object.keys(uploaded).length > 0;

  if (shots.length === 0) {
    return <p className="py-10 text-center text-[12px] text-white/40">Generate prompts (stage 5) first, then upload your Flow renders here to review.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <Film className="h-3.5 w-3.5 text-[#a78bfa]" />
        <span className="text-[12px] font-medium text-white/70">Upload your Flow renders per shot</span>
        <button type="button" onClick={() => void onReview()} disabled={streaming || !anyUploaded}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#5227FF] px-3 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#6438ff] disabled:opacity-40 cursor-pointer">
          {streaming ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Run review
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {shots.map((s) => (
          <UploadSlot key={s.n} shot={s} uploaded={uploaded[s.n]} busy={uploading[s.n]} onPick={(f) => void pick(s, f)} />
        ))}
        {review && review.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/30">Critic verdicts</p>
            {review.map((r) => <VerdictCard key={r.n} shot={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
