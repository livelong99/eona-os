/**
 * Grain — SVG feTurbulence film grain overlay.
 *
 * Renders a single SVG filter as a fixed full-viewport overlay.
 * Opacity is driven by --grain-opacity (default 0.035) — subtle enough
 * not to be distracting but adds tactile OLED depth.
 *
 * Static: no animation, no framer-motion, no JS after mount.
 */
export function Grain() {
  return (
    <svg
      aria-hidden="true"
      className="fixed inset-0 z-10 pointer-events-none w-full h-full"
      style={{ opacity: "var(--grain-opacity)" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter id="grain-filter">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.65"
          numOctaves="3"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-filter)" />
    </svg>
  );
}
