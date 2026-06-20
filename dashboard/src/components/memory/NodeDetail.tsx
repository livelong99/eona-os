import { useEffect, useState } from "react";
import {
  X,
  Share2,
  Clock,
  Pin,
  NotebookText,
  FolderOpen,
  Link2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { FOLDER_META, nodeColor } from "@/lib/memory";
import { getNote, type NoteDetail as NoteDetailData } from "@/lib/memory/engineClient";

interface NodeDetailProps {
  /** Vault-relative path of the selected note. */
  nodeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}

const VAULT_NAME = "Vault";

/** Last path segment, no extension — a readable title fallback. */
function titleFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

/** obsidian://open deep-link — vault is named "Vault"; strip the trailing .md. */
function obsidianUri(path: string): string {
  const file = path.replace(/\.md$/i, "");
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(file)}`;
}

function folderOf(path: string): keyof typeof FOLDER_META {
  if (path.startsWith("10_Projects")) return "Projects";
  if (path.startsWith("20_Areas")) return "Areas";
  if (path.startsWith("30_Resources")) return "Resources";
  if (path.startsWith("40_Archive")) return "Archive";
  if (path.startsWith("00_Inbox")) return "Inbox";
  if (path.includes("AI/sessions")) return "Daily";
  return "Resources";
}

function projectOf(path: string): string | null {
  const m = path.match(/^10_Projects\/([^/]+)\//);
  return m ? m[1] : null;
}

// NodeDetail — a glass card (overlaying the sphere panel) describing the selected
// note: folder/project, tags, content snippet, linked notes + backlinks (clickable),
// updated time, and an "Open note" deep-link into Obsidian. Loads live content via
// getNote(); Pin/Unpin is read-only ("coming soon") in v1 (engine mount is :ro).
export function NodeDetail({ nodeId, onClose, onSelect }: NodeDetailProps) {
  const [note, setNote] = useState<NoteDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setNote(null);
    setError(null);
    setLoading(true);
    getNote(nodeId, ctrl.signal)
      .then((n) => {
        if (!ctrl.signal.aborted) {
          setNote(n);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load note");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [nodeId]);

  const accent = nodeColor({ project: projectOf(nodeId), folder: folderOf(nodeId) });
  const title = note?.title ?? titleFromPath(nodeId);
  const tags = Array.isArray(note?.frontmatter?.tags)
    ? (note!.frontmatter!.tags as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const updated =
    typeof note?.frontmatter?.modified === "string"
      ? String(note.frontmatter.modified)
      : null;

  // First ~280 chars of body (frontmatter stripped engine-side) as the preview.
  const snippet = note ? plainSnippet(note.content) : "";

  const linkRows = note?.links ?? [];
  const backRows = note?.backlinks ?? [];

  return (
    <div
      className="absolute right-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-[320px] flex-col overflow-hidden rounded-2xl border border-white/12"
      style={{
        background: "rgba(16,17,26,0.82)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
      }}
    >
      {/* header */}
      <div className="flex items-start gap-2.5 border-b border-white/10 px-4 py-3.5">
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: `${accent}22` }}
        >
          <NotebookText className="h-4 w-4" style={{ color: accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold tracking-tight text-white">{title}</h3>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-white/45">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
            {projectOf(nodeId) ?? folderOf(nodeId)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white/85 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-white/45">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading note…
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 text-[12px] text-[#f0a0a0]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Couldn’t load this note ({error}).</span>
          </div>
        )}

        {!loading && !error && (
          <>
            {snippet && (
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-white/65">
                {snippet}
              </p>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/55"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {updated && (
              <p className="flex items-center gap-1.5 text-[11px] text-white/40">
                <Clock className="h-3 w-3" />
                Updated {updated}
              </p>
            )}

            {/* linked notes */}
            {linkRows.length > 0 && (
              <LinkGroup
                icon={<Share2 className="h-3.5 w-3.5" />}
                label={`Links · ${linkRows.length}`}
                ids={linkRows}
                onSelect={onSelect}
              />
            )}

            {/* backlinks */}
            {backRows.length > 0 && (
              <LinkGroup
                icon={<Link2 className="h-3.5 w-3.5" />}
                label={`Backlinks · ${backRows.length}`}
                ids={backRows}
                onSelect={onSelect}
              />
            )}

            {linkRows.length === 0 && backRows.length === 0 && (
              <p className="text-[11px] text-white/35">No links or backlinks.</p>
            )}
          </>
        )}
      </div>

      {/* actions */}
      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
        <a
          href={obsidianUri(nodeId)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-200 cursor-pointer"
          style={{ background: "#5227FF" }}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open note
        </a>
        {/* Pin/Unpin is deferred — engine mount is read-only in v1. */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Pinning coming soon — vault is read-only in v1"
          className="grid h-8 w-8 cursor-not-allowed place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-white/30"
        >
          <Pin className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function LinkGroup({
  icon,
  label,
  ids,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  ids: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
        {icon}
        {label}
      </p>
      <div className="space-y-1">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.06] cursor-pointer"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: nodeColor({ project: projectOf(id), folder: folderOf(id) }) }}
            />
            <span className="truncate">{titleFromPath(id)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Strip leading frontmatter (defensive — engine should already strip it), collapse
// whitespace, and cut to a short preview.
function plainSnippet(content: string): string {
  let body = content.trim();
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) body = body.slice(end + 4).trim();
  }
  body = body.replace(/^#+\s*/gm, "").replace(/\n{3,}/g, "\n\n");
  return body.length > 280 ? `${body.slice(0, 280).trimEnd()}…` : body;
}
