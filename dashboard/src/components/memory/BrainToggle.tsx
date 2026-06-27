import { Database, Network, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Which brain the Memory screen is viewing. */
export type Brain = "obsidian" | "cognee" | "both";

interface BrainToggleProps {
  value: Brain;
  onChange: (brain: Brain) => void;
}

// Each option carries its own accent so the control echoes the brain palette the
// sphere uses (vault violet vs Cognee teal).
const OPTIONS: { id: Brain; label: string; icon: typeof Database; accent: string }[] = [
  { id: "obsidian", label: "Obsidian", icon: Database, accent: "#a78bfa" },
  { id: "cognee", label: "Cognee", icon: Network, accent: "#22d3ee" },
  { id: "both", label: "Both", icon: Columns2, accent: "#9ab4ff" },
];

// BrainToggle — segmented control to pick the active brain (Obsidian vault graph,
// the Cognee knowledge graph, or both side-by-side). Buttons use aria-pressed (the
// same idiom as the screen's soft-edge toggle) so selection is exposed to assistive
// tech and the control is fully keyboard-operable (Tab + Enter/Space). Defaults to
// Obsidian upstream, so the screen is unchanged until the user switches.
export function BrainToggle({ value, onChange }: BrainToggleProps) {
  return (
    <div
      role="group"
      aria-label="Memory brain"
      className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-0.5 backdrop-blur-md"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer",
              active ? "bg-white/[0.1] text-white" : "text-white/55 hover:text-white/80",
            )}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: active ? opt.accent : undefined }} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
