import type { ReactNode } from "react";

interface GlassCircleProps {
  children: ReactNode;
  /** Ring thickness around the content, in px. */
  padding?: number;
  className?: string;
}

// GlassCircle — a circular frosted-glass enclosure (glass "bubble"): backdrop
// blur, faint fill, edge border, inner top-highlight + bottom shade, and a soft
// drop shadow. Subtle so enclosed content (e.g. the Aurora Orb) stays vivid.
export function GlassCircle({ children, padding = 28, className = "" }: GlassCircleProps) {
  return (
    <div
      className={`relative grid place-items-center rounded-full ${className}`}
      style={{
        padding,
        background: "rgba(255, 255, 255, 0.045)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        boxShadow:
          "inset 0 2px 2px rgba(255,255,255,0.22), inset 0 -16px 40px rgba(0,0,0,0.28), 0 12px 60px rgba(0,0,0,0.35)",
      }}
    >
      {/* top-light sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.10), transparent 55%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
