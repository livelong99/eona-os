"use client";

import React from "react";

// Types
export interface GlassEffectProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  href?: string;
  target?: string;
  /** Grow slightly on hover (default true). Disable for input surfaces. */
  hoverScale?: boolean;
}

export interface DockIcon {
  /** Photographic app icon. Omit when providing `node` instead. */
  src?: string;
  alt: string;
  onClick?: () => void;
  /** Shows a macOS-style running dot beneath the icon when true. */
  active?: boolean;
  /** A vector tile rendered in place of an image (fills the icon box). */
  node?: React.ReactNode;
}

// Glass Effect Wrapper Component
export const GlassEffect: React.FC<GlassEffectProps> = ({
  children,
  className = "",
  style = {},
  href,
  target = "_blank",
  hoverScale = true,
}) => {
  const glassStyle = {
    boxShadow: "0 6px 6px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 0, 0, 0.1)",
    transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
    ...style,
  };

  const content = (
    <div
      className={`relative flex font-semibold text-black cursor-pointer transition-transform duration-700 ${hoverScale ? "hover:scale-[1.03]" : ""} ${className}`}
      style={glassStyle}
    >
      {/* Glass Layers — all inherit the container radius so the border ring
          always matches the corners (no break when the pill scales). */}
      <div
        className="absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
        style={{
          backdropFilter: "blur(3px)",
          filter: "url(#glass-distortion)",
          isolation: "isolate",
        }}
      />
      <div
        className="absolute inset-0 z-10 rounded-[inherit]"
        style={{ background: "rgba(255, 255, 255, 0.25)" }}
      />
      <div
        className="absolute inset-0 z-20 overflow-hidden rounded-[inherit]"
        style={{
          boxShadow:
            "inset 2px 2px 1px 0 rgba(255, 255, 255, 0.5), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.5)",
        }}
      />

      {/* Content */}
      <div className="relative z-30 w-full">{children}</div>
    </div>
  );

  return href ? (
    <a href={href} target={target} rel="noopener noreferrer" className="block">
      {content}
    </a>
  ) : (
    content
  );
};

// Dock Component — `compact` shrinks it for non-home screens where it's just nav.
export const GlassDock: React.FC<{
  icons: DockIcon[];
  href?: string;
  compact?: boolean;
}> = ({ icons, href, compact = false }) => (
  <GlassEffect href={href} className={compact ? "rounded-2xl p-2" : "rounded-3xl p-3"}>
    <div
      className={`flex items-end justify-center ${
        compact ? "gap-4 rounded-2xl px-1.5" : "gap-6 rounded-3xl p-3 py-0 px-2.5"
      }`}
    >
      {icons.map((icon, index) => {
        const sizeClass = compact ? "w-9 h-9" : "w-12 h-12";
        const tween = {
          transformOrigin: "center center",
          transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
        } as const;
        return (
        <div key={index} className="flex flex-col items-center">
          {icon.node ? (
            <div
              className={`${sizeClass} transition-all duration-700 hover:scale-110 cursor-pointer`}
              style={tween}
              onClick={icon.onClick}
            >
              {icon.node}
            </div>
          ) : (
            <img
              src={icon.src}
              alt={icon.alt}
              className={`${sizeClass} rounded-[22%] object-cover transition-all duration-700 hover:scale-110 cursor-pointer`}
              style={tween}
              onClick={icon.onClick}
            />
          )}
          {/* macOS-style running dot — reserved space so layout never shifts */}
          <span
            className={`rounded-full bg-black/60 transition-opacity duration-300 ${
              compact ? "mt-0.5 h-1 w-1" : "mt-0.5 h-1.5 w-1.5"
            }`}
            style={{ opacity: icon.active ? 1 : 0 }}
          />
        </div>
        );
      })}
    </div>
  </GlassEffect>
);

// SVG Filter Component
export const GlassFilter: React.FC = () => (
  <svg style={{ display: "none" }}>
    <filter
      id="glass-distortion"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      filterUnits="objectBoundingBox"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.001 0.005"
        numOctaves="1"
        seed="17"
        result="turbulence"
      />
      <feComponentTransfer in="turbulence" result="mapped">
        <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
        <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
        <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
      </feComponentTransfer>
      <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
      <feSpecularLighting
        in="softMap"
        surfaceScale="5"
        specularConstant="1"
        specularExponent="100"
        lightingColor="white"
        result="specLight"
      >
        <fePointLight x="-200" y="-200" z="300" />
      </feSpecularLighting>
      <feComposite
        in="specLight"
        operator="arithmetic"
        k1="0"
        k2="1"
        k3="1"
        k4="0"
        result="litImage"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="softMap"
        scale="200"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </svg>
);
