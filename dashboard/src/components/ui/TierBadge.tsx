import { Crown } from "lucide-react";
import type { Tier } from "@/lib/types";
import { TIERS } from "@/lib/nav";

interface TierBadgeProps {
  tier: Tier;
}

const STYLE: Record<Tier, { cls: string; Icon: typeof Crown }> = {
  primary: { cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", Icon: Crown },
};

/** Shows the provider's role. Claude is the only runtime, so this is always Primary. */
export function TierBadge({ tier }: TierBadgeProps) {
  const { cls, Icon } = STYLE[tier];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {TIERS[tier].label}
    </span>
  );
}
