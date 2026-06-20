import type { ReactNode } from "react";

// Shared form primitives for the tool builder — labeled inputs styled for the
// dark-glass surface.

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-white/55"
      >
        {label}
        {hint && <span className="text-[11px] text-white/30">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const base =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.07]";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={base} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${base} resize-none leading-relaxed`} />;
}

export function StageHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-[17px] font-semibold tracking-tight text-white">{title}</h3>
      <p className="mt-0.5 text-[13px] text-white/45">{blurb}</p>
    </div>
  );
}
