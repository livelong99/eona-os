import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

// ── Toggle ───────────────────────────────────────────────────────────────────
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200 cursor-pointer ${
        checked ? "bg-[#5227FF]" : "bg-white/15"
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────
export function SelectField({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-lg border border-white/12 bg-white/[0.05] py-1.5 pl-3 pr-8 text-[13px] font-medium text-white outline-none transition-colors hover:bg-white/[0.08] focus:border-white/30"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#13141f] text-white">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
    </div>
  );
}

// ── Slider ───────────────────────────────────────────────────────────────────
export function Slider({
  value,
  min,
  max,
  step,
  unit,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  label?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-40 cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
        style={{ background: `linear-gradient(to right, #5227FF ${pct}%, rgba(255,255,255,0.12) ${pct}%)` }}
      />
      <span className="w-12 text-right text-[13px] font-semibold tabular-nums text-white">
        {unit === "$" ? "$" : ""}{value}{unit && unit !== "$" ? unit : ""}
      </span>
    </div>
  );
}

// ── Setting row (label + control) ────────────────────────────────────────────
export function SettingRow({
  label,
  desc,
  control,
}: {
  label: string;
  desc?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-white/90">{label}</p>
        {desc && <p className="mt-0.5 text-[12px] leading-relaxed text-white/45">{desc}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────
export function SectionHeader({
  title,
  blurb,
  action,
}: {
  title: string;
  blurb?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
        {blurb && <p className="mt-0.5 text-[13px] text-white/45">{blurb}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Card shell ───────────────────────────────────────────────────────────────
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 ${className}`}>
      {children}
    </div>
  );
}

export function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/40">{children}</p>
  );
}
