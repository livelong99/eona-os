// ReadinessCard — renders readiness.json: a per-metric gauge of how dev-ready the
// product is. The loop continues while any metric sits below its threshold; once
// every metric clears and dev_ready flips true, the PRD/promote affordance opens.

import { Gauge, CheckCircle2, CircleDashed } from "lucide-react";
import type { ReadinessDoc, ReadinessMetric } from "@/lib/brainstorm/brainstormClient";

interface ReadinessCardProps {
  readiness: ReadinessDoc | null;
}

function pct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

function metricColor(m: ReadinessMetric): string {
  return m.score >= m.threshold ? "#34d399" : m.score >= m.threshold * 0.6 ? "#f4c14d" : "#f87171";
}

export function ReadinessCard({ readiness }: ReadinessCardProps) {
  if (!readiness) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-6">
        <p className="text-center text-[12.5px] text-white/40">
          The readiness scorecard appears once the swarm's first probe completes.
        </p>
      </div>
    );
  }

  const overall = pct(readiness.overall ?? avg(readiness.metrics));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-2.5">
        <Gauge className="h-4 w-4 text-[#7c9cff]" />
        <span className="text-[12.5px] text-white/65">Readiness</span>
        {readiness.dev_ready ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#34d399]/12 px-2.5 py-0.5 text-[11px] font-medium text-[#34d399]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            dev-ready
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-white/45">
            <CircleDashed className="h-3.5 w-3.5" />
            refining
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {/* overall */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wide text-white/40">
              Overall
            </span>
            <span className="text-[20px] font-semibold text-white/90">{overall}%</span>
          </div>
          <Bar value={overall} color={readiness.dev_ready ? "#34d399" : "#7c9cff"} />
        </div>

        {/* per-metric */}
        {readiness.metrics.map((m) => (
          <div
            key={m.key}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-white/85">{m.label}</span>
              <span className="text-[12px] text-white/55">
                {pct(m.score)}%
                <span className="ml-1 text-white/30">/ {pct(m.threshold)}%</span>
              </span>
            </div>
            <Bar value={pct(m.score)} color={metricColor(m)} threshold={pct(m.threshold)} />
            {m.notes && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-white/45">{m.notes}</p>
            )}
          </div>
        ))}

        {readiness.blocking && readiness.blocking.length > 0 && (
          <p className="px-1 text-[11.5px] text-white/40">
            Still blocking: <span className="text-white/60">{readiness.blocking.join(", ")}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function Bar({
  value,
  color,
  threshold,
}: {
  value: number;
  color: string;
  threshold?: number;
}) {
  return (
    <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${value}%`, background: color }}
      />
      {typeof threshold === "number" && (
        <span
          aria-hidden
          className="absolute top-[-2px] h-[10px] w-px bg-white/40"
          style={{ left: `${threshold}%` }}
        />
      )}
    </div>
  );
}

function avg(metrics: ReadinessMetric[]): number {
  if (!metrics.length) return 0;
  return metrics.reduce((s, m) => s + m.score, 0) / metrics.length;
}
