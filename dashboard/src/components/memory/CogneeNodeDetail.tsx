import { X, Network, Share2, FileText, Tag } from "lucide-react";
import type { GraphNode } from "@/lib/memory/engineClient";

interface CogneeNodeDetailProps {
  /** The selected Cognee entity, already loaded in the graph payload. */
  node: GraphNode;
  onClose: () => void;
}

const ACCENT = "#22d3ee"; // teal — the Cognee brain accent

// CogneeNodeDetail — the brain-aware detail card for a Cognee entity. Unlike the
// vault NodeDetail (which fetches a markdown note), a Cognee node is not a file:
// its description, typed relationships, and source snippets already rode along on
// the loaded graph payload, so this card renders entirely from the node object
// with NO network request. Mirrors NodeDetail's glass styling for consistency.
export function CogneeNodeDetail({ node, onClose }: CogneeNodeDetailProps) {
  const description = node.description?.trim() || node.snippet?.trim() || "";
  const relations = node.relations ?? [];
  const sources = node.sources ?? [];
  const tags = node.tags ?? [];
  // entity type bucket — project carries the Cognee entity type; folder is the fallback label.
  const entityType = node.project ?? node.folder;

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
          style={{ background: `${ACCENT}22` }}
        >
          <Network className="h-4 w-4" style={{ color: ACCENT }} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold tracking-tight text-white">
            {node.title || node.id}
          </h3>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-white/45">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACCENT }} />
            {entityType} · Cognee entity
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
        {description && (
          <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-white/65">
            {description}
          </p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/55"
              >
                <Tag className="h-2.5 w-2.5" />
                {t}
              </span>
            ))}
          </div>
        )}

        {/* typed relationships */}
        {relations.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
              <Share2 className="h-3.5 w-3.5" />
              Relationships · {relations.length}
            </p>
            <div className="space-y-1">
              {relations.map((r, i) => (
                <div
                  key={`${r.target}:${i}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-white/70"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACCENT }} />
                  <span className="truncate">{r.target}</span>
                  {r.label && (
                    <span className="ml-auto shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/40">
                      {r.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* source-note snippets */}
        {sources.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
              <FileText className="h-3.5 w-3.5" />
              Sources · {sources.length}
            </p>
            <div className="space-y-1.5">
              {sources.map((s, i) => (
                <div
                  key={`${s.path ?? s.title ?? "src"}:${i}`}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2"
                >
                  {(s.title || s.path) && (
                    <p className="mb-0.5 truncate text-[11px] font-medium text-white/55">
                      {s.title ?? s.path}
                    </p>
                  )}
                  {s.snippet && (
                    <p className="text-[12px] leading-relaxed text-white/55">{s.snippet}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!description && relations.length === 0 && sources.length === 0 && (
          <p className="text-[11px] text-white/35">No further detail for this entity.</p>
        )}
      </div>
    </div>
  );
}
