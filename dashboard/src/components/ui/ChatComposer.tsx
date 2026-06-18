"use client";

// ChatComposer — animated AI chat input (jatin-yadav05/animated-ai-chat, adapted).
//
// Structure: auto-resize textarea with animated focus ring, bottom toolbar with
// a leading slot (e.g. MicButton) and a send button. Glass container lifts glow
// on focus. Typing-dots indicator appears while disabled (agent is streaming).
//
// Props wire to ChatComposerProps contract (contracts.ts). Dark-glass tokens
// throughout; no hardcoded colors. Reduced-motion safe: ring/glow only, no translate.

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SendIcon } from "lucide-react";
import type { ChatComposerProps } from "./contracts";
import { SPRING_SNAPPY, TRANSITION_GLOW } from "@/lib/aurora";

// ---------------------------------------------------------------------------
// useAutoResizeTextarea — mirrors the jatin-yadav05 hook exactly.
// ---------------------------------------------------------------------------

interface AutoResizeOptions {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeOptions) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const el = textareaRef.current;
      if (!el) return;
      if (reset) {
        el.style.height = `${minHeight}px`;
        return;
      }
      el.style.height = `${minHeight}px`;
      const next = Math.max(
        minHeight,
        Math.min(el.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY),
      );
      el.style.height = `${next}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (el) el.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const onResize = () => adjustHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

// ---------------------------------------------------------------------------
// TypingDots — animated indicator shown while agent is streaming (disabled).
// ---------------------------------------------------------------------------

function TypingDots() {
  return (
    <div
      className="flex items-center gap-1"
      aria-label="Agent is thinking"
      role="status"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--muted)" }}
          initial={{ opacity: 0.3, scale: 0.85 }}
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.1, 0.85] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatComposer — exported component.
// ---------------------------------------------------------------------------

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Type a message…",
  leading,
  className = "",
}: ChatComposerProps) {
  const [focused, setFocused] = useState(false);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 52,
    maxHeight: 200,
  });

  const canSend = !disabled && value.trim().length > 0;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  // Raise/lower glow on focus via inline style swap.
  const restingBoxShadow = focused
    ? "var(--glow-md), var(--glass-edge)"
    : "var(--glow-sm), var(--glass-edge)";

  return (
    <div
      className={["relative", className].filter(Boolean).join(" ")}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border: focused
          ? "1px solid rgba(124,92,255,0.35)"
          : "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: restingBoxShadow,
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      }}
    >
      {/* Animated focus ring — a motion.span overlay (from jatin-yadav05). */}
      <AnimatePresence>
        {focused && (
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              boxShadow: "0 0 0 2px rgba(124,92,255,0.22)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION_GLOW}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Textarea area */}
      <div className="relative px-4 pt-4 pb-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted disabled:opacity-60"
          style={{
            color: "var(--foreground)",
            overflow: "hidden",
            minHeight: 52,
          }}
          aria-label="Message input"
          aria-multiline="true"
        />
      </div>

      {/* Bottom toolbar: leading + typing indicator / send button */}
      <div
        className="flex items-center justify-between gap-3 px-3 pb-3"
        style={{
          borderTop: "1px solid var(--glass-border)",
          paddingTop: "0.5rem",
        }}
      >
        {/* Leading slot (e.g. MicButton) */}
        <div className="flex items-center gap-2">
          {leading}
        </div>

        {/* Right side: typing dots when streaming, send button otherwise */}
        <AnimatePresence mode="wait">
          {disabled ? (
            <motion.div
              key="dots"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING_SNAPPY}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Thinking
              </span>
              <TypingDots />
            </motion.div>
          ) : (
            <motion.button
              key="send"
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAPPY}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40 cursor-pointer"
              style={{
                background: canSend ? "var(--accent)" : "var(--surface)",
                color: canSend ? "#fff" : "var(--muted)",
                border: canSend ? "none" : "1px solid var(--border)",
              }}
              aria-label="Send message"
            >
              <SendIcon className="h-4 w-4" aria-hidden="true" />
              <span>Send</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
