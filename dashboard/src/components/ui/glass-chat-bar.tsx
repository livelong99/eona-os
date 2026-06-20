"use client";

import { useState, type KeyboardEvent } from "react";
import { Mic, ArrowUp } from "lucide-react";
import { GlassEffect } from "@/components/ui/liquid-glass";

interface GlassChatBarProps {
  placeholder?: string;
  onSend?: (text: string) => void;
  onMic?: () => void;
}

// Glass chat bar — the liquid-glass surface as a chat input: text field +
// mic button + send button. Mockup only (no wiring yet).
export function GlassChatBar({
  placeholder = "How can i help you today?",
  onSend,
  onMic,
}: GlassChatBarProps) {
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <GlassEffect
      hoverScale={false}
      className="w-[min(640px,92vw)] items-center rounded-full px-2.5 py-2"
    >
      <div className="flex w-full items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Message the agent"
          className="min-w-0 flex-1 cursor-text bg-transparent px-3 py-2 text-base font-medium text-white outline-none placeholder:font-normal placeholder:text-white/60"
        />

        {/* Mic button */}
        <button
          type="button"
          onClick={onMic}
          aria-label="Voice input"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors duration-200 hover:bg-white/15 cursor-pointer"
        >
          <Mic className="h-5 w-5" />
        </button>

        {/* Send button */}
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-all duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer"
          style={{
            background: canSend ? "#5227FF" : "rgba(255,255,255,0.15)",
          }}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </GlassEffect>
  );
}
