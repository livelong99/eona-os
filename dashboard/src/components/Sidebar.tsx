"use client";

// Sidebar — spatial design language (Wave 2, §6, §7).
//
// Material: glass (--glass-bg + backdrop-filter) sitting on the Backdrop plane.
// Active nav items use the violet accent glass style (matching CommandPalette).
// Nav buttons are motion.button with SPRING_SNAPPY micro-interactions.
// A ⌘K hint badge in the footer surfaces Command Bridge discoverability.
//
// Props interface is unchanged: active, onSelect, live.

import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/aurora";
import { AGENTS, NAV, type NavItem, type ViewId } from "@/lib/nav";
import { Icon } from "@/components/ui/Icon";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { LivePill } from "@/components/ui/LivePill";

interface SidebarProps {
  active: ViewId;
  onSelect: (id: ViewId) => void;
  live: boolean;
}

export function Sidebar({ active, onSelect, live }: SidebarProps) {
  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col"
      style={{
        // Glass material — backdrop plane (§6).
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        borderRight: "1px solid var(--glass-border)",
        // Inset edge light: subtle 1px top highlight for glass feel (§6).
        boxShadow: "inset 1px 0 0 rgba(255,255,255,0.04), var(--glass-edge)",
        // Sit on the Backdrop depth plane (§1).
        transform: "translateZ(var(--z-back))",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Wordmark */}
      <div className="px-5 pb-4 pt-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-muted">
          LOCAL · STUDIO
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          Agentic <span className="italic text-accent">OS</span>
        </h1>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => {
          // Give the Studio group a subtle aurora violet accent on the heading.
          const isStudio = group.heading === "Studio";
          return (
            <div key={group.heading} className="mb-5">
              <p
                className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.18em]"
                style={{ color: isStudio ? "rgba(124,92,255,0.7)" : "var(--muted)" }}
              >
                {group.heading.toUpperCase()}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NavButton
                      item={item}
                      active={active === item.id}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer: gateway status + user avatar + ⌘K discoverability badge */}
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid var(--glass-border)" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-muted">Obsidian vault</span>
          <LivePill live={live} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-full bg-gradient-to-br from-slate-500 to-slate-700" />
            <span className="text-sm text-foreground/90">Master</span>
          </div>
          {/* ⌘K hint — surfaces Command Bridge to keyboard users */}
          <kbd
            className="rounded border font-sans text-[10px] text-muted px-1.5 py-0.5"
            style={{ borderColor: "var(--border)" }}
            title="Open Command Bridge (⌘K / Ctrl+K)"
          >
            ⌘K
          </kbd>
        </div>
      </div>
    </aside>
  );
}

interface NavButtonProps {
  item: NavItem;
  active: boolean;
  onSelect: (id: ViewId) => void;
}

function NavButton({ item, active, onSelect }: NavButtonProps) {
  const agent = item.agentId ? AGENTS[item.agentId] : null;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(item.id)}
      whileTap={{ scale: 0.97 }}
      transition={SPRING_SNAPPY}
      aria-current={active ? "page" : undefined}
      className="flex w-full items-center gap-2.5 rounded-lg py-1.5 text-sm cursor-pointer transition-colors duration-150"
      style={
        active
          ? {
              // Violet accent glass active state — mirrors CommandPalette row.
              background: "rgba(124,92,255,0.12)",
              borderLeft: "2px solid var(--accent)",
              paddingLeft: "calc(0.5rem - 2px)",
              color: "var(--foreground)",
            }
          : {
              background: "transparent",
              borderLeft: "2px solid transparent",
              paddingLeft: "calc(0.5rem - 2px)",
              color: "color-mix(in srgb, var(--foreground) 65%, transparent)",
            }
      }
      // Inline hover via event handlers to avoid stale closure on `active`.
      onMouseEnter={(e) => {
        if (active) return;
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(124,92,255,0.06)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--foreground)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.color =
          "color-mix(in srgb, var(--foreground) 65%, transparent)";
      }}
    >
      {agent ? (
        <AgentIcon agent={agent} size="sm" />
      ) : (
        <Icon
          name={item.icon}
          className={`h-[18px] w-[18px] ${active ? "text-accent" : "text-muted"}`}
        />
      )}
      <span className="truncate">{item.label}</span>
    </motion.button>
  );
}
