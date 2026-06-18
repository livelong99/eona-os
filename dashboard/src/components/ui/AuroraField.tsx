/**
 * AuroraField — fixed full-viewport background layer.
 *
 * Wave 2 updates:
 * - The outer wrapper now carries `translateZ(var(--z-field))` so it truly sits
 *   on the Field depth plane (−120px) when a SpatialStage is in the ancestor
 *   chain with `perspective` set.
 * - `transform-style: preserve-3d` propagates depth to children correctly.
 * - Orbs retain their CSS `aurora-drift` animation (cheaper than framer-motion
 *   for an infinite background loop).
 * - prefers-reduced-motion: globals.css `.aurora-orb { animation: none }` leaves
 *   orbs as static soft glows — intentional, not blank.
 *
 * No framer-motion dependency — CSS animation is cheaper for a background
 * layer that runs indefinitely.
 */
export function AuroraField() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      style={{
        // Sit on the Field plane when inside a SpatialStage perspective context.
        transform: "translateZ(var(--z-field))",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Orb 1 — violet, top-left anchor */}
      <div
        className="aurora-orb absolute"
        style={{
          width: "60vw",
          height: "60vw",
          top: "-20%",
          left: "-10%",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, rgba(124,92,255,0.22) 0%, transparent 70%)",
          filter: "blur(72px)",
          animation: "aurora-drift 34s ease-in-out infinite",
        }}
      />
      {/* Orb 2 — teal, bottom-right anchor */}
      <div
        className="aurora-orb absolute"
        style={{
          width: "50vw",
          height: "50vw",
          bottom: "-15%",
          right: "-8%",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, rgba(0,212,170,0.14) 0%, transparent 70%)",
          filter: "blur(80px)",
          animation: "aurora-drift 44s ease-in-out infinite reverse",
          animationDelay: "-14s",
        }}
      />
      {/* Orb 3 — indigo, centre-right */}
      <div
        className="aurora-orb absolute"
        style={{
          width: "40vw",
          height: "40vw",
          top: "30%",
          right: "15%",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, rgba(79,70,229,0.16) 0%, transparent 70%)",
          filter: "blur(64px)",
          animation: "aurora-drift 52s ease-in-out infinite",
          animationDelay: "-28s",
        }}
      />
    </div>
  );
}
