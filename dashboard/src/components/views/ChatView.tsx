"use client";

import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import type { Agent, Message } from "@/lib/types";
import { sendMessage } from "@/lib/hermes";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { TierBadge } from "@/components/ui/TierBadge";

interface ChatViewProps {
  agent: Agent;
}

export function ChatView({ agent }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setBusy(true);
    try {
      const { reply } = await sendMessage(agent.model, text);
      setMessages((prev) => [...prev, reply]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
      );
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <AgentIcon agent={agent} size="lg" />
          <div>
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <p className="text-xs text-muted">{agent.blurb}</p>
          </div>
        </div>
        <TierBadge tier={agent.tier} />
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md text-center text-sm text-muted">
            <p className="mb-1 text-foreground/80">
              Start a conversation with {agent.name}.
            </p>
            <p>
              Model{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                {agent.model}
              </code>
            </p>
          </div>
        ) : (
          <ul className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m) => (
              <li
                key={m.id}
                className={m.role === "user" ? "self-end" : "self-start"}
              >
                <div
                  className={`max-w-xl rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-accent/90 text-white"
                      : "border border-border bg-surface text-foreground/90"
                  }`}
                >
                  {m.text}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder={`Message ${agent.name}…`}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent/60"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !draft.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-40"
            aria-label="Send"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
