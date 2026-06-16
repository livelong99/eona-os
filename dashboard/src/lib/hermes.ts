// Typed Hermes gateway client (REST + task_events WS) with graceful offline
// mock fallback. See docs/architecture.md §4.A/D.
import type { MemoryGraph, Message, Task, TaskEvent } from "./types";
import { MOCK_EVENTS, MOCK_MEMORY, MOCK_TASKS } from "./mock";

const BASE =
  process.env.NEXT_PUBLIC_HERMES_URL ?? "http://127.0.0.1:8642";
const WS =
  process.env.NEXT_PUBLIC_HERMES_WS ?? "ws://127.0.0.1:8642/task_events";

const TIMEOUT_MS = 1500;

async function tryFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
  const ok = await tryFetch<unknown>("/");
  return { live: ok !== null, base: BASE };
}

export async function getTasks(): Promise<{ tasks: Task[]; live: boolean }> {
  const data = await tryFetch<{ tasks: Task[] }>("/api/kanban/tasks");
  if (data?.tasks) return { tasks: data.tasks, live: true };
  return { tasks: MOCK_TASKS, live: false };
}

export async function getMemory(): Promise<{ graph: MemoryGraph; live: boolean }> {
  const data = await tryFetch<MemoryGraph>("/api/memory/graph");
  if (data?.nodes) return { graph: data, live: true };
  return { graph: MOCK_MEMORY, live: false };
}

export async function sendMessage(
  agentId: string,
  text: string,
): Promise<{ reply: Message; live: boolean }> {
  const data = await tryFetch<{ reply: Message }>(`/api/agents/${agentId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (data?.reply) return { reply: data.reply, live: true };
  // Mock reply — clearly labeled so it's never mistaken for a real model.
  const reply: Message = {
    id: `m-${Date.now()}`,
    role: "agent",
    ts: Date.now(),
    text:
      `(offline mock) Hermes gateway not detected at ${BASE}. ` +
      `Once it's running, "${agentId}" will answer here. You said: "${text}"`,
  };
  return { reply, live: false };
}

/**
 * Subscribe to task_events. Returns an unsubscribe fn. Falls back to a
 * replay of mock events when the WS can't connect.
 */
export function subscribeEvents(onEvent: (e: TaskEvent) => void): () => void {
  let socket: WebSocket | null = null;
  let mockTimer: ReturnType<typeof setInterval> | null = null;

  try {
    socket = new WebSocket(WS);
    socket.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as TaskEvent);
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onerror = () => startMock();
  } catch {
    startMock();
  }

  function startMock() {
    if (mockTimer) return;
    let i = 0;
    mockTimer = setInterval(() => {
      onEvent({ ...MOCK_EVENTS[i % MOCK_EVENTS.length], id: `me-${i}`, ts: Date.now() });
      i++;
    }, 4000);
  }

  return () => {
    socket?.close();
    if (mockTimer) clearInterval(mockTimer);
  };
}
