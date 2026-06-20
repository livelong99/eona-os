import { Search, Layers, ScanSearch, Sparkles } from "lucide-react";
import { FOLDER_META, type NodeFolder } from "@/lib/memory";

interface MemorySidebarProps {
  query: string;
  onQuery: (q: string) => void;
  /** Live vault counts from the loaded graph. */
  stats: { notes: number; links: number; projects: number };
  /** Which backend answered the active search, or null when idle. */
  searchSource: "brain" | "filesystem" | null;
  /** Number of search hits, or null when idle. */
  searchCount: number | null;
}

const FOLDERS = Object.keys(FOLDER_META) as NodeFolder[];

// MemorySidebar — the small left panel: Brain/Obsidian search, live vault stats,
// and the PARA folder legend. The Hermes "namespaces" vector counts are omitted in
// v1 (no live data source); the project legend lives over the sphere instead.
export function MemorySidebar({ query, onQuery, stats, searchSource, searchCount }: MemorySidebarProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* Brain / Obsidian search */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
          Search memory
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search notes, tags, ideas…"
            aria-label="Search memory"
            className="w-full rounded-lg border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-[13px] text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/25 focus:bg-white/[0.08]"
          />
        </div>
        {searchSource && searchCount != null ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/40">
            <Sparkles className="h-3 w-3" style={{ color: searchSource === "brain" ? "#a78bfa" : "#8a8fa3" }} />
            {searchCount} {searchCount === 1 ? "match" : "matches"} · via {searchSource}
          </p>
        ) : (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/35">
            <ScanSearch className="h-3 w-3" />
            Semantic search across the vault
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Notes" value={stats.notes} />
        <Stat label="Links" value={stats.links} />
        <Stat label="Projects" value={stats.projects} />
      </div>

      {/* Folder legend — clickable filter */}
      <div>
        <SectionLabel icon={<Layers className="h-3.5 w-3.5" />}>Folders</SectionLabel>
        <div className="mt-2 space-y-1">
          {FOLDERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onQuery(query === f ? "" : f)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] cursor-pointer"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: FOLDER_META[f].color }} />
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
      <p className="text-[16px] font-semibold tabular-nums leading-none text-white">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[11px] text-white/45">{label}</p>
    </div>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
      <span className="text-white/50">{icon}</span>
      {children}
    </p>
  );
}
