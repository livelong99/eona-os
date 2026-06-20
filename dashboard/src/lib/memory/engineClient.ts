// Thin client for the Hermes engine's Memory surface (the live Obsidian vault),
// reached through the `/api/hermes` proxy (dev: vite.config proxy; prod: nginx).
// The proxy injects the API_SERVER_KEY server-side, so no secret touches the
// browser. Mirrors src/lib/integrations/engineClient.ts.
//
//   getMemoryGraph → GET /v1/memory/graph
//   getNote        → GET /v1/memory/note?path=<id>
//   searchMemory   → GET /v1/memory/search?q=&k=

const API_BASE = "/api/hermes";

/** PARA-ish display folder the engine buckets a note into. */
export type GraphFolder =
  | "Projects"
  | "Areas"
  | "Resources"
  | "Archive"
  | "Daily"
  | "Inbox";

/** A single note in the vault graph. `id` is the vault-relative path. */
export interface GraphNode {
  id: string;
  title: string;
  folder: GraphFolder;
  /** Project slug when the note lives under 10_Projects/<project>/, else null. */
  project: string | null;
  tags: string[];
  /** Link count — drives node size / hub selection. */
  degree: number;
  /** Relative time string, e.g. "2h ago". */
  updated: string;
  snippet: string;
  pinned: boolean;
}

/** A `[[wikilink]]` edge between two note ids (paths). */
export interface GraphEdge {
  source: string;
  target: string;
}

/**
 * A soft/inferred edge between two notes — shared tag or shared folder — surfaced
 * as ambient "related" context, NOT a real wikilink. The engine bounds these
 * (≤600 total, ≤4 per node, never duplicating a real `links` pair).
 */
export interface SoftEdge {
  source: string;
  target: string;
  kind: "tag" | "folder";
}

/** A project cluster the engine pre-computed a colour for. */
export interface GraphProject {
  id: string;
  label: string;
  color: string;
}

export interface MemoryGraph {
  nodes: GraphNode[];
  links: GraphEdge[];
  /** Inferred "related" edges (shared tag/folder). Absent on older engines. */
  softLinks: SoftEdge[];
  projects: GraphProject[];
}

/** Full note payload for the detail panel. */
export interface NoteDetail {
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  /** Outgoing links (note ids). */
  links: string[];
  /** Notes that link to this one (note ids). */
  backlinks: string[];
}

/** One search hit. */
export interface SearchResult {
  id: string;
  title: string;
  folder: GraphFolder;
  project: string | null;
  score: number;
  snippet: string;
}

export interface SearchResponse {
  results: SearchResult[];
  /** Which backend answered — surfaced as a small UI hint. */
  source: "brain" | "filesystem";
}

/** Loads the whole vault graph (nodes + edges + project palette). */
export async function getMemoryGraph(signal?: AbortSignal): Promise<MemoryGraph> {
  const res = await fetch(`${API_BASE}/v1/memory/graph`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`memory graph failed: ${res.status}`);
  const data = (await res.json()) as Partial<MemoryGraph>;
  return {
    nodes: data.nodes ?? [],
    links: data.links ?? [],
    softLinks: data.softLinks ?? [],
    projects: data.projects ?? [],
  };
}

/** Loads one note's content, frontmatter, links and backlinks. */
export async function getNote(path: string, signal?: AbortSignal): Promise<NoteDetail> {
  const res = await fetch(`${API_BASE}/v1/memory/note?path=${encodeURIComponent(path)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`memory note failed: ${res.status}`);
  const data = (await res.json()) as Partial<NoteDetail>;
  return {
    path: data.path ?? path,
    title: data.title ?? path,
    content: data.content ?? "",
    frontmatter: data.frontmatter ?? {},
    links: data.links ?? [],
    backlinks: data.backlinks ?? [],
  };
}

/** Brain-backed semantic search (with engine-side filesystem fallback). */
export async function searchMemory(
  q: string,
  k = 10,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const res = await fetch(
    `${API_BASE}/v1/memory/search?q=${encodeURIComponent(q)}&k=${encodeURIComponent(String(k))}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    },
  );
  if (!res.ok) throw new Error(`memory search failed: ${res.status}`);
  const data = (await res.json()) as Partial<SearchResponse>;
  return {
    results: data.results ?? [],
    source: data.source === "brain" ? "brain" : "filesystem",
  };
}
