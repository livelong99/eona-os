// FlowPrompts — parses the Flow Director's `flow-prompts.md` into per-shot blocks
// and renders copy-paste-ready cards (per-field copy + copy-all + .md/.txt
// download). The agent writes a fixed format (see references/5-prompts.md):
//   ## Look Bible … / ## Shot N — title with **Image prompt** / **Video prompt** /
//   **Settings** / **Negative** / **Consistency** fields, `---` between shots.

import { useEffect, useState } from "react";
import { Copy, Check, Download, Clapperboard } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

export interface ParsedShot {
  n: number;
  title: string;
  image: string;
  video: string;
  settings: string;
  negative: string;
  consistency: string;
  raw: string;
}
export interface ParsedPrompts {
  lookBible: string;
  shots: ParsedShot[];
}

const LABELS = ["Image prompt", "Video prompt", "Settings", "Negative", "Consistency"];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fieldOf(block: string, label: string): string {
  const start = block.search(new RegExp(`\\*\\*${escapeRe(label)}\\*\\*`, "i"));
  if (start < 0) return "";
  const after = block.slice(start).replace(new RegExp(`^\\*\\*${escapeRe(label)}\\*\\*\\s*`, "i"), "");
  let cut = after.length;
  for (const l of LABELS) {
    if (l === label) continue;
    const i = after.search(new RegExp(`\\*\\*${escapeRe(l)}\\*\\*`, "i"));
    if (i >= 0 && i < cut) cut = i;
  }
  return after.slice(0, cut).trim();
}

export function parsePrompts(md: string): ParsedPrompts {
  let lookBible = "";
  const lb = /##\s*Look Bible\s*\n([\s\S]*?)(?:\n---|\n##\s)/i.exec(md);
  if (lb) lookBible = lb[1].trim();

  const shots: ParsedShot[] = [];
  const parts = md.split(/\n##\s+Shot\s+/i).slice(1);
  for (const part of parts) {
    const headEnd = part.indexOf("\n");
    const head = (headEnd >= 0 ? part.slice(0, headEnd) : part).trim();
    const body = headEnd >= 0 ? part.slice(headEnd + 1) : "";
    const stop = body.search(/\n---/);
    const block = stop >= 0 ? body.slice(0, stop) : body;
    const nm = /^(\d+)/.exec(head);
    shots.push({
      n: nm ? parseInt(nm[1], 10) : shots.length + 1,
      title: head.replace(/^\d+\s*[—–-]\s*/, "").trim(),
      image: fieldOf(block, "Image prompt"),
      video: fieldOf(block, "Video prompt"),
      settings: fieldOf(block, "Settings"),
      negative: fieldOf(block, "Negative"),
      consistency: fieldOf(block, "Consistency"),
      raw: `## Shot ${head}\n${block}`.trim(),
    });
  }
  return { lookBible, shots };
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <button type="button" onClick={copy} title={`Copy ${label ?? ""}`.trim()}
      className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[10.5px] font-medium text-white/60 transition-colors hover:bg-white/10 cursor-pointer">
      {done ? <Check className="h-3 w-3 text-[#34d399]" /> : <Copy className="h-3 w-3" />}
      {done ? "Copied" : label ?? "Copy"}
    </button>
  );
}

function Field({ label, value, color = "#a78bfa" }: { label: string; value: string; color?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color }}>{label}</span>
        <CopyBtn text={value} label={label} />
      </div>
      <p className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-white/80">{value}</p>
    </div>
  );
}

function ShotCard({ shot }: { shot: ParsedShot }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#5227FF]/20 text-[11px] font-bold text-[#a78bfa]">{shot.n}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{shot.title || `Shot ${shot.n}`}</span>
        <CopyBtn text={shot.raw} label="Copy all" />
      </div>
      <div className="space-y-2.5">
        <Field label="Image prompt" value={shot.image} />
        <Field label="Video prompt" value={shot.video} color="#7c9cff" />
        <Field label="Settings" value={shot.settings} color="#34d399" />
        <Field label="Negative" value={shot.negative} color="#f4c14d" />
        <Field label="Consistency" value={shot.consistency} color="#9ca3af" />
      </div>
    </div>
  );
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// FlowPromptsView — fetches flow-prompts.md and renders the look bible + per-shot
// copy cards, with .md/.txt downloads. `mtime` re-fetches after an in-place rewrite.
export function FlowPromptsView({
  fetchText, mtime, projectName = "flow-prompts",
}: {
  fetchText: (rel: string) => Promise<string | null>;
  mtime?: number;
  projectName?: string;
}) {
  const [md, setMd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchText("flow-prompts.md")
      .then((t) => { if (live) setMd(t); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fetchText, mtime]);

  if (loading) return <p className="py-10 text-center text-[12px] text-white/40">Loading prompts…</p>;
  if (!md) return <p className="py-10 text-center text-[12px] text-white/40">Prompts appear here once stage 5 completes.</p>;

  const { lookBible, shots } = parsePrompts(md);
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "flow-prompts";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <Clapperboard className="h-3.5 w-3.5 text-[#a78bfa]" />
        <span className="text-[12px] font-medium text-white/70">{shots.length} shot{shots.length === 1 ? "" : "s"}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => download(`${slug}-flow-prompts.md`, md)}
            className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[10.5px] font-medium text-white/60 transition-colors hover:bg-white/10 cursor-pointer">
            <Download className="h-3 w-3" /> .md
          </button>
          <button type="button" onClick={() => download(`${slug}-flow-prompts.txt`, md)}
            className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[10.5px] font-medium text-white/60 transition-colors hover:bg-white/10 cursor-pointer">
            <Download className="h-3 w-3" /> .txt
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {lookBible && (
          <div className="rounded-xl border border-[#a78bfa]/20 bg-[#a78bfa]/[0.06] px-3 py-2.5">
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#a78bfa]">Look Bible</p>
            <div className="text-[12px] text-white/75"><Markdown>{lookBible}</Markdown></div>
          </div>
        )}
        {shots.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-white/40">No shots parsed yet.</p>
        ) : (
          shots.map((s) => <ShotCard key={s.n} shot={s} />)
        )}
      </div>
    </div>
  );
}
