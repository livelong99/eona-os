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

/** One workflow step in a tool's manifest. */
export interface ToolStep {
  id: string;
  title: string;
  detail?: string;
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

/** A run event streamed over /v1/runs/{id}/events. Shape is intentionally loose. */
export interface RunEvent {
  /** Event kind, e.g. "progress" | "output" | "status" | "error" | "done". */
  type?: string;
  /** Free-text payload (a chunk of agent output or a progress line). */
  text?: string;
  /** Structured status when present. */
  status?: string;
  /** Step the event belongs to, when the engine tags it. */
  step?: string;
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
}

export async function runTool(
  id: string,
  inputs: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<RunResult> {
  const res = await fetch(`${API_BASE}/v1/tools/${encodeURIComponent(id)}/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
    signal,
  });
  if (!res.ok) throw new Error(`runTool failed: ${res.status}`);
  return (await res.json()) as RunResult;
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
