import { ShieldCheck } from "lucide-react";
import type { Tier } from "@/lib/types";
import { TIERS } from "@/lib/nav";

interface TierBadgeProps {
  tier: Tier;
}

/** Shows the active provider tier (Local / Gemini / Claude Code). */
export function TierBadge({ tier }: TierBadgeProps) {
  const meta = TIERS[tier];
  return (
    <span
      title="Private / non-logging provider."
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
    >
      <ShieldCheck className="h-3 w-3" />
      Tier {tier} · {meta.label}
    </span>
  );
}
