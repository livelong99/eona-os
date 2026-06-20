import { useState } from "react";
import { Sparkles, X, Wand } from "lucide-react";

interface NewSessionModalProps {
  onClose: () => void;
  onSubmit: (brief: { title: string; pitch: string; detail: string }) => void;
}

const TAGS = ["Productivity", "AI", "Health", "Developer tools", "Social", "Finance"];

// NewSessionModal — the idea-brief form. The user describes a raw idea; on submit
// the brainstorm team picks it up and opens the two-panel refinement view.
export function NewSessionModal({ onClose, onSubmit }: NewSessionModalProps) {
  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [detail, setDetail] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const canSubmit = title.trim().length > 0 && detail.trim().length > 0;

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden rounded-[28px] p-4"
      style={{ background: "rgba(2,3,8,0.55)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[min(620px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/12"
        style={{
          background: "rgba(16,17,26,0.9)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 30px 120px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-6 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#5227FF]/20">
            <Sparkles className="h-5 w-5 text-[#a78bfa]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold tracking-tight text-white">
              New brainstorm
            </h2>
            <p className="text-[12.5px] text-white/45">
              Describe the raw idea — the team refines it into a PRD.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white/85 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label="Idea title" htmlFor="bs-title">
            <input
              id="bs-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Voice-first daily journal"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.07]"
            />
          </Field>

          <Field label="One-line pitch" htmlFor="bs-pitch" optional>
            <input
              id="bs-pitch"
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              placeholder="The single sentence that sells it"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.07]"
            />
          </Field>

          <Field label="Idea brief" htmlFor="bs-detail">
            <textarea
              id="bs-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={5}
              placeholder="What is it? Who is it for? What problem does it solve? Don't worry about structure — the agents will."
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] leading-relaxed text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.07]"
            />
          </Field>

          <div>
            <p className="mb-2 text-[12px] font-medium text-white/55">Tags</p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((t) => {
                const active = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors duration-200 cursor-pointer ${
                      active
                        ? "border-[#5227FF]/50 bg-[#5227FF]/20 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/80"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-white/60 transition-colors hover:text-white/90 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit({ title: title.trim(), pitch: pitch.trim(), detail: detail.trim() })}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-all duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer"
            style={{ background: "#5227FF" }}
          >
            <Wand className="h-4 w-4" />
            Start brainstorm
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-white/55">
        {label}
        {optional && <span className="text-[11px] text-white/30">optional</span>}
      </label>
      {children}
    </div>
  );
}
