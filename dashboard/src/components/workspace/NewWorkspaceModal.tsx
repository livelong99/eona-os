import { useEffect, useState } from "react";
import { FolderGit2, GitBranch, Sparkles, X, FolderInput, Loader, ArrowRight } from "lucide-react";
import { FolderPicker } from "@/components/workspace/FolderPicker";
import {
  getProjects,
  WorkspaceExistsError,
  type SourceType,
  type Project,
} from "@/lib/workspace/workspaceClient";

interface Props {
  onClose: () => void;
  onCreate: (body: { name: string; source_type: SourceType; source_ref: string }) => Promise<void>;
  onOpenWorkspace: (slug: string) => void;
}

const TABS: { type: SourceType; label: string; icon: typeof FolderInput }[] = [
  { type: "folder", label: "Local folder", icon: FolderInput },
  { type: "github", label: "GitHub repo", icon: GitBranch },
  { type: "brainstorm", label: "Brainstorm", icon: Sparkles },
];

export function NewWorkspaceModal({ onClose, onCreate, onOpenWorkspace }: Props) {
  const [tab, setTab] = useState<SourceType>("folder");
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [github, setGithub] = useState("");
  const [brainstorm, setBrainstorm] = useState("");
  const [brainstorms, setBrainstorms] = useState<Project[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the picked folder is already onboarded — offer to open it instead.
  const [existingSlug, setExistingSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProjects("brainstorm")
      .then((ps) => !cancelled && setBrainstorms(ps))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const ref = tab === "folder" ? folder : tab === "github" ? github : brainstorm;
  const canSubmit = name.trim().length > 0 && ref.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setExistingSlug(null);
    try {
      await onCreate({ name: name.trim(), source_type: tab, source_ref: ref.trim() });
    } catch (e) {
      if (e instanceof WorkspaceExistsError) {
        setExistingSlug(e.slug);
      } else {
        setError(e instanceof Error ? e.message : "create failed");
      }
      setSubmitting(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden rounded-[28px] p-4"
      style={{ background: "rgba(2,3,8,0.55)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[min(620px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/12"
        style={{ background: "rgba(16,17,26,0.92)", backdropFilter: "blur(24px)", boxShadow: "0 30px 120px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-6 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#5227FF]/20">
            <FolderGit2 className="h-5 w-5 text-[#a78bfa]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold tracking-tight text-white">New workspace</h2>
            <p className="text-[12.5px] text-white/45">
              Ingest a project — the Architect provisions a team and drives it to implemented code.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white/85 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Field label="Workspace name" htmlFor="ws-name">
            <input id="ws-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smart Pantry"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.07]" />
          </Field>

          <div>
            <p className="mb-2 text-[12px] font-medium text-white/55">Source</p>
            <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.type;
                return (
                  <button key={t.type} type="button" onClick={() => setTab(t.type)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                      active ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80"
                    }`}>
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "folder" && (
            <Field label="Local folder" htmlFor="ws-folder">
              <FolderPicker
                value={folder}
                onChange={(p) => {
                  setFolder(p);
                  // Auto-fill the name from the folder if the user hasn't typed one.
                  if (p && !name.trim()) setName(titleizeBasename(p));
                }}
              />
              <p className="mt-1.5 text-[11.5px] text-white/35">
                Click a folder to select it (chevron to open). It's copied into 10_Projects.
              </p>
            </Field>
          )}
          {tab === "github" && (
            <Field label="Public GitHub repo URL" htmlFor="ws-github">
              <input id="ws-github" value={github} onChange={(e) => setGithub(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono text-[13px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.07]" />
            </Field>
          )}
          {tab === "brainstorm" && (
            <Field label="Completed brainstorm" htmlFor="ws-brainstorm">
              <select id="ws-brainstorm" value={brainstorm} onChange={(e) => setBrainstorm(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white outline-none transition-colors focus:border-white/25 focus:bg-white/[0.07]">
                <option value="">{brainstorms.length ? "Select a session…" : "No brainstorm sessions"}</option>
                {brainstorms.map((b) => (
                  <option key={b.id} value={b.id} className="bg-[#10111a]">{b.name || b.id}</option>
                ))}
              </select>
            </Field>
          )}

          {error && <p className="text-[12.5px] text-[#f87171]">{error}</p>}

          {existingSlug && (
            <div className="flex items-center gap-3 rounded-lg border border-[#f4c14d]/30 bg-[#f4c14d]/[0.08] px-3.5 py-3">
              <FolderGit2 className="h-4 w-4 shrink-0 text-[#f4c14d]" />
              <p className="min-w-0 flex-1 text-[12.5px] text-white/75">
                <span className="font-mono text-white/90">{existingSlug}</span> is already onboarded as a workspace.
              </p>
              <button
                type="button"
                onClick={() => onOpenWorkspace(existingSlug)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#5227FF] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#6438ff] cursor-pointer"
              >
                Open workspace <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-white/60 transition-colors hover:text-white/90 cursor-pointer">
            Cancel
          </button>
          <button type="button" disabled={!canSubmit} onClick={submit}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-all disabled:cursor-default disabled:opacity-40 cursor-pointer"
            style={{ background: "#5227FF" }}>
            {submitting ? <Loader className="h-4 w-4 animate-spin" /> : <FolderGit2 className="h-4 w-4" />}
            Create workspace
          </button>
        </div>
      </div>
    </div>
  );
}

// "/vault/10_Projects/my-cool-app" → "My Cool App"
function titleizeBasename(path: string): string {
  const base = path.replace(/\/+$/, "").split("/").pop() ?? "";
  return base
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-medium text-white/55">{label}</label>
      {children}
    </div>
  );
}
