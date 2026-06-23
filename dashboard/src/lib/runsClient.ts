// Shared run primitives for the Labs tool clients that drive a live engine run
// (brainstorm, workspace, and any future swarm tool). These verbs hit the same
// `/v1/tools/{id}/...` and `/v1/runs/{id}/...` routes regardless of which tool
// owns the run, so they live here once and the per-tool clients thin-wrap them.
//
//   fetchTranscript    → GET /v1/tools/{id}/runs/{runId}/transcript  (SSE replay)
//   fetchArtifactJson  → GET /v1/tools/{id}/artifacts/raw            (cache-busted)
//
// The generic streamRun / sendRunMessage and the artifact-raw URL builder still
// live in toolsClient (the run-event protocol owner); this module re-exports the
// shared types from there so callers can import everything run-related from one
// place. The shared QnA shape (engine: tool_qna schema) also lives here, since
// both brainstorm and workspace read the same qna.json contract.

import { artifactRawUrl, type RunEvent } from "@/lib/labs/toolsClient";

const API_BASE = "/api/hermes";

// Re-export the run-event type so the per-tool clients (and their callers) can
// pull it from this shared module rather than reaching into toolsClient.
export type { RunEvent };

// ── Shared qna.json shape (engine: tool_qna schema) ──────────────────────────
// Both the brainstorm tool and the workspace tool persist the same qna.json
// contract for design/sprint gating, so the shape lives here once.

export type BrainstormPhase = "clarifying" | "prd-ready";

export interface QnAQuestion {
  id: string;
  agent?: string;
  category?: string;
  question: string;
  why?: string;
  answer?: string;
  answered: boolean;
  round?: number;
}

export interface QnADoc {
  project: string;
  slug: string;
  brief?: string;
  phase: BrainstormPhase;
  round?: number;
  summary?: string;
  open_count?: number;
  answered_count?: number;
  questions: QnAQuestion[];
}

// ── Cache-busted artifact reads ──────────────────────────────────────────────

// Run artifacts (qna.json, readiness.json, workspace.json, …) are rewritten in
// place each turn, so every read appends a timestamp to defeat the HTTP cache —
// a cached response would show stale state after a refresh.
function bust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`;
}

// Fetches one run artifact and parses it as JSON. Returns null on 404 (artifact
// not produced yet) or on a non-JSON body, so callers can poll without throwing.
export async function fetchArtifactJson<T>(
  toolId: string,
  runId: string,
  path: string,
  signal?: AbortSignal,
): Promise<T | null> {
  const res = await fetch(bust(artifactRawUrl(toolId, runId, path)), {
    signal,
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Fetches one run artifact as raw text. Returns null on 404 (not produced yet).
export async function fetchArtifactText(
  toolId: string,
  runId: string,
  path: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(bust(artifactRawUrl(toolId, runId, path)), {
    signal,
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`);
  return res.text();
}

// ── Transcript replay ────────────────────────────────────────────────────────

/** Replay a (non-live) run's full execution log from its persisted transcripts.
 * Returns the same RunEvent shapes the live stream emits, so a hook can rebuild
 * the agent lanes after a refresh. Returns [] when the run has no transcript. */
export async function fetchTranscript(
  toolId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunEvent[]> {
  const res = await fetch(
    `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/runs/${encodeURIComponent(runId)}/transcript`,
    { signal, cache: "no-store" },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: RunEvent[] };
  return data.events ?? [];
}
