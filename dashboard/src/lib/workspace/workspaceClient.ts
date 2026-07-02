// Client for the workspace tool (Architect-orchestrated SDLC pipeline, tool id
// "workspace"). Reuses the labs run contract (launch via /create → SSE → /message
// → artifacts/transcript) and adds the workspace-specific artifacts: workspace.json
// (phase state), qna.json (design/sprint gating), architecture.md, epics.md.

import {
  sendRunMessage,
  type RunEvent,
} from "@/lib/labs/toolsClient";
import {
  fetchArtifactJson,
  fetchArtifactText,
  fetchTranscript as fetchRunTranscript,
  type QnADoc,
} from "@/lib/runsClient";

export const WORKSPACE_TOOL_ID = "workspace";
const API_BASE = "/api/hermes";

// ── Phase state (mirrors engine/schemas/workspace_state.schema.json) ─────────

// Per-feature design→sprint→implement cycle phase.
export type FeaturePhase =
  | "designing" | "design-qna" | "design-review" | "design-approved"
  | "sprint-planning" | "sprint-qna" | "sprint-approved"
  | "implementing" | "done";

// Top-level workspace SETUP lifecycle (then per-feature work). The feature-cycle
// values are also allowed for back-compat with a single implicit feature.
export type WorkspacePhase =
  | "ingesting" | "provisioning" | "documenting" | "ready" | "working"
  | FeaturePhase;

export type SourceType = "folder" | "github" | "brainstorm";

export interface WorkspaceStory {
  id: string;
  title?: string;
  epic?: string;
  status: "backlog" | "ready-for-dev" | "in-progress" | "review" | "approved" | "done" | "blocked";
  review?: { verdict?: "pass" | "changes-requested" | "pending"; findings?: string; file?: string };
}

export interface WorkspaceTeamMember {
  id: string;
  name?: string;
  role: string;
  file?: string;
}

export interface WorkspaceGates {
  design?: "pending" | "approved";
  sprint?: "pending" | "approved";
}

export interface WorkspaceSprint {
  current_story?: string;
  stories?: WorkspaceStory[];
}

// A feature = an OpenSpec change at openspec/changes/{slug}/ with its own cycle.
export interface WorkspaceFeature {
  id?: string;
  slug: string;
  title: string;
  description?: string;
  phase: FeaturePhase;
  change_dir?: string;
  gates?: WorkspaceGates;
  sprint?: WorkspaceSprint;
  summary?: string;
  created?: number;
}

export interface WorkspaceState {
  name: string;
  slug: string;
  path?: string;
  source?: { type: SourceType; ref: string };
  phase: WorkspacePhase;
  mode?: "manual" | "auto";
  team?: WorkspaceTeamMember[];
  scripts?: { build?: string; run?: string; test?: string };
  active_feature?: string;
  features?: WorkspaceFeature[];
  // Back-compat: a single implicit feature's gates/sprint live at top-level.
  gates?: WorkspaceGates;
  sprint?: WorkspaceSprint;
  summary?: string;
  updated?: number;
}

export interface CreateResult {
  workspace_id: string;
  run_id: string;
  session_id: string;
  path: string;
}

// ── Create ───────────────────────────────────────────────────────────────────

/** Thrown when the picked folder is already onboarded — carries the slug to open. */
export class WorkspaceExistsError extends Error {
  slug: string;
  constructor(message: string, slug: string) {
    super(message);
    this.name = "WorkspaceExistsError";
    this.slug = slug;
  }
}

