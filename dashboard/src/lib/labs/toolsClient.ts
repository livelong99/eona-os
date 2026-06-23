// Thin client for the Hermes engine's Labs "tools" surface, reached through the
// `/api/hermes` proxy (dev: vite.config proxy; prod: nginx). The proxy injects
// the API_SERVER_KEY server-side, so no secret ever touches the browser.
//
//   getTools    → GET    /v1/tools                     (manifest gallery)
//   getTool     → GET    /v1/tools/{id}                (full manifest)
//   refineDraft → POST   /v1/tools/refine              (SSE: OpenAI deltas)
//   buildTool   → POST   /v1/tools/build               ({tool_id, run_id})
//   runTool     → POST   /v1/tools/{id}/launch         ({run_id})
//   streamRun   → GET    /v1/runs/{id}/events          (SSE: run events)
//   deleteTool  → DELETE /v1/tools/{id}                ({deleted})
//
// Mirrors src/lib/integrations/engineClient.ts (plain fetch) + the SSE reader in
// src/lib/voice/engineClient.ts (streamReply).

import type { BuilderState } from "@/components/labs/builderState";

const API_BASE = "/api/hermes";

// ── Manifest types (the engine's tool.yaml as JSON) ──────────────────────────

/** One input field on a tool's launch form. */
export interface ToolInput {
  id: string;
  label: string;
  /** Free-form type from the manifest; the form maps known values to widgets. */
  type: string;
  required?: boolean;
  /** Options for select-style inputs. */
  options?: string[];
  /** Optional default / placeholder hint. */
  placeholder?: string;
  hint?: string;
}

/** How a step renders in the live Workbench. */
export type StepUi = "chat" | "artifact-iframe" | "file-cards" | "qna-json";

/** One workflow step in a tool's manifest. */
export interface ToolStep {
  id: string;
  title: string;
  detail?: string;
  /** Render hint for the live Workbench panel; defaults to "chat". */
  ui?: StepUi;
  /** Optional glob(s) naming the artifact(s) this step produces. */
  artifacts?: string[];
}

/** A tool as the engine reports it — discovered from a tool.yaml manifest. */
export interface ToolManifest {
  id: string;
  title: string;
  description?: string;
  /** The skill the launch routes to (the `/{skill}` prompt). */
  skill?: string;
  category?: string;
  icon?: string;
  accent?: string;
  steps?: ToolStep[];
  inputs?: ToolInput[];
  /** True when the tool runs as a Ruflo multi-agent swarm (glass-box run UI). */
  swarm?: boolean;
  /** Steering doc filename (assets/) for swarm provisioning. */
  steering?: string;
  /** Misc manifest fields the UI may surface (tagline, goals, etc.). */
  tagline?: string;
  goals?: string[];
  /** Engine-reported run count when available. */
  runs?: number;
  /** Last-updated marker when available. */
  updated?: string;
}

interface ToolsResponse {
  tools: ToolManifest[];
}

/**
 * A run event streamed over /v1/runs/{id}/events (engine/agent/run_events.py).
 * The kind is carried in `event` (e.g. "message.delta", "reasoning.available",
 * "tool.started", "tool.completed", "run.header", "run.completed",
 * "run.failed"). The payload field depends on the kind:
 *   - message.delta        → `delta`   (streamed assistant text)
 *   - reasoning.available  → `text`    (the agent's thinking)
 *   - tool.started/completed → `tool` + `preview` (skip the noisy "trace" tool)
 *   - run.header           → `model`, `tools`, `mcp_servers`
 *   - run.completed        → `output`  (final text)
 *   - run.failed           → `error`/`text`
 * Shape stays loose; older callers may still see `type`/`status`.
 */
