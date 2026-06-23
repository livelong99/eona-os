// Thin client for the Hermes engine's Control surface, reached through the
// `/api/hermes` proxy (dev: vite.config proxy; prod: nginx). The proxy injects
// the API_SERVER_KEY server-side, so no secret ever touches the browser.
//
//   getUsage        → GET  /v1/usage           (Overview: real aggregated usage)
//   getModelConfig  → GET  /v1/model-config     (Models: catalog + persisted state)
//   putModelConfig  → PUT  /v1/model-config     (persist roster / routing)
//
// Mirrors src/lib/integrations/engineClient.ts (plain fetch over /api/hermes).

import type {
  UsageStat,
  ModelUsage,
  SystemService,
  ModelInfo,
} from "@/lib/control";

const API_BASE = "/api/hermes";

/** Overview payload — shapes map 1:1 onto the control.ts mock types. */
export interface UsageView {
  stats: UsageStat[];
  spendSeries: number[];
  modelUsage: ModelUsage[];
  services: SystemService[];
  error?: string;
}

/** A routing tier descriptor as the engine reports it (mirrors control.ts ROUTING). */
export interface RoutingTierMeta {
  id: "t1" | "t2" | "t3";
  tier: string;
  desc: string;
  default: string; // catalog model id pre-selected when nothing is saved
}

/** Model-config payload: static catalog + persisted roster/routing overlays. */
export interface ModelConfigView {
  models: ModelInfo[];
  tiers: RoutingTierMeta[];
  roster: Record<string, boolean>;
  routing: Record<string, string>;
  error?: string;
}

/** Patch body for PUT /v1/model-config — either field is optional. */
export interface ModelConfigPatch {
  roster?: Record<string, boolean>;
  routing?: Record<string, string>;
}

export async function getUsage(signal?: AbortSignal): Promise<UsageView> {
  const res = await fetch(`${API_BASE}/v1/usage`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`usage failed: ${res.status}`);
  return (await res.json()) as UsageView;
}

export async function getModelConfig(signal?: AbortSignal): Promise<ModelConfigView> {
  const res = await fetch(`${API_BASE}/v1/model-config`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`model-config failed: ${res.status}`);
  return (await res.json()) as ModelConfigView;
}

export async function putModelConfig(
  patch: ModelConfigPatch,
  signal?: AbortSignal,
): Promise<ModelConfigView> {
  const res = await fetch(`${API_BASE}/v1/model-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    signal,
  });
  if (!res.ok) throw new Error(`putModelConfig failed: ${res.status}`);
  return (await res.json()) as ModelConfigView;
}
