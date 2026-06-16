import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { Tier } from "@/lib/types";
import { TIERS } from "@/lib/nav";

interface TierBadgeProps {
  tier: Tier;
}

/** Shows the active provider tier and flags Tier B ("logged"). */
export function TierBadge({ tier }: TierBadgeProps) {
  const meta = TIERS[tier];
  const logged = meta.logged;
  return (
    <span
      title={
        logged
          ? "Free cloud — prompts may be logged. Not for sensitive data."
          : "Private / non-logging tier."
      }
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        logged
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      }`}
    >
      {logged ? (
        <ShieldAlert className="h-3 w-3" />
      ) : (
        <ShieldCheck className="h-3 w-3" />
      )}
      Tier {tier} · {meta.label}
      {logged && " · logged"}
    </span>
  );
}
