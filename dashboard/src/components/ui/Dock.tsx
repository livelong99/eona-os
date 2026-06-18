"use client";

// Dock — top-centered horizontal navigation (Wave 3).
//
// Structure faithfully reproduced from badtzx0/dock on 21st.dev:
//   • CSS sibling-selector magnify: .icon:hover scales up ±1 neighbour via CSS vars
//   • Mouse cursor position tracked via ref + onMouseMove offset CSS var
//   • Glass pill container: backdrop-blur, --dock-bg, --dock-border, pill radius
//   • Tooltip span above icon on group-hover
//   • Active indicator dot below the icon
//
// Adaptations:
//   (a) Styling → dark-glass CSS-var tokens (--dock-bg, --dock-border, --glow-sm/md)
//   (b) Wiring → DockProps / DockItem from contracts.ts (no image src, uses ReactNode icon)
//   (c) Position → fixed top-4 centered (not bottom), icons grow upward via margin-top trick
//   (d) Framework → no JSX pragma `style jsx`; scoped via a unique class + a <style> tag
//   (e) Keyboard → role="navigation", role="list", aria-current="page", focus ring

import React, { useRef } from "react";
import type { DockProps, DockItem } from "./contracts";

// Scale a value linearly between two ranges.
function scaleValue(value: number, from: [number, number], to: [number, number]): number {
  const scale = (to[1] - to[0]) / (from[1] - from[0]);
  const capped = Math.min(from[1], Math.max(from[0], value)) - from[0];
  return Math.floor(capped * scale + to[0]);
}

const ICON_SIZE = 44; // px — base icon size
const MAX_ADDITIONAL = 6; // px — offset nudge passed via CSS var for neighbour icons

// Scoped CSS — the sibling-selector magnify effect from badtzx0/dock.
// Uses --icon-size, --dock-offset-left, --dock-offset-right CSS custom properties
// set imperatively on the nav element via JS.
const DOCK_CSS = `
  .dock-icon:hover + .dock-icon {
    width: calc(var(--icon-size) * 1.33 + var(--dock-offset-right, 0px));
    height: calc(var(--icon-size) * 1.33 + var(--dock-offset-right, 0px));
    margin-top: calc(var(--icon-size) * -0.33 + var(--dock-offset-right, 0) * -1);
  }
  .dock-icon:hover + .dock-icon + .dock-icon {
    width: calc(var(--icon-size) * 1.17 + var(--dock-offset-right, 0px));
    height: calc(var(--icon-size) * 1.17 + var(--dock-offset-right, 0px));
    margin-top: calc(var(--icon-size) * -0.17 + var(--dock-offset-right, 0) * -1);
  }
  .dock-icon:has(+ .dock-icon:hover) {
    width: calc(var(--icon-size) * 1.33 + var(--dock-offset-left, 0px));
    height: calc(var(--icon-size) * 1.33 + var(--dock-offset-left, 0px));
    margin-top: calc(var(--icon-size) * -0.33 + var(--dock-offset-left, 0) * -1);
  }
  .dock-icon:has(+ .dock-icon + .dock-icon:hover) {
    width: calc(var(--icon-size) * 1.17 + var(--dock-offset-left, 0px));
    height: calc(var(--icon-size) * 1.17 + var(--dock-offset-left, 0px));
    margin-top: calc(var(--icon-size) * -0.17 + var(--dock-offset-left, 0) * -1);
  }
  /* Reduced motion: disable all scale transforms, keep hover opacity change only */
  @media (prefers-reduced-motion: reduce) {
    .dock-icon,
    .dock-icon:hover + .dock-icon,
    .dock-icon:hover + .dock-icon + .dock-icon,
    .dock-icon:has(+ .dock-icon:hover),
    .dock-icon:has(+ .dock-icon + .dock-icon:hover) {
      width: var(--icon-size) !important;
      height: var(--icon-size) !important;
      margin-top: 0 !important;
      transition: none !important;
    }
  }
`;

