"use client";

// Shared client-side bridge between the Launchpad and the Workbench.
//
// Navigation (the `view` state) lives in app/page.tsx; the Launchpad needs to
// (a) remember which tool the user launched and (b) switch to the Workbench
// view. This tiny external store carries the active tool id and a navigate
// callback that page.tsx registers, so views stay decoupled from the shell.

import { useSyncExternalStore } from "react";
import type { ViewId } from "./nav";

let activeToolId: string | null = null;
let navigateFn: ((v: ViewId) => void) | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

/** page.tsx registers its setView here on mount. */
export function registerNavigate(fn: (v: ViewId) => void): void {
  navigateFn = fn;
}

/** Request a view change from anywhere (no-op if the shell hasn't registered). */
export function navigate(v: ViewId): void {
  navigateFn?.(v);
}

export function setActiveTool(id: string | null): void {
  activeToolId = id;
  emit();
}

export function getActiveTool(): string | null {
  return activeToolId;
}

/** Subscribe to the active-tool id (Workbench reads this). */
export function useActiveTool(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => activeToolId,
    () => activeToolId,
  );
}

/** Launchpad "Launch": select the tool and switch to the Workbench. */
export function openToolInWorkbench(toolId: string): void {
  setActiveTool(toolId);
  navigate("workbench");
}
