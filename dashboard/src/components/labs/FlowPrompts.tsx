// FlowPrompts — parses the Flow Director's `flow-prompts.md` into per-item blocks
// and renders copy-paste-ready cards (per-field copy + copy-all + .md/.txt
// download). Mode-agnostic: blocks are headed `## Shot|Section|Post|Scene|Beat N —
// title` and carry arbitrary bold-label fields (Image prompt / Video prompt /
// Settings / Reference / Hook / Voiceover / Asset prompt / …), so one renderer
// serves every mode. A leading `## Look Bible | Motion Direction | …` preamble is
// rendered as markdown.

import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Download, Clapperboard } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

export interface BlockField {
  label: string;
  value: string;
}
export interface PromptBlock {
  kind: string;
  n: number;
  title: string;
  fields: BlockField[];
  raw: string;
}
export interface ParsedDoc {
  header: string;
  blocks: PromptBlock[];
}

const BLOCK_RE = /^##\s+(Shot|Section|Post|Scene|Beat)\s+/i;

function fieldsOf(body: string): BlockField[] {
  const re = /(?:^|\n)\*\*([^*\n]+)\*\*[ \t]*\n?/g;
  const marks: { label: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    marks.push({ label: m[1].trim(), start: m.index, end: m.index + m[0].length });
  }
  const out: BlockField[] = [];
  for (let i = 0; i < marks.length; i++) {
    const stop = i + 1 < marks.length ? marks[i + 1].start : body.length;
    const value = body.slice(marks[i].end, stop).trim();
    if (value) out.push({ label: marks[i].label, value });
  }
  return out;
}

export function parseBlocks(md: string): ParsedDoc {
  const sections = md.split(/\n(?=##\s)/);
  let header = "";
  const blocks: PromptBlock[] = [];
  for (const raw of sections) {
    const sec = raw.replace(/^\n+/, "");
    const hm = BLOCK_RE.exec(sec);
    if (hm) {
      const lines = sec.split("\n");
      const rest = lines[0].replace(BLOCK_RE, "");
      const nm = /^(\d+)/.exec(rest);
      let body = lines.slice(1).join("\n");
      const cut = body.search(/\n---\s*(\n|$)/);
      if (cut >= 0) body = body.slice(0, cut);
      blocks.push({
        kind: hm[1],
        n: nm ? parseInt(nm[1], 10) : blocks.length + 1,
        title: rest.replace(/^\d+\s*[—–:.-]\s*/, "").trim(),
        fields: fieldsOf(body),
        raw: sec.replace(/\n---\s*$/, "").trim(),
      });
    } else if (blocks.length === 0) {
      header += (header ? "\n" : "") + sec;
    }
  }
  header = header.replace(/^#[^\n]*\n?/, "").trim();
  return { header, blocks };
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button type="button" title={`Copy ${label ?? ""}`.trim()}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1500); } catch { /* */ } }}
      className="flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[10.5px] font-medium text-white/60 transition-colors hover:bg-white/10 cursor-pointer">
      {done ? <Check className="h-3 w-3 text-[#34d399]" /> : <Copy className="h-3 w-3" />}{done ? "Copied" : label ?? "Copy"}
    </button>
  );
}

// Field-label → accent (falls back to violet). Keeps prompts visually scannable.
const FIELD_COLOR: Record<string, string> = {
  "image prompt": "#a78bfa", "video prompt": "#7c9cff", "asset prompt": "#7c9cff",
  "b-roll prompt": "#7c9cff", "voiceover": "#f0abfc", "hook": "#f4c14d",
  "settings": "#34d399", "negative": "#f4c14d", "consistency": "#9ca3af",
  "reference": "#f59e0b", "on-screen text": "#9ca3af", "caption": "#9ca3af",
  "hashtags": "#6ee7b7", "pattern": "#34d399", "scroll-beat spec": "#7c9cff",
  "implementation notes": "#9ca3af", "stock fallback": "#9ca3af", "edit notes": "#9ca3af",
};

function Field({ field }: { field: BlockField }) {
  const color = FIELD_COLOR[field.label.toLowerCase()] ?? "#a78bfa";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color }}>{field.label}</span>
        <CopyBtn text={field.value} label={field.label} />
      </div>
      <p className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-white/80">{field.value}</p>
    </div>
  );
}

function BlockCard({ block }: { block: PromptBlock }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#5227FF]/20 text-[11px] font-bold text-[#a78bfa]">{block.n}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
          <span className="text-white/40">{block.kind} {block.n}</span>{block.title ? ` · ${block.title}` : ""}
        </span>
        <CopyBtn text={block.raw} label="Copy all" />
      </div>
      <div className="space-y-2.5">
        {block.fields.length === 0
          ? <p className="text-[11.5px] text-white/40">No fields parsed.</p>
          : block.fields.map((f, i) => <Field key={`${f.label}-${i}`} field={f} />)}
      </div>
    </div>
  );
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// FlowPromptsView — fetches flow-prompts.md and renders the direction preamble +
// per-block copy cards, with .md/.txt downloads. `mtime` re-fetches after a rewrite.
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

  const parsed = useMemo(() => (md ? parseBlocks(md) : null), [md]);

  if (loading) return <p className="py-10 text-center text-[12px] text-white/40">Loading prompts…</p>;
  if (!md || !parsed) return <p className="py-10 text-center text-[12px] text-white/40">Prompts appear here once the generate stage completes.</p>;

  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "flow-prompts";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <Clapperboard className="h-3.5 w-3.5 text-[#a78bfa]" />
        <span className="text-[12px] font-medium text-white/70">{parsed.blocks.length} block{parsed.blocks.length === 1 ? "" : "s"}</span>
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
        {parsed.header && (
          <div className="rounded-xl border border-[#a78bfa]/20 bg-[#a78bfa]/[0.06] px-3 py-2.5">
            <div className="text-[12px] text-white/75"><Markdown>{parsed.header}</Markdown></div>
          </div>
        )}
        {parsed.blocks.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-white/40">No blocks parsed yet.</p>
        ) : (
          parsed.blocks.map((b) => <BlockCard key={`${b.kind}-${b.n}`} block={b} />)
        )}
      </div>
    </div>
  );
}
