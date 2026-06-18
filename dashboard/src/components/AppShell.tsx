"use client";

// AppShell — root wrapper rendered by layout.tsx (Wave 3).
//
// layout.tsx is a Server Component so it cannot directly render client-only
// primitives. This thin client wrapper mounts the background + grain layers.
//
// Structure (back → front):
//   AppBackground  fixed z-0   — dark canvas: rings, aurora orbs, grain SVG
//   children       z-base      — the app layout (Dock + main content)
//   Grain          fixed z-10  — additional OLED grain overlay
//
// AuroraField is retired from the shell in Wave 3 (AppBackground takes over)
// but AuroraField.tsx is kept on disk for any direct consumers.
//
// The outer div retains `perspective` + `transform-style: preserve-3d` for
// any Wave 2 spatial consumers still in the tree.

import type { ReactNode } from "react";
import { AppBackground } from "@/components/ui/AppBackground";
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
      {/* Fixed canvas — dark-glass backdrop (pixel-perfect-hero pattern) */}
      <AppBackground />

      {/* App layout — Dock + main content on the base plane */}
      {children}

      {/* Grain overlay — OLED tactile film grain, sits atop content */}
      <Grain />
    </div>
  );
}
