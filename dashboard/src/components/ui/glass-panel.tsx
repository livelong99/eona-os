import type { ReactNode } from "react";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
}

// GlassPanel — a large rectangular frosted-glass surface: the base enclosure for
// a full screen of content (e.g. the Code workspace screen). Deep backdrop blur,
// faint fill, edge border, top sheen, an accent corner glow, and a broad drop
// shadow. Content is layered above the decorative glows (relative z-10).
export function GlassPanel({ children, className = "" }: GlassPanelProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] ${className}`}
      style={{
        background: "rgba(255, 255, 255, 0.045)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow:
          "inset 0 2px 2px rgba(255,255,255,0.18), inset 0 -42px 90px rgba(0,0,0,0.32), 0 30px 120px rgba(0,0,0,0.55)",
      }}
    >
      {/* top sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-44"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 0%, rgba(255,255,255,0.10), transparent 60%)",
        }}
      />
      {/* accent corner glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 -top-28 z-0 h-80 w-80 rounded-full blur-[110px]"
        style={{ background: "rgba(82,39,255,0.20)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 z-0 h-80 w-80 rounded-full blur-[120px]"
        style={{ background: "rgba(79,140,255,0.14)" }}
      />

      <div className="relative z-10 flex h-full min-h-0 flex-col">{children}</div>
    </div>
  );
}