export interface RunEvent {
  /** The event kind (real protocol field). */
  event?: string;
  /** Legacy/fallback kind for non-engine frames. */
  type?: string;
  /** Streamed assistant text chunk (message.delta). */
  delta?: string;
  /** Prose payload: reasoning.available text, or a terminal message. */
  text?: string;
  /** Final assistant text on run.completed. */
  output?: string;
  /** Error detail on run.failed. */
  error?: string;
  /** Tool name on tool.started/tool.completed. */
  tool?: string;
  /** Short preview of a tool call's args/result. */
  preview?: string;
  /** Model id on run.header. */
  model?: string;
  /** Structured status when present. */
  status?: string;
  /** Step the event belongs to, when the engine tags it. */
  step?: string;
  /** Sub-agent lane this event belongs to (parent Task's tool_use id). Absent
   * on main/orchestrator-agent events. Set for every event a sub-agent emits. */
  parent_tool_use_id?: string;
  /** Stable span id for a sub-agent (equals parent_tool_use_id). */
  span_id?: string;
  /** The sub-agent's type on subagent.started/completed. */
  subagent_type?: string;
  /** A tool call's own tool_use id — on a Task tool.started this is the id the
   * spawned sub-agent's events carry as parent_tool_use_id (lets the UI label
   * the lane from the Task description). */
  tid?: string;
  /** On a Task tool.completed: the sub-agent's final report (its lane's output),
   * surfaced even when the CLI doesn't stream the sub-agent's inner events. */
  result?: string;
  /** True when this event was tailed from a sub-agent's transcript file (its
   * live thinking/text/tools), rather than the parent process stream. */
  subagent?: boolean;
  /** subagent transcript event: the sub-agent's brief (used to group its lane). */
  lane_label?: string;
  /** subagent transcript event: the transcript file id (lane fallback key). */
  lane_id?: string;
  /** Any other fields the engine attaches. */
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getTools(signal?: AbortSignal): Promise<ToolManifest[]> {
  const res = await fetch(`${API_BASE}/v1/tools`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`getTools failed: ${res.status}`);
  const data = (await res.json()) as ToolsResponse;
  return data.tools ?? [];
}

export async function getTool(id: string, signal?: AbortSignal): Promise<ToolManifest> {
  const res = await fetch(`${API_BASE}/v1/tools/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`getTool failed: ${res.status}`);
  return (await res.json()) as ToolManifest;
}

// ── Build / delete ───────────────────────────────────────────────────────────

export interface BuildResult {
  tool_id: string;
  run_id: string;
}

export async function buildTool(
  draft: BuilderState,
  signal?: AbortSignal,
): Promise<BuildResult> {
  const res = await fetch(`${API_BASE}/v1/tools/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft }),
    signal,
  });
  if (!res.ok) throw new Error(`buildTool failed: ${res.status}`);
  return (await res.json()) as BuildResult;
}

export async function deleteTool(id: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tools/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`deleteTool failed: ${res.status}`);
}

// ── Launch ───────────────────────────────────────────────────────────────────

export interface RunResult {
  run_id: string;
  /** The agent session backing the run — used to resume the conversation. */
  session_id: string;
}

/** Optional launch tweaks. `seed` is appended to the agent's first message —
 * used to resume an existing project ("these stages are already done…"). */
export interface RunOptions {
  seed?: string;
}

export async function runTool(
  id: string,
  inputs: Record<string, unknown>,
  opts?: RunOptions,
  signal?: AbortSignal,
): Promise<RunResult> {
  const body: Record<string, unknown> = { inputs };
  if (opts?.seed) body.seed = opts.seed;
  const res = await fetch(`${API_BASE}/v1/tools/${encodeURIComponent(id)}/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`runTool failed: ${res.status}`);
  return (await res.json()) as RunResult;
}

// ── Resume ───────────────────────────────────────────────────────────────────

/** The latest run for a tool+brand, used to resume a deep-linked run screen. */
export interface LatestRun {
  run_id: string;
  session_id: string;
  brand?: string;
  created?: string;
  completed?: string;
}

// Looks up the most recent run for a tool+brand so a hard reload / shared link
// of /labs/{toolId}/{brandId} can recover the run context. Returns null on 404
// (no such run) so the caller can fall back to the relaunch panel.
export async function getLatestRun(
  toolId: string,
  brandId: string,
  signal?: AbortSignal,
): Promise<LatestRun | null> {
  const res = await fetch(
    `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/runs/latest?brand=${encodeURIComponent(brandId)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getLatestRun failed: ${res.status}`);
  return (await res.json()) as LatestRun;
}

/** Liveness/terminal status for a run, used to decide whether to open the
 * live event stream at all. `live` is true only while the run currently has an
 * active event stream; a completed (or never-streaming) run is not live. */
export interface RunStatus {
  status: string;
  completed: boolean;
  live: boolean;
}

// Resolves a run's current status so the UI can gate streaming on liveness — a
// completed/non-live run must NOT subscribe to /events (which 404s for runs
// that aren't actively streaming). Returns null on 404 (unknown run) so the
// caller can fall back to the read-only project view. Mirrors getLatestRun.
export async function getRunStatus(
  runId: string,
  signal?: AbortSignal,
): Promise<RunStatus | null> {
  // Engine: GET /v1/runs/{id}/status → {status, completed, live}. (The bare
  // /v1/runs/{id} is owned by api_server and lacks `live`/`completed`, so the
  // liveness gate must hit the /status companion route.)
  const res = await fetch(`${API_BASE}/v1/runs/${encodeURIComponent(runId)}/status`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getRunStatus failed: ${res.status}`);
  const data = (await res.json()) as Partial<RunStatus>;
  return {
    status: typeof data.status === "string" ? data.status : "unknown",
    completed: Boolean(data.completed),
    live: Boolean(data.live),
  };
}

/** One persisted message from a session's durable history. Shape kept loose. */
export interface SessionMessage {
  role?: string;
  content?: string;
  [key: string]: unknown;
}

// Fetches a session's durable message history — used to rebuild a resumed run's
// transcript, since the live event stream has no replay. Tolerant of the exact
// envelope: accepts `{messages: [...]}`, `{data: [...]}`, or a bare array.
export async function getSessionMessages(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionMessage[]> {
  const res = await fetch(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    },
  );
  if (!res.ok) throw new Error(`getSessionMessages failed: ${res.status}`);
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) return data as SessionMessage[];
  const obj = data as { messages?: unknown; data?: unknown };
  if (Array.isArray(obj.messages)) return obj.messages as SessionMessage[];
  if (Array.isArray(obj.data)) return obj.data as SessionMessage[];
  return [];
}

