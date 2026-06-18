"use client";

// Agent-Tools Launchpad — W5 implementation.
// Grid of TiltCard tiles, one per tool manifest. Data from lib/tools.ts;
// falls back to SAMPLE_TOOLS when the engine is unreachable (demoable offline).
//
// BACKEND FLAG #1: needs GET /v1/tools (see lib/tools.ts).

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Rocket } from "lucide-react";
import { TiltCard } from "@/components/ui/TiltCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LAYER_VARIANTS, LAYER_ITEM } from "@/lib/aurora";
import { getTools } from "@/lib/tools";
import type { ToolManifest, ToolStage } from "@/lib/tools";

// ---------------------------------------------------------------------------
// Stage chip
// ---------------------------------------------------------------------------

function StageChip({ stage }: { stage: ToolStage }) {
  const isHitl = stage.hitl;
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-[11px] uppercase tracking-wide leading-none font-medium",
        isHitl
          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      ].join(" ")}
    >
      {stage.title}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tool tile
// ---------------------------------------------------------------------------

function ToolTile({ tool }: { tool: ToolManifest }) {
  const visibleSteps = tool.steps.slice(0, 4);
  const overflow = tool.steps.length - visibleSteps.length;

  function handleLaunch(e: React.MouseEvent) {
    e.stopPropagation();
    // TODO(workbench): navigate to the tool's workbench surface.
    // For now surface a console log; a real route lands in a future wave.
    console.log("launch", tool.id);
  }

  return (
    <TiltCard
      aria-label={`Launch ${tool.title}`}
      onClick={() => console.log("tile click", tool.id)}
      className="flex flex-col gap-3 p-4 h-full"
    >
      {/* Name */}
      <p className="text-base font-semibold leading-snug text-foreground">
        {tool.title}
      </p>

      {/* Blurb */}
      {tool.description && (
        <p className="line-clamp-2 text-sm leading-relaxed text-muted flex-1">
          {tool.description}
        </p>
      )}

      {/* Stage chips */}
      <div className="flex flex-wrap gap-1.5">
        {visibleSteps.map((s) => (
          <StageChip key={s.id} stage={s} />
        ))}
        {overflow > 0 && (
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide leading-none text-muted">
            +{overflow} more
          </span>
        )}
      </div>

      {/* Launch button */}
      <div className="flex justify-end pt-1">
        <button
          onClick={handleLaunch}
          className={[
            "rounded-full px-3 py-1 text-[11px] uppercase tracking-wide font-semibold",
            "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40",
            "hover:bg-[var(--accent)]/30 transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          ].join(" ")}
          aria-label={`Launch ${tool.title}`}
        >
          Launch
        </button>
      </div>
    </TiltCard>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TileSkeleton() {
  return (
    <div
      style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
      }}
      className="animate-pulse p-4 h-44"
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
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col h-full px-8 py-7 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold leading-tight text-foreground">
          Launchpad
        </h1>
        {!live && !loading && (
          <span
            className={[
              "rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wide font-medium",
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
            <motion.div key={tool.id} variants={LAYER_ITEM}>
              <ToolTile tool={tool} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
