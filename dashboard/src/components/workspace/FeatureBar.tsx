import { useState } from "react";
import { Plus, GitBranch, X, Loader, Layers } from "lucide-react";
import type { WorkspaceFeature } from "@/lib/workspace/workspaceClient";

const PHASE_TONE: Record<string, string> = {
  designing: "#a78bfa", "design-qna": "#f4c14d", "design-review": "#a78bfa", "design-approved": "#7c9cff",
  "sprint-planning": "#a78bfa", "sprint-qna": "#f4c14d", "sprint-approved": "#7c9cff",
  implementing: "#34d399", done: "#34d399",
};

interface Props {
  features: WorkspaceFeature[];
  activeFeature: string | null;
  liveFeature: string | null;
  streaming: boolean;
  setupPhase: boolean;
  onSelect: (slug: string) => void;
  onCreate: (title: string, description?: string) => void;
}

// FeatureBar — navigate between features (each an OpenSpec change) and create new
// ones. The viewed feature is highlighted; the one the orchestrator is actively
// working carries a live dot.
export function FeatureBar({
  features, activeFeature, liveFeature, streaming, setupPhase, onSelect, onCreate,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const submit = () => {
    const t = title.trim();
    if (!t || streaming) return;
    onCreate(t, desc.trim() || undefined);
    setTitle(""); setDesc(""); setAdding(false);
  };

  return (
    <div className="flex items-center gap-2 px-1">
      <Layers className="h-3.5 w-3.5 shrink-0 text-white/35" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {features.length === 0 && (
          <span className="text-[12px] text-white/40">
            {setupPhase ? "Setting up the workspace…" : "No features yet — create one to start."}
          </span>
        )}
        {features.map((f) => {
          const tone = PHASE_TONE[f.phase] ?? "#8a8fa3";
          const selected = f.slug === activeFeature;
          return (
            <button
              key={f.slug}
              type="button"
              onClick={() => onSelect(f.slug)}
              title={f.description || f.title}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors cursor-pointer ${
                selected ? "border-white/30 bg-white/[0.08] text-white" : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.05]"
              }`}
            >
              <GitBranch className="h-3 w-3" style={{ color: tone }} />
              <span className="max-w-[160px] truncate">{f.title}</span>
              {f.slug === liveFeature && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} title="Active" />
              )}
            </button>
          );
        })}
      </div>

      {adding ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/30 p-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
            placeholder="Feature title…"
            className="w-40 bg-transparent px-1.5 text-[12.5px] text-white outline-none placeholder:text-white/35"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
            placeholder="short description (optional)"
            className="w-48 bg-transparent px-1.5 text-[12px] text-white/80 outline-none placeholder:text-white/30"
          />
          <button type="button" onClick={submit} disabled={!title.trim() || streaming}
            className="grid h-6 w-6 place-items-center rounded-md text-white disabled:opacity-40 cursor-pointer" style={{ background: "#5227FF" }}>
            {streaming ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="grid h-6 w-6 place-items-center rounded-md text-white/50 hover:bg-white/10 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={setupPhase}
          title={setupPhase ? "Available once the workspace is set up" : "New feature"}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[12px] font-medium text-white/75 transition-colors hover:bg-white/[0.06] disabled:opacity-40 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> New feature
        </button>
      )}
    </div>
  );
}
