import { useState, type KeyboardEvent } from "react";
import { Mic, ArrowUp } from "lucide-react";

interface SessionComposerProps {
  /** Agent the message is addressed to (shapes the placeholder). */
  agentName?: string;
  onSend?: (text: string) => void;
}

// SessionComposer — the chat bar docked at the bottom of the terminal panel.
// Send a message into the active session. Styled to match the embedded terminal
// surface (flat inset, not the floating home pill). Mockup only — no wiring.
export function SessionComposer({ agentName, onSend }: SessionComposerProps) {
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-white/[0.1] px-2.5 py-2 transition-colors duration-200 focus-within:border-white/20"
      style={{ background: "rgba(0,0,0,0.32)" }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Message ${agentName ?? "the agent"} in this session…`}
        aria-label="Message this session"
        className="min-w-0 flex-1 cursor-text bg-transparent px-2 py-1.5 text-[14px] text-white outline-none placeholder:text-white/40"
      />

      <button
        type="button"
        aria-label="Voice input"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors duration-200 hover:bg-white/10 cursor-pointer"
      >
        <Mic className="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send message"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition-all duration-200 disabled:cursor-default disabled:opacity-40 cursor-pointer"
        style={{ background: canSend ? "#5227FF" : "rgba(255,255,255,0.12)" }}
      >
        <ArrowUp className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
