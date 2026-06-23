import { useEffect, useState } from "react";
import { Folder, CornerLeftUp, Loader, Check, HardDrive, ChevronRight } from "lucide-react";
import { browseFolders, type FolderListing } from "@/lib/workspace/workspaceClient";

interface Props {
  value: string;
  onChange: (path: string) => void;
}

// FolderPicker — a Finder-like folder browser scoped to the engine-visible vault.
// Click a folder row to SELECT it (sets the value); use the chevron to drill in.
// The chosen path is always engine-readable so the copy-into-10_Projects works.
export function FolderPicker({ value, onChange }: Props) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const open = (path?: string) => {
    setLoading(true);
    setError(null);
    browseFolders(path)
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

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
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
          <span className="text-[12px] text-white/40">Click a folder to select it · chevron to open.</span>
        )}
      </div>
    </div>
  );
}
