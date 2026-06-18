"use client";

// ToolCard — Launchpad tool tile (Wave 3).
//
// Structure reproduced from edwinvakayil/new-card (21st.dev):
//   • Outer glass surface with gradient border highlight
//   • Title row, blurb (line-clamp-2), stage chips, primary CTA
//
// Adaptations:
//   (a) Styling  → dark-glass tokens; outer surface is GlowCard (glow sm→md on hover)
//   (b) Wiring   → ToolCardProps from contracts.ts (id, title, blurb, stages, onLaunch)
//   (c) Motion   → hover handled by GlowCard built-in tier raise; no inline framer-motion
//   (d) A11y     → as="article", aria-label on launch button, focus ring on button

import { GlowCard } from "@/components/ui/GlowCard";
import type { ToolCardProps } from "@/components/ui/contracts";

// ---------------------------------------------------------------------------
// Stage chip — amber for HITL, emerald for automated
// ---------------------------------------------------------------------------

interface StageChipProps {
  label: string;
  hitl?: boolean;
}

function StageChip({ label, hitl }: StageChipProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-[11px] uppercase tracking-wide leading-none font-medium",
        hitl
          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ToolCard
// ---------------------------------------------------------------------------

export function ToolCard({
  id,
  title,
  blurb,
  stages = [],
  onLaunch,
  className = "",
}: ToolCardProps) {
  const visibleStages = stages.slice(0, 4);
  const overflow = stages.length - visibleStages.length;

  function handleLaunch(e: React.MouseEvent) {
    e.stopPropagation();
    onLaunch(id);
  }

  return (
    <GlowCard
      as="article"
      aria-label={title}
      glow="sm"
      className={["flex flex-col gap-3 p-4 h-full", className].filter(Boolean).join(" ")}
    >
      {/* Gradient top-edge accent line */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(124,92,255,0.5) 50%, transparent 100%)",
        }}
      />

      {/* Title */}
      <p className="text-base font-semibold leading-snug"
         style={{ color: "var(--foreground)" }}>
        {title}
      </p>

      {/* Blurb */}
      {blurb && (
        <p
          className="line-clamp-2 text-sm leading-relaxed flex-1"
          style={{ color: "var(--muted)" }}
        >
          {blurb}
        </p>
      )}

      {/* Stage chips */}
      {visibleStages.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleStages.map((s, i) => (
            <StageChip key={i} label={s.label} hitl={s.hitl} />
          ))}
          {overflow > 0 && (
            <span
              className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide leading-none"
              style={{ color: "var(--muted)" }}
            >
              +{overflow} more
            </span>
          )}
        </div>
      )}

      {/* Launch button */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleLaunch}
          aria-label={`Launch ${title}`}
          className={[
            "cursor-pointer rounded-full px-3 py-1",
            "text-[11px] uppercase tracking-wide font-semibold",
            "border transition-colors duration-150",
            "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/40",
            "hover:bg-[var(--accent)]/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          ].join(" ")}
        >
          Launch
        </button>
      </div>
    </GlowCard>
  );
}
