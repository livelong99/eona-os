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
import type {
  MemoryGraph,
  Message,
  RunEvent,
  RunEventKind,
  Task,
  TaskEvent,
} from "./types";
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

// --- Typed RunEvent stream (Glass Cockpit) -----------------------------------
// The engine emits the full RunEvent shape (engine/agent/run_events.py) as
// `data: <json>` SSE frames using snake_case keys. This parser maps them to the
// camelCase TS `RunEvent` and tolerates unknown kinds / extra fields — consumers
// render generically and never crash on an event they don't recognise.

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function strList(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
}

/** Map one wire frame (snake_case) into a typed RunEvent, or null if unusable. */
function toRunEvent(raw: Record<string, unknown>): RunEvent | null {
  const kind = raw.event ?? raw.kind ?? raw.type;
  if (typeof kind !== "string") return null;
  // Normalise unix-seconds → ms so timestamps compose with Date.now().
  const tsRaw = num(raw.timestamp);
  const timestamp =
    tsRaw === undefined ? Date.now() : tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
  const errRaw = raw.error;
  return {
    event: kind as RunEventKind,
    runId: str(raw.run_id) ?? str(raw.runId) ?? "",
    timestamp,
    text: str(raw.text),
    tool: str(raw.tool),
    preview: str(raw.preview),
    duration: num(raw.duration),
    error:
      typeof errRaw === "boolean" || typeof errRaw === "string" ? errRaw : undefined,
    path: str(raw.path),
    patch: str(raw.patch),
    spanId: str(raw.span_id) ?? str(raw.spanId),
    parentToolUseId:
      raw.parent_tool_use_id === null ? null : str(raw.parent_tool_use_id),
    subagentType: str(raw.subagent_type) ?? str(raw.subagentType),
    model: str(raw.model),
    tools: strList(raw.tools),
    mcpServers: strList(raw.mcp_servers) ?? strList(raw.mcpServers),
    choices: strList(raw.choices),
    choice: str(raw.choice),
    output: str(raw.output),
    usage:
      raw.usage && typeof raw.usage === "object"
        ? (raw.usage as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Stream a run's typed RunEvents (GET /v1/runs/{id}/events). Unlike
 * streamRunEvents (which flattens to TaskEvent), this preserves every field so
 * the Glass Cockpit can render reasoning, tools, diffs, terminals, sub-agents
 * and approvals distinctly. Returns an unsubscribe fn.
 */
export function streamRunEventsTyped(
  runId: string,
  onEvent: (e: RunEvent) => void,
): () => void {
  const es = new EventSource(`${BASE}/v1/runs/${runId}/events`);
  es.onmessage = (ev) => {
    try {
      const raw = JSON.parse(ev.data) as Record<string, unknown>;
      const parsed = toRunEvent(raw);
      if (parsed) onEvent({ ...parsed, runId: parsed.runId || runId });
    } catch {
      /* ignore keepalive comments and non-JSON frames */
    }
  };
  return () => es.close();
}

// --- Kanban + Memory: live from the engine's /v1/tasks and /v1/memory --------
// Falls back to mock data when the engine is unreachable so the dashboard
// stays demonstrable offline.

export async function getTasks(): Promise<{ tasks: Task[]; live: boolean }> {
  const data = await tryFetch<{ tasks: Task[] }>("/v1/tasks");
  if (data?.tasks) {
    return { tasks: data.tasks, live: true };
  }
  return { tasks: MOCK_TASKS, live: false };
}

export async function getMemory(): Promise<{ graph: MemoryGraph; live: boolean }> {
  const data = await tryFetch<{ graph: MemoryGraph }>("/v1/memory");
  if (data?.graph) {
    return { graph: data.graph, live: true };
  }
  return { graph: MOCK_MEMORY, live: false };
}

/**
 * Subscribe to the global Kanban event stream (GET /v1/events, SSE).
 * Falls back to the mock ticker when the engine is unreachable so the
 * dashboard degrades gracefully. Returns an unsubscribe fn.
 */
export function subscribeEvents(onEvent: (e: TaskEvent) => void): () => void {
  // Mock-ticker fallback — used when EventSource errors on first connect.
  let mockTimer: ReturnType<typeof setInterval> | null = null;
  let i = 0;
  function startMock() {
    if (mockTimer !== null) return;
    mockTimer = setInterval(() => {
      onEvent({ ...MOCK_EVENTS[i % MOCK_EVENTS.length], id: `me-${i}`, ts: Date.now() });
      i++;
    }, 4000);
  }

  let es: EventSource | null = null;
  try {
    es = new EventSource(`${BASE}/v1/events`);
    es.onmessage = (ev) => {
      try {
        const raw = JSON.parse(ev.data) as Partial<TaskEvent>;
        onEvent({
          id: raw.id ?? `e-${Date.now()}`,
          taskId: raw.taskId ?? "",
          kind: raw.kind ?? "event",
          message: raw.message ?? ev.data.slice(0, 160),
          ts: raw.ts ?? Date.now(),
        });
      } catch {
        /* ignore keepalive comments and non-JSON frames */
      }
    };
    es.onerror = () => {
      // Engine unreachable — close SSE and fall back to mock ticker.
      es?.close();
      es = null;
      startMock();
    };
  } catch {
    // EventSource constructor failed (e.g. SSR context) — use mock.
    startMock();
  }

  return () => {
    es?.close();
    if (mockTimer !== null) clearInterval(mockTimer);
  };
}
