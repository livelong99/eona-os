interface LivePillProps {
  live: boolean;
}

/** Gateway connection indicator. Offline → data is mock. */
export function LivePill({ live }: LivePillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        live
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-border bg-surface-2 text-muted"
      }`}
    >
      <span
        className={`live-dot h-1.5 w-1.5 rounded-full ${
          live ? "bg-emerald-400" : "bg-muted"
        }`}
      />
      {live ? "Gateway live" : "Offline · mock"}
    </span>
  );
}
