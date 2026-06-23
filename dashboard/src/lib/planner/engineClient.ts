// Thin client for the Planner's live data, reached through the `/api/hermes`
// proxy (dev: vite.config proxy; prod: nginx). The proxy injects the
// API_SERVER_KEY server-side, so no secret ever touches the browser.
//
//   getJiraItems → GET /v1/integrations/jira/items
//
// Mirrors src/lib/integrations/engineClient.ts (plain fetch over /api/hermes).

import type { JiraItem, MailItem } from "@/lib/planner";

const API_BASE = "/api/hermes";

export interface JiraItemsResponse {
  items: JiraItem[];
  /** Whether Jira credentials are configured on the engine. */
  configured: boolean;
  error?: string;
}

export async function getJiraItems(signal?: AbortSignal): Promise<JiraItemsResponse> {
  const res = await fetch(`${API_BASE}/v1/integrations/jira/items`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`jira items failed: ${res.status}`);
  return (await res.json()) as JiraItemsResponse;
}

export interface GmailMessagesResponse {
  messages: MailItem[];
  /** Whether Google OAuth (Gmail) is set up on the engine. */
  configured: boolean;
  error?: string;
}

export async function getGmailMessages(signal?: AbortSignal): Promise<GmailMessagesResponse> {
  const res = await fetch(`${API_BASE}/v1/integrations/gmail/messages`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`gmail messages failed: ${res.status}`);
  return (await res.json()) as GmailMessagesResponse;
}
