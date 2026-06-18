"use client";

// Agent-Tools Launchpad — U4 implementation (Wave 3).
//
// Grid of ToolCard tiles, one per tool manifest. Data from lib/tools.ts;
// falls back to SAMPLE_TOOLS when the engine is unreachable (demoable offline).
// "Launch" wires to openToolInWorkbench(id) via lib/workbench.ts.
//
// BACKEND FLAG #1: needs GET /v1/tools (see lib/tools.ts).

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Rocket } from "lucide-react";
import { ToolCard } from "@/components/ui/ToolCard";
import { CascadeHeading } from "@/components/ui/CascadeHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { LAYER_VARIANTS, LAYER_ITEM } from "@/lib/aurora";
import { getTools } from "@/lib/tools";
import { openToolInWorkbench } from "@/lib/workbench";
import type { ToolManifest } from "@/lib/tools";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TileSkeleton() {
  return (
    <div
      className="animate-pulse p-4 h-44"
      style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
      }}
    >
      <div className="h-4 w-2/3 rounded bg-white/5 mb-3" />
      <div className="h-3 w-full rounded bg-white/5 mb-1.5" />
      <div className="h-3 w-4/5 rounded bg-white/5 mb-4" />
      <div className="flex gap-1.5">
        <div className="h-5 w-20 rounded-full bg-white/5" />
        <div className="h-5 w-16 rounded-full bg-white/5" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map a ToolManifest to the ToolCardProps stage shape
// ---------------------------------------------------------------------------

function manifestToStages(
  tool: ToolManifest,
): { label: string; hitl?: boolean }[] {
  return tool.steps.map((s) => ({ label: s.title, hitl: s.hitl }));
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function LaunchpadView() {
  const [tools, setTools] = useState<ToolManifest[]>([]);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getTools().then(({ tools: t, live: l }) => {
      if (cancelled) return;
      setTools(t);
      setLive(l);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col h-full px-8 py-7 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <CascadeHeading
          text="Launchpad"
          subtitle="Pick a tool to open the Workbench"
          level={1}
        />
        {!live && !loading && (
          <span
            className={[
              "self-start mt-1 rounded-full border px-2.5 py-0.5",
              "text-[11px] uppercase tracking-wide font-medium",
              "bg-sky-500/15 text-sky-300 border-sky-500/30",
            ].join(" ")}
          >
            Demo data
          </span>
        )}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && tools.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<Rocket />}
            title="No tools available"
            hint="Start the engine to load tools from GET /v1/tools."
            className="max-w-sm"
          />
        </div>
      )}

      {/* Tool grid */}
      {!loading && tools.length > 0 && (
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
          variants={LAYER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {tools.map((tool) => (
            <motion.div key={tool.id} variants={LAYER_ITEM} className="h-full">
              <ToolCard
                id={tool.id}
                title={tool.title}
                blurb={tool.description}
                stages={manifestToStages(tool)}
                onLaunch={openToolInWorkbench}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
