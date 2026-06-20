// Thin client for the Hermes engine's integrations surface, reached through the
// `/api/hermes` proxy (dev: vite.config proxy; prod: nginx). The proxy injects
// the API_SERVER_KEY server-side, so no secret ever touches the browser.
//
//   getIntegrations → GET  /v1/integrations
//   setEnabled      → POST /v1/integrations/{id}/enabled   (platform only)
//
// Mirrors src/lib/voice/engineClient.ts (plain fetch over /api/hermes).

const API_BASE = "/api/hermes";

/** One integration as the engine reports it. Merged with static UI metadata. */
export interface EngineIntegration {
  /** Engine-side id (e.g. "google_chat", "webhook"). UI maps via an alias table. */
  id: string;
  /** "platform" → gateway adapter (enable toggle); "mcp" → config-only. */
  kind: "platform" | "mcp";
  /** Credentials present and the integration is set up. */
  configured: boolean;
  /** Whether the platform is enabled (mcp: mirrors configured). */
  enabled: boolean;
  /** Whether the adapter is currently running/reconciled. */
  running: boolean;
  /** Human-readable account/handle when known. */
  account: string | null;
  /** Env vars this integration needs to be configured. */
  requiredEnv: string[];
  /** Subset of requiredEnv that is currently missing. */
  missingEnv: string[];
}

interface IntegrationsResponse {
  integrations: EngineIntegration[];
}

export async function getIntegrations(signal?: AbortSignal): Promise<EngineIntegration[]> {
  const res = await fetch(`${API_BASE}/v1/integrations`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`integrations failed: ${res.status}`);
  const data = (await res.json()) as IntegrationsResponse;
  return data.integrations ?? [];
}

export async function setEnabled(
  id: string,
  enabled: boolean,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/integrations/${encodeURIComponent(id)}/enabled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
    signal,
  });
  if (!res.ok) throw new Error(`setEnabled failed: ${res.status}`);
}
