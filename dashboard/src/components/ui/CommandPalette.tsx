"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search } from "lucide-react";
import type { CommandItem, CommandPaletteProps } from "./contracts";

// ---------------------------------------------------------------------------
// CommandPalette — the Overlay-plane omnibox shell (§9).
//
// - Fixed overlay at z-index 9999 (Overlay plane).
// - Backdrop: darkened + blurred; dims the receding app behind.
// - Palette panel: glass card descending from above (palette-descend CSS
//   keyframe from globals.css). Reduced-motion: opacity crossfade only.
// - Keyboard: ArrowUp/Down navigate, Enter selects, Escape closes.
// - Items filtered client-side against query (label + keywords + hint).
// - Groups: items sharing a `group` string are rendered under a heading.
// - `onQueryChange` fires (debounced 150ms) for async sources.
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 150;

function filterItems(items: CommandItem[], query: string): CommandItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return items;
  return items.filter((item) => {
    const haystack = [item.label, item.hint, ...(item.keywords ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function groupItems(items: CommandItem[]): Map<string, CommandItem[]> {
  const map = new Map<string, CommandItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const panelVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

// ---------------------------------------------------------------------------
// Inner component — rendered only while `open` is true, so it starts with
// fresh state on every open. This sidesteps the need to sync state via effects.
// ---------------------------------------------------------------------------

interface InnerProps {
  items: CommandItem[];
  placeholder: string;
  onClose: () => void;
  onQueryChange?: (q: string) => void;
  listboxId: string;
  prefersReduced: boolean | null;
}

function PaletteInner({
  items,
  placeholder,
  onClose,
  onQueryChange,
  listboxId,
  prefersReduced,
}: InnerProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => filterItems(items, query), [items, query]);
  const grouped = useMemo(() => groupItems(filtered), [filtered]);

  // Derive clamped index — no effect needed.
  const safeIndex =
    filtered.length === 0 ? 0 : Math.min(activeIndex, filtered.length - 1);

  // Focus input after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Scroll active item into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLLIElement>(
      `[data-idx="${safeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  const handleQueryChange = useCallback(
    (val: string) => {
      setQuery(val);
      setActiveIndex(0);
      if (!onQueryChange) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onQueryChange(val), DEBOUNCE_MS);
    },
    [onQueryChange],
  );

  const selectItem = useCallback(
    (item: CommandItem) => {
      item.run();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[safeIndex];
        if (item) selectItem(item);
      }
    },
    [filtered, safeIndex, onClose, selectItem],
  );

  // Flat index counter for keyboard navigation across groups.
  let globalIdx = 0;

  return (
    <motion.div
      key="palette-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.18, ease: "easeOut" }}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        top: "12vh",
        left: "50%",
        translateX: "-50%",
        zIndex: 9999,
        width: "min(560px, calc(100vw - 2rem))",
        background: "var(--glass-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: ["var(--elev-4)", "var(--glass-edge)"].join(", "),
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      className={prefersReduced ? undefined : "palette-descend"}
    >
      {/* Search input row */}
      <div
        style={{ borderBottom: "1px solid var(--border)" }}
        className="flex items-center gap-3 px-4 py-3.5"
      >
        <Search
          className="h-4 w-4 shrink-0 text-muted"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          type="text"
          role="searchbox"
          aria-controls={listboxId}
          aria-label="Search commands"
          aria-activedescendant={
            filtered[safeIndex]
              ? `cmd-item-${filtered[safeIndex].id}`
              : undefined
          }
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none caret-[var(--accent)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => handleQueryChange("")}
            aria-label="Clear search"
            className="shrink-0 text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <span className="text-xs" aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      {/* Results */}
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Commands"
        className="max-h-[min(360px,50vh)] overflow-y-auto py-1.5"
      >
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted">
            No results for &ldquo;{query}&rdquo;
          </li>
        ) : (
          Array.from(grouped.entries()).map(([group, groupItems]) => (
            <li key={group || "__ungrouped"} role="none">
              {group && (
                <div className="px-3 pt-2 pb-1 text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted">
                  {group}
                </div>
              )}
              <ul role="none">
                {groupItems.map((item) => {
                  const idx = globalIdx++;
                  const isActive = idx === safeIndex;
                  return (
                    <li
                      key={item.id}
                      id={`cmd-item-${item.id}`}
                      role="option"
                      aria-selected={isActive}
                      data-idx={idx}
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      style={{
                        background: isActive
                          ? "rgba(124,92,255,0.12)"
                          : undefined,
                        borderLeft: isActive
                          ? "2px solid var(--accent)"
                          : "2px solid transparent",
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors duration-100 hover:bg-[rgba(124,92,255,0.08)]"
                    >
                      {item.icon && (
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-muted [&>svg]:h-4 [&>svg]:w-4"
                        >
                          {item.icon}
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm text-foreground">
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="block truncate text-[0.6875rem] text-muted mt-0.5">
                            {item.hint}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))
        )}
      </ul>

      {/* Footer keyboard hint */}
      <div
        style={{ borderTop: "1px solid var(--border)" }}
        className="flex items-center gap-3 px-4 py-2 text-[0.6875rem] text-muted"
      >
        <span><kbd className="font-sans">↑↓</kbd> navigate</span>
        <span><kbd className="font-sans">↵</kbd> select</span>
        <span><kbd className="font-sans">esc</kbd> close</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CommandPalette — outer shell that gates rendering + provides backdrop.
// ---------------------------------------------------------------------------

export function CommandPalette({
  open,
  onClose,
  items,
  placeholder = "Search commands…",
  onQueryChange,
}: CommandPaletteProps) {
  const prefersReduced = useReducedMotion();
  const listboxId = useId();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="palette-backdrop"
            aria-hidden="true"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "rgba(5,5,10,0.65)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          />

          {/* PaletteInner mounts fresh on each open, providing clean state. */}
          <PaletteInner
            items={items}
            placeholder={placeholder}
            onClose={onClose}
            onQueryChange={onQueryChange}
            listboxId={listboxId}
            prefersReduced={prefersReduced}
          />
        </>
      )}
    </AnimatePresence>
  );
}
