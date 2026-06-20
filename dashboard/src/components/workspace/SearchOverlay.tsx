import { useMemo, useState } from "react";
import { Search, FileCode, FileText, Settings2, CornerDownLeft } from "lucide-react";
import { FILES, type WorkspaceFile } from "@/lib/workspace-detail";

interface SearchOverlayProps {
  onClose: () => void;
}

function fileIcon(kind: WorkspaceFile["kind"]) {
  if (kind === "doc") return <FileText className="h-4 w-4 text-[#4f8cff]" />;
  if (kind === "config") return <Settings2 className="h-4 w-4 text-[#f4c14d]" />;
  return <FileCode className="h-4 w-4 text-[#34d399]" />;
}

// SearchOverlay — a command-palette-style file search for the workspace. Filters
// the file index live. Mockup: selecting a result just closes the palette.
export function SearchOverlay({ onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FILES;
    return FILES.filter((f) => f.path.toLowerCase().includes(q));
  }, [query]);

  return (
    <Backdrop onClose={onClose}>
      <div
        className="w-[min(560px,92vw)] overflow-hidden rounded-2xl border border-white/12"
        style={{
          background: "rgba(16,17,26,0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 30px 120px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-white/45" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files in workspace…"
            aria-label="Search files in workspace"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/40"
          />
          <kbd className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/45">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-white/40">
              No files match “{query}”
            </p>
          ) : (
            results.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={onClose}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-white/[0.07] cursor-pointer"
              >
                {fileIcon(f.kind)}
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-white/80">
                  {f.path}
                </span>
                <CornerDownLeft className="h-3.5 w-3.5 text-white/0 transition-colors group-hover:text-white/40" />
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-white/35">
          <span>{results.length} files</span>
          <span>Workspace file search</span>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center overflow-hidden rounded-[28px] pt-[12vh]"
      style={{ background: "rgba(2,3,8,0.5)" }}
      onClick={onClose}
    >
      {children}
    </div>
  );
}
