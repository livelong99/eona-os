// Typed Hermes API client. Targets the OpenAI-compatible Hermes API server
// (default 127.0.0.1:8642): GET /health, POST /v1/chat/completions, POST /v1/runs
// + SSE GET /v1/runs/{id}/events. Falls back to clearly-labeled mock data when the
// gateway is unreachable. See docs/architecture.md §4.A and the Hermes docs:
// https://github.com/NousResearch/hermes-agent (gateway/platforms/api_server.py)
//
// NOTE: the Hermes *API server* (8642) exposes health/chat/runs/sessions but NOT
// kanban or a memory graph. Those live in the dashboard backend (9119, auth-gated)
// or the kanban CLI/DB. So getTasks()/getMemory() use mock data until we wire the
// 9119 API; getHealth()/sendMessage()/startRun() are real.
import type { MemoryGraph, Message, Task, TaskEvent } from "./types";
import { MOCK_EVENTS, MOCK_MEMORY, MOCK_TASKS } from "./mock";

// Same-origin proxy (src/app/api/hermes/[...path]/route.ts) forwards to the
// engine and attaches the bearer key server-side — no secret in the browser.
const BASE = "/api/hermes";
const HEALTH_TIMEOUT_MS = 4000;
// A claude_code turn runs the real `claude` CLI (loads its system prompt, runs an
// agent turn) — easily 10–40s. The chat/run calls need a long client timeout or
// the browser aborts mid-turn and falls back to the offline mock.
const CHAT_TIMEOUT_MS = 300_000;

async function tryFetch<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // gateway not up → caller uses mock
  }
}

export interface GatewayHealth {
  live: boolean;
  base: string;
}

export async function getHealth(): Promise<GatewayHealth> {
  const ok = await tryFetch<unknown>("/health");
  return { live: ok !== null, base: BASE };
}

// --- Chat: OpenAI-compatible /v1/chat/completions ----------------------------
interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

export async function sendMessage(
  agentModel: string,
  text: string,
): Promise<{ reply: Message; live: boolean }> {
  const data = await tryFetch<ChatCompletion>("/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: agentModel,
      messages: [{ role: "user", content: text }],
      stream: false,
    }),
  }, CHAT_TIMEOUT_MS);
  const content = data?.choices?.[0]?.message?.content;
  if (content) {
    return {
      reply: { id: `m-${Date.now()}`, role: "agent", text: content, ts: Date.now() },
      live: true,
    };
  }
  const reply: Message = {
    id: `m-${Date.now()}`,
    role: "agent",
    ts: Date.now(),
    text:
      `(offline mock) Hermes API not detected at ${BASE}. ` +
      `Once \`hermes gateway run\` is up, this calls /v1/chat/completions. You said: "${text}"`,
  };
  return { reply, live: false };
}

/**
 * Streaming chat: POST stream:true and parse the SSE `chat.completion.chunk`
 * deltas, calling onDelta(text) per chunk. Returns the full text + live flag.
 */
export async function sendMessageStream(
  agentModel: string,
  text: string,
  onDelta: (chunk: string) => void,
): Promise<{ text: string; live: boolean }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: agentModel,
        stream: true,
        messages: [{ role: "user", content: text }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      clearTimeout(t);
      return { text: "", live: false };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload) as ChatCompletion & {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = obj.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          /* ignore keepalives / partial frames */
        }
      }
    }
    clearTimeout(t);
    return { text: full, live: true };
  } catch {
    return { text: "", live: false };
  }
}

// --- Runs: start an async run and stream its SSE lifecycle events -------------
export async function startRun(
  prompt: string,
): Promise<{ runId: string | null; live: boolean }> {
  const data = await tryFetch<{ run_id?: string; id?: string }>("/v1/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  }, CHAT_TIMEOUT_MS);
  const runId = data?.run_id ?? data?.id ?? null;
  return { runId, live: runId !== null };
}

/** Stream a run's SSE events (GET /v1/runs/{id}/events). Returns unsubscribe. */
export function streamRunEvents(
  runId: string,
  onEvent: (e: TaskEvent) => void,
): () => void {
  const es = new EventSource(`${BASE}/v1/runs/${runId}/events`);
  es.onmessage = (ev) => {
    try {
      const raw = JSON.parse(ev.data) as Partial<TaskEvent> & { type?: string };
      onEvent({
        id: raw.id ?? `e-${Date.now()}`,
        taskId: runId,
        kind: raw.kind ?? raw.type ?? "event",
        message: raw.message ?? ev.data.slice(0, 160),
        ts: raw.ts ?? Date.now(),
      });
    } catch {
      /* ignore non-JSON keepalives */
    }
  };
  return () => es.close();
}

// --- Kanban + Memory: not on the 8642 API server. Mock until 9119 is wired. ---
export async function getTasks(): Promise<{ tasks: Task[]; live: boolean }> {
  // TODO: wire to the dashboard backend (:9119) or kanban DB; no REST on :8642.
  return { tasks: MOCK_TASKS, live: false };
}

export async function getMemory(): Promise<{ graph: MemoryGraph; live: boolean }> {
  // TODO: build from the Obsidian MCP graph / Qdrant; no REST graph on :8642.
  return { graph: MOCK_MEMORY, live: false };
}

/**
 * Kanban activity ticker. No global event stream exists on the 8642 API server
 * (per-run SSE only), so this replays mock events until the :9119 WS (/api/ws)
 * is wired. Returns an unsubscribe fn.
 */
export function subscribeEvents(onEvent: (e: TaskEvent) => void): () => void {
  let i = 0;
  const timer = setInterval(() => {
    onEvent({ ...MOCK_EVENTS[i % MOCK_EVENTS.length], id: `me-${i}`, ts: Date.now() });
    i++;
  }, 4000);
  return () => clearInterval(timer);
}