export async function createWorkspace(
  body: { name: string; source_type: SourceType; source_ref: string },
  signal?: AbortSignal,
): Promise<CreateResult> {
  const res = await fetch(`${API_BASE}/v1/tools/${WORKSPACE_TOOL_ID}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let data: { error?: string; detail?: string; slug?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* ignore */
    }
    if (res.status === 409 && data.error === "already_onboarded" && data.slug) {
      throw new WorkspaceExistsError(data.detail || "already onboarded", data.slug);
    }
    throw new Error(data.detail || `${res.status}`);
  }
  return (res.json()) as Promise<CreateResult>;
}

/**
 * Relaunch the orchestrator against an EXISTING workspace folder (no ingest) —
 * used when the in-memory run was lost (engine restart) so the dashboard can
 * keep driving the workspace.
 */
export async function resumeWorkspace(slug: string, signal?: AbortSignal): Promise<CreateResult> {
  const res = await fetch(`${API_BASE}/v1/tools/${WORKSPACE_TOOL_ID}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
    signal,
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = ((await res.json()) as { detail?: string }).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (res.json()) as Promise<CreateResult>;
}

// ── Artifact reads (cache-busted; rewritten in place each turn) ──────────────
// The generic cache-busted artifact-raw read lives in runsClient (shared with
// brainstorm); these are tool-scoped wrappers bound to WORKSPACE_TOOL_ID.

const fetchJson = <T>(runId: string, path: string, signal?: AbortSignal) =>
  fetchArtifactJson<T>(WORKSPACE_TOOL_ID, runId, path, signal);

const fetchText = (runId: string, path: string, signal?: AbortSignal) =>
  fetchArtifactText(WORKSPACE_TOOL_ID, runId, path, signal);

export function fetchWorkspaceState(runId: string, signal?: AbortSignal) {
  return fetchJson<WorkspaceState>(runId, "workspace.json", signal);
}

// Per-feature artifacts live in the OpenSpec change folder. When no feature is
// active (legacy single-cycle workspaces), fall back to the original top-level /
// _bmad-output paths so in-flight workspaces keep rendering.
const changeDir = (slug: string) => `openspec/changes/${slug}`;

export function fetchWorkspaceQna(runId: string, featureSlug?: string, signal?: AbortSignal) {
  const path = featureSlug ? `${changeDir(featureSlug)}/qna.json` : "qna.json";
  return fetchJson<QnADoc>(runId, path, signal); // reuse the brainstorm QnA shape
}

/** Replay a (non-live) workspace run's execution log from its transcripts. */
export function fetchTranscript(runId: string, signal?: AbortSignal): Promise<RunEvent[]> {
  return fetchRunTranscript(WORKSPACE_TOOL_ID, runId, signal);
}
// Design view = the OpenSpec change's proposal (why/what/impact) + design.md
// (technical decisions), concatenated. Legacy fallback: architecture.md.
export async function fetchDesign(runId: string, featureSlug?: string, signal?: AbortSignal) {
  if (!featureSlug) {
    return fetchText(runId, "_bmad-output/planning-artifacts/architecture.md", signal);
  }
  const [proposal, design] = await Promise.all([
    fetchText(runId, `${changeDir(featureSlug)}/proposal.md`, signal),
    fetchText(runId, `${changeDir(featureSlug)}/design.md`, signal),
  ]);
  const parts = [proposal, design].filter(Boolean);
  return parts.length ? parts.join("\n\n---\n\n") : null;
}

// Tasks/plan view = the OpenSpec change's tasks.md. Legacy fallback: epics.md.
export function fetchEpics(runId: string, featureSlug?: string, signal?: AbortSignal) {
  const path = featureSlug ? `${changeDir(featureSlug)}/tasks.md` : "_bmad-output/planning-artifacts/epics.md";
  return fetchText(runId, path, signal);
}

// ── Drive the orchestrator (resume turns) ─────────────────────────────────────

interface StreamOpts {
  onEvent: (event: RunEvent) => void;
  signal?: AbortSignal;
}

/** Send a free-form directive to the orchestrator (approve / request-changes / start). */
export function sendDirective(runId: string, text: string, opts: StreamOpts): Promise<void> {
  return sendRunMessage(runId, text, opts);
}

/** Ask the orchestrator to create a new feature (a fresh OpenSpec change) and begin its design. */
export function createFeature(
  runId: string,
  feature: { title: string; description?: string },
  opts: StreamOpts,
): Promise<void> {
  const desc = feature.description?.trim();
  const text =
    `Create a new feature: "${feature.title.trim()}"` +
    (desc ? ` — ${desc}` : "") +
    ". Add it to workspace.json features[] as an OpenSpec change under " +
    "openspec/changes/{slug}/, set it as active_feature, and begin its design.";
  return sendRunMessage(runId, text, opts);
}

/** Switch the active feature (resume work on an existing OpenSpec change). */
export function switchFeature(runId: string, slug: string, opts: StreamOpts): Promise<void> {
  const text =
    `Switch the active feature to "${slug}". Set workspace.json.active_feature = "${slug}" ` +
    "and resume that feature's current phase.";
  return sendRunMessage(runId, text, opts);
}

/** Submit answers to the open qna.json questions (design/sprint gating). */
export function sendAnswers(
  runId: string,
  answers: Record<string, string>,
  opts: StreamOpts,
): Promise<void> {
  const filled = Object.fromEntries(
    Object.entries(answers)
      .map(([id, v]) => [id, (v ?? "").trim()] as const)
      .filter(([, v]) => v.length > 0),
  );
  const text =
    "The user answered the open clarifying questions. Update qna.json (mark answered) " +
    "and continue the current phase per your step-gate.\n\nANSWERS (JSON): " +
    JSON.stringify(filled);
  return sendRunMessage(runId, text, opts);
}

// ── Git (read-only status + user-initiated push) ─────────────────────────────

export interface GitCommit {
  hash: string;
  subject: string;
  author: string;
  date: string;
}
export interface GitStatus {
  is_repo: boolean;
  /** True when the folder is NOT its own repo but sits inside a parent repo. */
  in_parent_repo?: boolean;
  branch?: string;
  remote?: string | null;
  dirty?: number;
  ahead?: number | null;
  behind?: number | null;
  has_upstream?: boolean;
  commits?: GitCommit[];
}

/** Branch + recent commits + ahead/behind/dirty for the workspace folder. */
export async function fetchGitStatus(slug: string, signal?: AbortSignal): Promise<GitStatus> {
  const res = await fetch(
    `${API_BASE}/v1/tools/${WORKSPACE_TOOL_ID}/git?slug=${encodeURIComponent(slug)}`,
    { signal, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`git status failed: ${res.status}`);
  return (res.json()) as Promise<GitStatus>;
}

async function gitAction(slug: string, action: "push" | "init"): Promise<{ ok: boolean; output: string }> {
  const res = await fetch(`${API_BASE}/v1/tools/${WORKSPACE_TOOL_ID}/git/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  let data: { ok?: boolean; output?: string; detail?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* ignore */
  }
  return { ok: Boolean(data.ok), output: data.output || data.detail || `${res.status}` };
}

/** Push the workspace's current branch (user-initiated). */
export const pushWorkspace = (slug: string) => gitAction(slug, "push");

/** Initialize a git repo for the workspace folder + an initial commit. */
export const initWorkspaceGit = (slug: string) => gitAction(slug, "init");

// ── Rename (display name only; folder/slug unchanged) ────────────────────────

export async function renameWorkspace(slug: string, name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tools/${WORKSPACE_TOOL_ID}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, name }),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = ((await res.json()) as { detail?: string }).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
}

// ── Local-folder picker (server-side folder browser, scoped to the vault) ────

export interface FolderEntry {
  name: string;
  path: string;
}
export interface BrowseRoot {
  path: string;
  label: string;
}
export interface FolderListing {
  root: string;
  path: string;
  parent: string | null;
  entries: FolderEntry[];
  /** Every configured browse root (engine `HERMES_BROWSE_ROOTS`). Usually a single
   * entry — a root switcher only makes sense to show when there's more than one. */
  roots?: BrowseRoot[];
}

/**
 * List sub-folders of `path` (or the browse root) for the local-folder picker.
 * `root` optionally switches which configured root to browse from (see `roots`
 * on the returned listing); omit to use the default/active root.
 */
export async function browseFolders(path?: string, root?: string, signal?: AbortSignal): Promise<FolderListing> {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  if (root) params.set("root", root);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/v1/tools/${WORKSPACE_TOOL_ID}/browse${qs ? `?${qs}` : ""}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`browse failed: ${res.status}`);
  return (res.json()) as Promise<FolderListing>;
}

// ── Build / Run / Test scripts (streamed logs) ───────────────────────────────

export type ScriptKind = "build" | "run" | "test";

export interface ScriptLine {
  type: "start" | "line" | "exit" | "error";
  text?: string;
  code?: number;
  detail?: string;
  script?: ScriptKind;
}

/** Run scripts/{kind}.sh in the workspace and stream stdout/stderr lines (SSE). */
export async function runScript(
  slug: string,
  kind: ScriptKind,
  opts: { onLine: (line: ScriptLine) => void; signal?: AbortSignal },
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tools/${WORKSPACE_TOOL_ID}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, script: kind }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    let detail = `${res.status}`;
    try {
      detail = ((await res.json()) as { detail?: string }).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        opts.onLine(JSON.parse(dataLine.slice(5).trim()) as ScriptLine);
      } catch {
        /* skip malformed frame */
      }
    }
  }
}

/** Stop a running build/run/test script. */
export async function stopScript(slug: string, kind: ScriptKind): Promise<void> {
  await fetch(`${API_BASE}/v1/tools/${WORKSPACE_TOOL_ID}/exec/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, script: kind }),
  }).catch(() => {});
}

export {
  streamRun,
  getLatestRun,
  getRunStatus,
  getProjects,
  isStreamNotLive,
  type RunEvent,
  type Project,
} from "@/lib/labs/toolsClient";
