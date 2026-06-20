// View-model that fuses static presentation metadata with the live engine state.
// The screen renders IntegrationView[]; cards/modal read derived display fields
// from here so the UI never lies about what the engine actually supports.

import {
  INTEGRATION_META,
  toUiId,
  type IntegrationMeta,
} from "@/lib/integrations";
import type { EngineIntegration } from "@/lib/integrations/engineClient";

/** One tile: static look + live engine state, keyed by UI id. */
export interface IntegrationView extends IntegrationMeta {
  /** Live state from the engine; null when the engine has no entry for this id. */
  engine: EngineIntegration | null;
}

export type DisplayStatus = "connected" | "available" | "error";

export const STATUS_META: Record<DisplayStatus, { label: string; color: string }> = {
  connected: { label: "Connected", color: "#34d399" },
  available: { label: "Not connected", color: "#8a8fa3" },
  error: { label: "Needs attention", color: "#f4694d" },
};

/** Derive the tile's display status from live engine flags. */
export function displayStatus(v: IntegrationView): DisplayStatus {
  const e = v.engine;
  if (!e || !e.configured) return "available";
  // Configured but a running platform that failed to reconcile → attention.
  if (e.kind === "platform" && e.enabled && !e.running) return "error";
  return "connected";
}

/**
 * Merge live engine integrations with the static metadata.
 * Engine entries are matched to a UI tile by their (aliased) id; metadata
 * without a live entry still renders (engine: null → "available"/loading).
 */
export function mergeIntegrations(engine: EngineIntegration[]): IntegrationView[] {
  const byUiId = new Map<string, EngineIntegration>();
  for (const e of engine) byUiId.set(toUiId(e.id), e);
  return INTEGRATION_META.map((meta) => ({
    ...meta,
    engine: byUiId.get(meta.id) ?? null,
  }));
}
