// Client for the brainstorm → PRD tool (a swarm Labs tool, tool id "brainstorm").
// Reuses the labs run contract (launch → SSE → /message → artifacts) and adds the
// brainstorm-specific artifacts: qna.json, readiness.json, prd.md, plus promote.
//
// Schemas (engine/schemas/): brainstorm_qna.schema.json, brainstorm_readiness.schema.json.

import {
  runTool,
  sendRunMessage,
  getArtifacts,
  type RunEvent,
  type RunResult,
} from "@/lib/labs/toolsClient";
import {
  fetchArtifactJson,
  fetchArtifactText,
  fetchTranscript as fetchRunTranscript,
  type BrainstormPhase,
  type QnAQuestion,
  type QnADoc,
} from "@/lib/runsClient";

export const BRAINSTORM_TOOL_ID = "brainstorm";

const API_BASE = "/api/hermes";

// The qna.json shape (shared with the workspace tool) lives in runsClient; keep
// re-exporting it here so brainstorm callers' imports stay unchanged.
export type { BrainstormPhase, QnAQuestion, QnADoc };

/** Kebab-case a project name into its slug — mirrors the engine's _kebab so the
 * deep-link route id matches the artifacts/runs-latest lookup. */
export function slugify(text: string): string {
  return (text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Artifact shapes (mirror the engine JSON schemas) ─────────────────────────
// BrainstormPhase / QnAQuestion / QnADoc are the shared qna.json contract and
// live in runsClient (re-exported above). The readiness shapes are brainstorm-
// specific and stay here.

export type ReadinessKey =
  | "creativity"
  | "feasibility"
  | "reliability"
  | "roadmap"
  | "completeness";

export interface ReadinessMetric {
  key: ReadinessKey | string;
  label: string;
  score: number;
  threshold: number;
  notes?: string;
}

export interface ReadinessDoc {
  metrics: ReadinessMetric[];
  overall?: number;
  dev_ready: boolean;
  blocking?: string[];
}

// ── Launch / answer ──────────────────────────────────────────────────────────

/** Start a brainstorm session. `project` is the slug source; `brief` is the idea. */
export async function launchBrainstorm(
  project: string,
  brief: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  return runTool(BRAINSTORM_TOOL_ID, { project, brief }, undefined, signal);
}

interface AnswerStreamOptions {
  onEvent: (event: RunEvent) => void;
  signal?: AbortSignal;
}

/**
 * Submit the user's answers for the open questions and stream the PM's reply.
 * The answers are serialized into a deterministic block the Sage PM parses (see
 * references/3-refine-loop.md), then sent as a normal /message turn.
 */
export async function sendAnswers(
  runId: string,
  answers: Record<string, string>,
  opts: AnswerStreamOptions,
): Promise<void> {
  const filled = Object.fromEntries(
    Object.entries(answers)
      .map(([id, v]) => [id, (v ?? "").trim()] as const)
      .filter(([, v]) => v.length > 0),
  );
  const text =
    "The user has answered the open clarifying questions. Update qna.json " +
    "(mark these answered) and readiness.json: re-run the specialists whose " +
    "metric is still blocking, then either add the next round of questions or, " +
    "if every metric now clears threshold, set phase to \"prd-ready\" and draft " +
    "prd.md.\n\nANSWERS (JSON): " +
    JSON.stringify(filled);
  await sendRunMessage(runId, text, opts);
}

/**
 * Send free-form feedback on the drafted PRD. The Sage PM revises prd.md per the
 * user's request (and updates readiness.json / qna.json if scope shifts), then
 * keeps the run at "prd-ready". Used by the PRD chat once the PRD is generated.
 */
export async function sendPrdFeedback(
  runId: string,
  feedback: string,
  opts: AnswerStreamOptions,
): Promise<void> {
  const text =
    "The user reviewed the drafted PRD and is requesting changes. Apply this " +
    "feedback: revise prd.md accordingly (re-run any specialist whose area the " +
    "change touches, and update readiness.json / qna.json if scope shifts), then " +
    "keep phase \"prd-ready\" and summarize what you changed.\n\nFEEDBACK: " +
    feedback.trim();
  await sendRunMessage(runId, text, opts);
}

// ── Artifact fetch (qna.json / readiness.json / prd.md) ──────────────────────
// The cache-busted artifact-raw read + transcript replay live in runsClient
// (shared with the workspace tool); these are thin per-tool wrappers.

/** Replay a (non-live) run's full execution log from its persisted transcripts.
 * Returns the same RunEvent shapes the live stream emits, so the hook can rebuild
 * the agent lanes after a refresh. */
export function fetchTranscript(runId: string, signal?: AbortSignal): Promise<RunEvent[]> {
  return fetchRunTranscript(BRAINSTORM_TOOL_ID, runId, signal);
}

export function fetchQna(runId: string, signal?: AbortSignal): Promise<QnADoc | null> {
  return fetchArtifactJson<QnADoc>(BRAINSTORM_TOOL_ID, runId, "qna.json", signal);
}

export function fetchReadiness(
  runId: string,
  signal?: AbortSignal,
): Promise<ReadinessDoc | null> {
  return fetchArtifactJson<ReadinessDoc>(BRAINSTORM_TOOL_ID, runId, "readiness.json", signal);
}

/** Raw markdown text of the PRD (null until the PM drafts it). */
export function fetchPrd(runId: string, signal?: AbortSignal): Promise<string | null> {
  return fetchArtifactText(BRAINSTORM_TOOL_ID, runId, "prd.md", signal);
}

/** True once any of the brainstorm artifacts exist for the run. */
export async function hasArtifacts(runId: string, signal?: AbortSignal): Promise<boolean> {
  const files = await getArtifacts(BRAINSTORM_TOOL_ID, runId, signal);
  return files.length > 0;
}

// ── Promote → workspace ──────────────────────────────────────────────────────

export interface PromoteResult {
  workspace_id: string;
  path: string;
}

/** Copy the whole session folder (Ruflo state + artifacts + PRD) to a workspace. */
export async function promoteBrainstorm(
  body: { run?: string; slug?: string },
  signal?: AbortSignal,
): Promise<PromoteResult> {
  const res = await fetch(
    `${API_BASE}/v1/tools/${BRAINSTORM_TOOL_ID}/promote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  );
  if (!res.ok) throw new Error(`promoteBrainstorm failed: ${res.status}`);
  return (await res.json()) as PromoteResult;
}

// Re-export the run primitives the hook needs so callers import from one module.
export {
  streamRun,
  getLatestRun,
  getRunStatus,
  getProjects,
  getProjectArtifacts,
  isStreamNotLive,
  type RunEvent,
  type Project,
} from "@/lib/labs/toolsClient";
