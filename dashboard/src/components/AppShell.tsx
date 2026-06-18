"use client";

// AppShell — spatial root wrapper rendered by layout.tsx.
//
// layout.tsx is a Server Component so it cannot directly render client-only
// primitives (AuroraField, Grain). This thin client wrapper mounts the two
// background layers and provides the CSS perspective context so every child
// component's translateZ reads as real depth (§1, §2 of DESIGN-spatial.md).
//
// Structure (back → front):
//   AuroraField  z-field (–120px) — drifting aurora orbs, CSS animation
//   children     z-base  (0)      — the app layout (Sidebar + main)
//   Grain        z-10 fixed       — film grain overlay
//
// The outer div sets `perspective` + `transform-style: preserve-3d` so the
// 3D coordinate space is rooted here, not on individual views.

import type { ReactNode } from "react";
import { AuroraField } from "@/components/ui/AuroraField";
import { Grain } from "@/components/ui/Grain";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div
      className="relative min-h-full overflow-hidden"
      style={{
        perspective: "var(--perspective)",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Field plane — aurora background, sits behind everything */}
      <AuroraField />

      {/* App layout — Sidebar + main content on the base plane */}
      {children}

      {/* Grain overlay — OLED tactile film grain, sits atop content */}
      <Grain />
    </div>
  );
}
