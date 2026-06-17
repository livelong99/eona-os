/**
 * AuroraField — fixed full-viewport background layer.
 *
 * Renders three blurred radial-gradient orbs that drift slowly using the
 * CSS `aurora-drift` keyframe defined in globals.css.  Each orb has a
 * different animation duration + delay so they never sync.
 *
 * prefers-reduced-motion: globals.css sets `.aurora-orb { animation: none }`
 * so the orbs remain as static soft glows — the background still looks
 * intentional rather than blank.
 *
 * No framer-motion dependency — CSS animation is cheaper for a background
 * layer that runs indefinitely.
 */
export function AuroraField() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
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
