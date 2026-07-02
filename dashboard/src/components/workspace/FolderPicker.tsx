import { useEffect, useState } from "react";
import { Folder, CornerLeftUp, Loader, Check, HardDrive, ChevronRight, Keyboard } from "lucide-react";
import { browseFolders, type FolderListing } from "@/lib/workspace/workspaceClient";

interface Props {
  value: string;
  onChange: (path: string) => void;
}

// FolderPicker — a Finder-like folder browser scoped to the engine-visible
// workspaces/vault root(s). Click a folder row to SELECT it (sets the value);
// use the chevron to drill in. A manual-path fallback covers folders the picker
// can't reach (no Obsidian vault mounted yet, or a path outside every configured
// root) — the engine's containment check is still the only gate on submission.
export function FolderPicker({ value, onChange }: Props) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const open = (path?: string, root?: string) => {
    setLoading(true);
    setError(null);
    browseFolders(path, root)
      .then(setListing)
      .catch((e) => setError(e instanceof Error ? e.message : "browse failed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Start from the parent of an already-picked folder, else the root.
    open(value ? value.replace(/\/[^/]+$/, "") || undefined : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atRoot = !listing?.parent;
  const short = (p: string) => p.replace(listing?.root ?? "", "") || "/";
  const roots = listing?.roots ?? [];

  if (manual) {
    return (
      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
        <div className="p-3">
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/absolute/path/to/project"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono text-[13px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.07]"
          />
          <p className="mt-1.5 text-[11.5px] text-white/35">
            Must be inside a configured root — the create step reports a clear error otherwise.
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.08] px-3 py-2">
          <span className="text-[12px] text-white/40">Typed path</span>
          <button
            type="button"
            onClick={() => setManual(false)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-[#a78bfa] transition-colors hover:bg-white/10 cursor-pointer"
          >
            <Folder className="h-3.5 w-3.5" /> Browse instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      {/* root switcher — only rendered when more than one root is configured */}
      {roots.length > 1 && (
        <div className="flex gap-1 border-b border-white/[0.08] bg-white/[0.02] p-1.5">
          {roots.map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => open(r.path, r.path)}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors cursor-pointer ${
                listing?.root === r.path ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      {/* path bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2">
        <button
          type="button"
          onClick={() => listing?.parent && open(listing.parent)}
          disabled={atRoot || loading}
          title="Up one level"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/10 disabled:opacity-30 cursor-pointer"
        >
          <CornerLeftUp className="h-4 w-4" />
        </button>
        <HardDrive className="h-3.5 w-3.5 shrink-0 text-white/35" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/65" title={listing?.path}>
          {listing ? short(listing.path) : "…"}
        </span>
        {loading && <Loader className="h-3.5 w-3.5 shrink-0 animate-spin text-white/40" />}
      </div>

      {/* folder list — row click selects, chevron drills in */}
      <div className="max-h-52 overflow-y-auto p-1">
        {error ? (
          <p className="px-2 py-6 text-center text-[12px] text-[#f87171]">{error}</p>
        ) : listing && listing.entries.length === 0 && !loading ? (
          <p className="px-2 py-6 text-center text-[12px] text-white/35">No sub-folders here.</p>
        ) : (
          listing?.entries.map((e) => {
            const selected = e.path === value;
            return (
              <div
                key={e.path}
                className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${
                  selected ? "bg-[#5227FF]/20" : "hover:bg-white/[0.06]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onChange(e.path)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-white/85 cursor-pointer"
                >
                  <Folder className="h-4 w-4 shrink-0 text-[#7c9cff]" />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[#34d399]" />}
                </button>
                <button
                  type="button"
                  onClick={() => open(e.path)}
                  title="Open"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/40 opacity-0 transition-opacity hover:bg-white/10 hover:text-white/80 group-hover:opacity-100 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* selection footer */}
      <div className="flex items-center gap-2 border-t border-white/[0.08] px-3 py-2">
        {value ? (
          <>
            <Check className="h-3.5 w-3.5 shrink-0 text-[#34d399]" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/70" title={value}>
              Ingest <span className="font-mono text-white/90">{short(value)}</span>
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12px] text-white/40">
            Click a folder to select it · chevron to open.
          </span>
        )}
        <button
          type="button"
          onClick={() => setManual(true)}
          title="Type a path instead — useful if the folder isn't reachable here (e.g. no Obsidian vault mounted)"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white/80 cursor-pointer"
        >
          <Keyboard className="h-3.5 w-3.5" /> Type a path
        </button>
      </div>

      {/* effective destination — names the ACTUAL configured root, not a hardcoded path */}
      {listing?.root && (
        <p
          className="truncate border-t border-white/[0.08] px-3 py-1.5 text-[11px] text-white/35"
          title={listing.root}
        >
          Copied into the configured {rootLabel(roots, listing.root)} folder ({listing.root}).
        </p>
      )}
    </div>
  );
}

// The active root's configured label (e.g. "Workspaces"/"Vault"), falling back
// to its basename when the engine hasn't reported `roots` yet (older build).
function rootLabel(roots: { path: string; label: string }[], root: string): string {
  const match = roots.find((r) => r.path === root);
  if (match) return match.label;
  const base = root.replace(/\/+$/, "").split("/").pop();
  return base || "workspaces";
}
