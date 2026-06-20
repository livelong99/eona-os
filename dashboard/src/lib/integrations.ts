// Presentation metadata for the Integrations screen — the channels & services
// the Hermes agent can connect to. Brand logos load from the Simple Icons CDN
// by slug. Live status/account/enable come from the engine; this file owns only
// the static look of each tile (name, slug, color, category, copy, setup tier).
//
// Live data: src/lib/integrations/engineClient.ts (EngineIntegration).

export type IntegrationCategory = "Messaging" | "Email & Calendar" | "Productivity" | "Automation";

/** How hard a given integration is to bring online. */
export type SetupTier = "easy" | "medium" | "hard";

/** Static presentation metadata — merged with the live EngineIntegration by id. */
export interface IntegrationMeta {
  id: string;
  name: string;
  /** Simple Icons slug for the brand logo (https://cdn.simpleicons.org/<slug>). */
  slug?: string;
  /** Fallback lucide icon key when there's no single brand. */
  lucide?: "webhook";
  /** Logo render color override (hex, no #). Use for dark-on-dark logos. */
  logoColor?: string;
  color: string; // brand accent for glow/dot
  category: IntegrationCategory;
  desc: string;
  /** Setup difficulty: "hard" ones surface a docs link instead of an enable hint. */
  setup: SetupTier;
  /** Docs URL — shown for integrations that need a bridge/manual/OAuth setup. */
  docs?: string;
  /** Short, accurate setup instruction for integrations whose credential isn't a
   *  single env var (QR pairing, OAuth MCP, etc.) — shown on the card. */
  setupHint?: string;
}

export const CATEGORIES: IntegrationCategory[] = ["Messaging", "Email & Calendar", "Productivity", "Automation"];

// Static metadata, keyed by UI id. Live state is merged in at render time.
export const INTEGRATION_META: IntegrationMeta[] = [
  // Messaging
  { id: "whatsapp", name: "WhatsApp", slug: "whatsapp", color: "#25D366", category: "Messaging", desc: "Chat with the agent and triage messages over WhatsApp.", setup: "medium", docs: "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp", setupHint: "Run `hermes whatsapp` and scan the QR with your phone, then enable. (Baileys bridge — no token.)" },
  { id: "telegram", name: "Telegram", slug: "telegram", color: "#26A5E4", category: "Messaging", desc: "Bot interface for commands, captures, and replies.", setup: "easy" },
  { id: "discord", name: "Discord", slug: "discord", color: "#5865F2", category: "Messaging", desc: "Run the agent in a server or DM; mention to act.", setup: "easy" },
  { id: "slack", name: "Slack", slug: "slack", color: "#611f69", category: "Messaging", desc: "Workspace assistant — summaries, threads, actions.", setup: "easy" },
  { id: "signal", name: "Signal", slug: "signal", color: "#3A76F0", category: "Messaging", desc: "Private, encrypted channel to the agent.", setup: "hard", docs: "https://docs.hermes.local/integrations/signal" },
  { id: "teams", name: "Microsoft Teams", slug: "microsoftteams", color: "#6264A7", category: "Messaging", desc: "Enterprise chat + meeting summaries.", setup: "hard", docs: "https://docs.hermes.local/integrations/teams" },
  { id: "googlechat", name: "Google Chat", slug: "googlechat", color: "#34A853", category: "Messaging", desc: "Spaces & DMs with the agent.", setup: "hard", docs: "https://docs.hermes.local/integrations/google-chat" },
  { id: "matrix", name: "Matrix", slug: "matrix", logoColor: "ffffff", color: "#cfd3dc", category: "Messaging", desc: "Federated, self-hostable messaging.", setup: "medium" },

  // Email & Calendar
  { id: "gmail", name: "Gmail", slug: "gmail", color: "#EA4335", category: "Email & Calendar", desc: "Read, triage, and draft replies; surface what matters.", setup: "medium", docs: "https://hermes-agent.nousresearch.com/docs/user-guide/", setupHint: "Add a Gmail MCP server in ~/.hermes — Google OAuth, `gmail.readonly` scope (reuse your Google Cloud OAuth client)." },
  { id: "outlook", name: "Outlook", slug: "maildotru", logoColor: "0F6CBD", color: "#0F6CBD", category: "Email & Calendar", desc: "Microsoft mail + calendar management.", setup: "medium" },
  { id: "gcal", name: "Google Calendar", slug: "googlecalendar", color: "#4285F4", category: "Email & Calendar", desc: "Schedule events, find time, send invites.", setup: "easy" },

  // Productivity
  { id: "notion", name: "Notion", slug: "notion", logoColor: "ffffff", color: "#cfd3dc", category: "Productivity", desc: "Read & write pages, databases, and tasks.", setup: "easy" },
  { id: "github", name: "GitHub", slug: "github", logoColor: "ffffff", color: "#cfd3dc", category: "Productivity", desc: "Issues, PRs, and repo actions for the agent.", setup: "easy" },
  { id: "linear", name: "Linear", slug: "linear", color: "#5E6AD2", category: "Productivity", desc: "Create & update issues from conversations.", setup: "easy" },

  // Automation
  { id: "webhooks", name: "Webhooks", lucide: "webhook", color: "#a78bfa", category: "Automation", desc: "POST events to any URL; trigger runs from outside.", setup: "easy" },
  { id: "zapier", name: "Zapier", slug: "zapier", color: "#FF4F00", category: "Automation", desc: "Connect 7,000+ apps via Zaps.", setup: "easy" },
];

// UI id → engine id, only where they differ. Lets the screen merge static
// metadata with the live EngineIntegration by a canonical key in both directions.
const UI_TO_ENGINE_ID: Record<string, string> = {
  googlechat: "google_chat",
  webhooks: "webhook",
  gcal: "googlecalendar",
};

const ENGINE_TO_UI_ID: Record<string, string> = Object.fromEntries(
  Object.entries(UI_TO_ENGINE_ID).map(([ui, engine]) => [engine, ui]),
);

/** Translate a UI id to the engine's id (identity when no alias exists). */
export function toEngineId(uiId: string): string {
  return UI_TO_ENGINE_ID[uiId] ?? uiId;
}

/** Translate an engine id back to the UI id (identity when no alias exists). */
export function toUiId(engineId: string): string {
  return ENGINE_TO_UI_ID[engineId] ?? engineId;
}

export function logoUrl(i: Pick<IntegrationMeta, "slug" | "logoColor">): string | null {
  if (!i.slug) return null;
  return `https://cdn.simpleicons.org/${i.slug}${i.logoColor ? `/${i.logoColor}` : ""}`;
}

// Per-integration permission toggles shown in the manage panel. Display-only in
// v1 — the engine has no permission-persistence API yet ("coming soon").
export interface ChannelPermission {
  id: string;
  label: string;
  desc: string;
  value: boolean;
}

export function defaultPermissions(category: IntegrationCategory): ChannelPermission[] {
  const base: ChannelPermission[] = [
    { id: "read", label: "Read", desc: "Let the agent read incoming content", value: true },
    { id: "act", label: "Send & reply", desc: "Allow the agent to send messages or take actions", value: true },
    { id: "notify", label: "Proactive notifications", desc: "Agent can message you first", value: false },
  ];
  if (category === "Messaging") {
    base.push({ id: "mentions", label: "Act on @mentions only", desc: "Ignore unless explicitly addressed", value: true });
  }
  if (category === "Email & Calendar") {
    base.push({ id: "autodraft", label: "Auto-draft replies", desc: "Prepare drafts for your review", value: true });
  }
  return base;
}