// ── Artifacts ────────────────────────────────────────────────────────────────

/** A file produced by a run, as reported by the artifacts listing. */
export interface ArtifactFile {
  name: string;
  relpath: string;
  kind: "html" | "markdown" | "image" | "other";
  size: number;
  mtime: number;
}

interface ArtifactsResponse {
  files: ArtifactFile[];
}

// Lists the files a run has produced so far. Polled by artifact/file-card stages.
export async function getArtifacts(
  toolId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<ArtifactFile[]> {
  const res = await fetch(
    `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/artifacts?run=${encodeURIComponent(runId)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    },
  );
  if (!res.ok) throw new Error(`getArtifacts failed: ${res.status}`);
  const data = (await res.json()) as ArtifactsResponse;
  return data.files ?? [];
}

// The proxied URL for a single artifact's raw bytes — usable as an <iframe>/<img>
// src or a fetch target. The proxy injects the API key, so no auth header here.
export function artifactRawUrl(toolId: string, runId: string, relpath: string): string {
  return (
    `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/artifacts/raw` +
    `?run=${encodeURIComponent(runId)}&path=${encodeURIComponent(relpath)}`
  );
}

// ── Projects (brand folders on disk, run-independent) ────────────────────────

/** An existing project (brand folder) for a tool, as the gallery reports it. */
export interface Project {
  id: string;
  name: string;
  /** How many artifact files the brand folder holds. */
  artifact_count: number;
  /** Last-modified marker (ISO string or epoch). */
  updated: string;
  /** The artifact kinds present (e.g. ["html","markdown"]) for quick badges. */
  kinds: string[];
  /** Workspace pipeline phase (workspace tool only). */
  phase?: string;
  /** Build/run/test scripts the workspace has authored (workspace tool only). */
  scripts?: { build?: string; run?: string; test?: string };
}

interface ProjectsResponse {
  projects: Project[];
}

// Lists the existing projects (brands) a tool has produced — independent of any
// live run, read straight off the brand folders on disk.
export async function getProjects(
  toolId: string,
  signal?: AbortSignal,
): Promise<Project[]> {
  const res = await fetch(
    `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/projects`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    },
  );
  if (!res.ok) throw new Error(`getProjects failed: ${res.status}`);
  const data = (await res.json()) as ProjectsResponse;
  return data.projects ?? [];
}

// Lists the artifacts already on disk for one project (brand) — the source for
// autofilling step completion when opening an existing project (no live run).
export async function getProjectArtifacts(
  toolId: string,
  brandId: string,
  signal?: AbortSignal,
): Promise<ArtifactFile[]> {
  const res = await fetch(
    `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/projects/` +
      `${encodeURIComponent(brandId)}/artifacts`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    },
  );
  if (!res.ok) throw new Error(`getProjectArtifacts failed: ${res.status}`);
  const data = (await res.json()) as ArtifactsResponse;
  return data.files ?? [];
}

// The proxied raw-bytes URL for one project artifact — run-independent, so it
// resolves an existing brand's mockup/prompts without a run id. The proxy
// injects the API key, so no auth header here.
export function projectArtifactRawUrl(
  toolId: string,
  brandId: string,
  relpath: string,
): string {
  return (
    `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/projects/` +
    `${encodeURIComponent(brandId)}/artifacts/raw?path=${encodeURIComponent(relpath)}`
  );
}

// ── Upload ───────────────────────────────────────────────────────────────────

/** A bundle of files destined for one manifest input id. */
export interface UploadPart {
  inputId: string;
  files: File[];
}

interface UploadResponse {
  files: Record<string, string[]>;
}

// Uploads file/image inputs as multipart/form-data — each File is appended under
// its manifest input id as the field name. No Content-Type header: the browser
// sets the multipart boundary. Returns the engine's inputId→paths map.
export async function uploadFiles(
  id: string,
  parts: UploadPart[],
  signal?: AbortSignal,
): Promise<Record<string, string[]>> {
  const form = new FormData();
  for (const part of parts) {
    for (const file of part.files) {
      form.append(part.inputId, file, file.name);
    }
  }
  const res = await fetch(`${API_BASE}/v1/tools/${encodeURIComponent(id)}/upload`, {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) throw new Error(`uploadFiles failed: ${res.status}`);
  const data = (await res.json()) as UploadResponse;
  return data.files ?? {};
}

// Uploads brand assets (images and videos) into a live run's artifact tree —
// each File is appended under the field name "assets". No Content-Type header:
// the browser sets the multipart boundary. Returns the engine's saved files.
export async function uploadBrandAssets(
  toolId: string,
  runId: string,
  files: File[],
  signal?: AbortSignal,
): Promise<ArtifactFile[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("assets", file, file.name);
  }
  const res = await fetch(
    `${API_BASE}/v1/tools/${encodeURIComponent(toolId)}/brand-assets?run=${encodeURIComponent(runId)}`,
    { method: "POST", body: form, signal },
  );
  if (!res.ok) throw new Error(`uploadBrandAssets failed: ${res.status}`);
  const data = (await res.json()) as { files?: ArtifactFile[] };
  return data.files ?? [];
}

// ── SSE helpers ──────────────────────────────────────────────────────────────

// Reads an SSE body frame-by-frame and hands each `data:` payload to `onFrame`.
// Frames are blank-line separated; `[DONE]` terminates the stream (OpenAI style).
async function readSSE(
  body: ReadableStream<Uint8Array>,
  onFrame: (payload: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        // A single SSE event may carry multiple `data:` lines; concatenate them.
        const dataLines = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        if (!payload || payload === "[DONE]") return;
        onFrame(payload);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

interface RefineOptions {
  onToken: (delta: string) => void;
  signal?: AbortSignal;
}

// Streams an agent critique/refinement of the draft (OpenAI-compatible SSE), the
// same delta shape as the voice client's streamReply.
export async function refineDraft(
  draft: BuilderState,
  messages: ChatMessage[],
  { onToken, signal }: RefineOptions,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/tools/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ draft, messages }),
  });
  if (!res.ok || !res.body) throw new Error(`refineDraft failed: ${res.status}`);

  await readSSE(
    res.body,
    (payload) => {
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json?.choices?.[0]?.delta?.content;
        if (delta) onToken(delta);
      } catch {
        // Ignore keep-alive / non-JSON frames.
      }
    },
    signal,
  );
}

interface StreamRunOptions {
  onEvent: (event: RunEvent) => void;
  signal?: AbortSignal;
}

// Thrown when /events returns 404 — the run isn't actively streaming (finished,
// or never had a live stream). This is TERMINAL: callers must close quietly and
// never retry/re-subscribe, or they spin an infinite 404 loop.
export class StreamNotLiveError extends Error {
  constructor(runId: string) {
    super(`streamRun failed: 404 (run ${runId} is not live)`);
    this.name = "StreamNotLiveError";
  }
}

/** True for a 404 from /events — the run isn't live, so streaming is terminal. */
export function isStreamNotLive(err: unknown): boolean {
  return (
    err instanceof StreamNotLiveError ||
    (err instanceof Error && err.message.includes("404"))
  );
}

// Subscribes to a run's event stream (build runs and tool-launch runs alike) and
// surfaces each parsed event. Non-JSON frames are forwarded as plain text events
// so the console still shows raw output when the engine streams bare lines.
export async function streamRun(
  runId: string,
  { onEvent, signal }: StreamRunOptions,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/runs/${encodeURIComponent(runId)}/events`, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal,
  });
  // A 404 means the run isn't actively streaming — TERMINAL, never retried by
  // callers. Surface it as a typed error so liveness gating stays belt-and-braces.
  if (res.status === 404) throw new StreamNotLiveError(runId);
  if (!res.ok || !res.body) throw new Error(`streamRun failed: ${res.status}`);

  await readSSE(
    res.body,
    (payload) => {
      try {
        onEvent(JSON.parse(payload) as RunEvent);
      } catch {
        onEvent({ type: "output", text: payload });
      }
    },
    signal,
  );
}

// Posts a user turn into a live run and streams the agent's reply back as run
// events — same frame shape as streamRun, so the chat panel reuses one parser.
export async function sendRunMessage(
  runId: string,
  text: string,
  { onEvent, signal }: StreamRunOptions,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/runs/${encodeURIComponent(runId)}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`sendRunMessage failed: ${res.status}`);

  await readSSE(
    res.body,
    (payload) => {
      try {
        onEvent(JSON.parse(payload) as RunEvent);
      } catch {
        onEvent({ type: "output", text: payload });
      }
    },
    signal,
  );
}