export function Dock({ items, trailing, className = "" }: DockProps) {
  const navRef = useRef<HTMLElement>(null);

  const handleIconHover = (e: React.MouseEvent<HTMLLIElement>) => {
    if (!navRef.current) return;
    const mousePos = e.clientX;
    const iconLeft = e.currentTarget.getBoundingClientRect().left;
    const iconWidth = e.currentTarget.getBoundingClientRect().width;
    const cursorDistance = (mousePos - iconLeft) / iconWidth;
    const offsetPx = scaleValue(cursorDistance, [0, 1], [MAX_ADDITIONAL * -1, MAX_ADDITIONAL]);
    navRef.current.style.setProperty("--dock-offset-left", `${offsetPx * -1}px`);
    navRef.current.style.setProperty("--dock-offset-right", `${offsetPx}px`);
  };

  return (
    <>
      {/* Scoped CSS for the sibling-selector magnify (badtzx0/dock pattern) */}
      <style>{DOCK_CSS}</style>

      <nav
        ref={navRef}
        role="navigation"
        aria-label="Primary navigation"
        className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 ${className}`}
        style={
          {
            "--icon-size": `${ICON_SIZE}px`,
          } as React.CSSProperties
        }
      >
        <ul
          className="flex items-end gap-1 rounded-[9999px] p-2"
          role="list"
          style={{
            background: "var(--dock-bg)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid var(--dock-border)",
            boxShadow: [
              "var(--glow-sm)",
              "var(--glass-edge)",
              "inset 0 -1px 0 rgba(0,0,0,0.2)",
            ].join(", "),
          }}
        >
          {items.map((item) => (
            <DockIconItem
              key={item.id}
              item={item}
              handleIconHover={handleIconHover}
            />
          ))}

          {/* Trailing slot — e.g. ⌘K launcher */}
          {trailing && (
            <>
              {/* Visual divider */}
              <li
                aria-hidden="true"
                className="mx-1 self-stretch"
                style={{
                  width: "1px",
                  background: "var(--dock-border)",
                  borderRadius: "9999px",
                }}
              />
              <li className="flex items-center">{trailing}</li>
            </>
          )}
        </ul>
      </nav>
    </>
  );
}

// ── DockIconItem ─────────────────────────────────────────────────────────────

interface DockIconItemProps {
  item: DockItem;
  handleIconHover: (e: React.MouseEvent<HTMLLIElement>) => void;
}

function DockIconItem({ item, handleIconHover }: DockIconItemProps) {
  return (
    <li
      onMouseMove={handleIconHover}
      className="dock-icon group/li relative flex flex-col items-center cursor-pointer"
      style={{
        // Transition matches badtzx0/dock: width + height + margin-top
        transition: "width, height, margin-top, cubic-bezier(0.25, 1, 0.5, 1) 150ms",
        width: "var(--icon-size)",
        height: "var(--icon-size)",
      }}
    >
      {/* Tooltip — appears above icon on hover (badtzx0/dock pattern) */}
      <span
        className="absolute whitespace-nowrap rounded-md px-2 py-1 text-xs opacity-0 transition-opacity duration-200 pointer-events-none group-hover/li:opacity-100"
        style={{
          top: "-36px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--dock-bg)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid var(--dock-border)",
          color: "var(--foreground)",
        }}
        role="tooltip"
      >
        {item.label}
      </span>

      {/* Icon button */}
      <button
        type="button"
        onClick={item.onSelect}
        aria-current={item.active ? "page" : undefined}
        aria-label={item.label}
        className="relative flex h-full w-full items-center justify-center rounded-[10px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2"
        style={{
          background: item.active
            ? "rgba(124,92,255,0.18)"
            : "rgba(255,255,255,0.04)",
          border: item.active
            ? "1px solid rgba(124,92,255,0.35)"
            : "1px solid rgba(255,255,255,0.06)",
          boxShadow: item.active ? "var(--glow-sm)" : undefined,
          color: item.active ? "var(--accent)" : "var(--muted)",
          // focus ring uses accent
          outlineColor: "var(--accent)",
          outlineOffset: "2px",
        }}
        // Inline hover via event handlers (same pattern as existing Sidebar)
        onMouseEnter={(e) => {
          if (item.active) return;
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,92,255,0.08)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--foreground)";
        }}
        onMouseLeave={(e) => {
          if (item.active) return;
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
        }}
      >
        {/* Icon node — sized to 60% of the container */}
        <span className="flex h-[60%] w-[60%] items-center justify-center">
          {item.icon}
        </span>
      </button>

      {/* Active indicator dot — below the icon (badtzx0/dock open-app dot) */}
      {item.active && (
        <span
          className="absolute"
          style={{
            bottom: "-6px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 6px var(--accent)",
          }}
          aria-hidden="true"
        />
      )}
    </li>
  );
}
