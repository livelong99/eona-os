import type { StatProps } from "./contracts";

// ---------------------------------------------------------------------------
// Stat — compact metric chip: label (muted micro-text) above value (§7).
//
// Tone maps to semantic colors matching the Wave 2 color vocabulary (§8):
//   default  → foreground
//   accent   → violet (--accent)
//   emerald  → live/success
//   amber    → running/warn
//   rose     → error
//   sky      → info
// ---------------------------------------------------------------------------

const TONE_VALUE_CLASS: Record<NonNullable<StatProps["tone"]>, string> = {
  default: "text-foreground",
  accent: "text-[var(--accent)]",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  rose: "text-rose-400",
  sky: "text-sky-400",
};

export function Stat({ label, value, tone = "default", className = "" }: StatProps) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--glass-edge)",
      }}
      className={[
        "flex flex-col gap-0.5 px-3 py-2.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Label — muted, micro, uppercase tracking */}
      <span className="text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted leading-none">
        {label}
      </span>

      {/* Value — title weight, semibold */}
      <span
        className={[
          "text-lg font-semibold leading-tight tabular-nums",
          TONE_VALUE_CLASS[tone],
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
