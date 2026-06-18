"use client";

// ChatView — animated AI chat using the ChatComposer + dark-glass message planes.
//
// ChatComposer (animated-ai-chat) replaces the old textarea+button row.
// Message bubbles: TiltCard for streaming agent message, GlassCard for settled,
// violet-tinted glass for user. All data wiring preserved:
//   sendMessageStream, speak, MicButton, speakReplies toggle.

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import type { Agent, Message } from "@/lib/types";
import { sendMessageStream } from "@/lib/hermes";
import { speak } from "@/lib/voice";
import { LAYER_ITEM, LAYER_VARIANTS, TRANSITION_MICRO } from "@/lib/aurora";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlowCard } from "@/components/ui/GlowCard";
import { TiltCard } from "@/components/ui/TiltCard";
import { Toolbar } from "@/components/ui/Toolbar";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { MicButton } from "@/components/ui/MicButton";
import { TierBadge } from "@/components/ui/TierBadge";
import { ChatComposer } from "@/components/ui/ChatComposer";

interface ChatViewProps {
  agent: Agent;
}

// ---------------------------------------------------------------------------
// MessageBubble — one message as a dark-glass floating plane.
// ---------------------------------------------------------------------------

interface BubbleProps {
  message: Message;
  isStreaming: boolean;
}

function MessageBubble({ message, isStreaming }: BubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    // Right-aligned, violet-tinted glass plane.
    return (
      <motion.li
        variants={LAYER_ITEM}
        className="self-end"
        style={{ maxWidth: "80%" }}
      >
        <div
          style={{
            background: "rgba(124,92,255,0.18)",
            border: "1px solid rgba(124,92,255,0.35)",
            borderRadius: "var(--radius-xl)",
            padding: "0.625rem 1rem",
            fontSize: "0.875rem",
            color: "var(--foreground)",
            backdropFilter: "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
            boxShadow: "var(--glow-sm), var(--glass-edge)",
          }}
        >
          {message.text}
        </div>
      </motion.li>
    );
  }

  // Agent streaming — raised TiltCard glows violet (§3 active glow).
  if (isStreaming) {
    return (
      <motion.li
        variants={LAYER_ITEM}
        className="self-start"
        style={{ maxWidth: "85%" }}
      >
        <TiltCard flat glow className="px-4 py-2.5 text-sm text-foreground/90">
          {message.text || (
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: "var(--muted)" }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: "var(--accent)" }}
                aria-hidden="true"
              />
              Thinking…
            </span>
          )}
        </TiltCard>
      </motion.li>
    );
  }

  // Agent settled — dark-glass pane.
  return (
    <motion.li
      variants={LAYER_ITEM}
      className="self-start"
      style={{ maxWidth: "85%" }}
    >
      <GlassCard elevation={2} className="px-4 py-2.5 text-sm text-foreground/90">
        {message.text}
      </GlassCard>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// ChatView — exported component. Export name + props signature unchanged.
// Data wiring: sendMessageStream, speak, MicButton, speakReplies preserved.
// ---------------------------------------------------------------------------

export function ChatView({ agent }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Submit — wiring identical to original; streamingId added.
  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    const replyId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: replyId, role: "agent", text: "", ts: Date.now() },
    ]);
    setDraft("");
    setBusy(true);
    setStreamingId(replyId);

    const bump = () =>
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
      );
    let acc = "";
    try {
      const { live } = await sendMessageStream(agent.model, text, (chunk) => {
        acc += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId ? { ...m, text: m.text + chunk } : m,
          ),
        );
        bump();
      });
      if (live && speakReplies && acc.trim()) {
        void speak(acc);
      }
      if (!live) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? {
                  ...m,
                  text:
                    "(offline) Engine not reachable — is the stack up? " +
                    "Run scripts/install.sh, then retry.",
                }
              : m,
          ),
        );
      }
    } finally {
      setBusy(false);
      setStreamingId(null);
      bump();
    }
  }

  // Toolbar: speaker toggle + tier badge.
  const toolbarActions = (
    <div className="flex items-center gap-3">
      <motion.button
        type="button"
        onClick={() => setSpeakReplies((v) => !v)}
        whileTap={{ scale: 0.93 }}
        transition={TRANSITION_MICRO}
        className={[
          "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors cursor-pointer",
          speakReplies
            ? "border-accent/60 bg-accent/10 text-accent"
            : "border-border bg-surface text-muted hover:text-foreground/80",
        ].join(" ")}
        aria-label={speakReplies ? "Mute spoken replies" : "Speak replies aloud"}
        aria-pressed={speakReplies}
        title={speakReplies ? "Spoken replies on" : "Spoken replies off"}
      >
        {speakReplies ? (
          <Volume2 className="h-4 w-4" />
        ) : (
          <VolumeX className="h-4 w-4" />
        )}
      </motion.button>
      <TierBadge tier={agent.tier} />
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        icon={<AgentIcon agent={agent} size="lg" />}
        title={agent.name}
        subtitle={agent.blurb}
        actions={toolbarActions}
      />

      {/* Message list — dark-glass scrollable area */}
      <GlowCard
        as="section"
        glow="sm"
        className="mx-4 my-3 flex flex-1 flex-col overflow-hidden"
        aria-label="Chat messages"
      >
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence>
            {messages.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mx-auto mt-16 max-w-md text-center text-sm"
                style={{ color: "var(--muted)" }}
              >
                <p className="mb-1" style={{ color: "var(--foreground)" }}>
                  Start a conversation with {agent.name}.
                </p>
                <p>
                  Model{" "}
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      background: "var(--surface-2)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.125rem 0.375rem",
                    }}
                  >
                    {agent.model}
                  </code>
                </p>
              </motion.div>
            ) : (
              <motion.ul
                key="messages"
                variants={LAYER_VARIANTS}
                initial="hidden"
                animate="visible"
                className="mx-auto flex max-w-2xl flex-col gap-4"
              >
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isStreaming={m.id === streamingId && busy}
                  />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </GlowCard>

      {/* ChatComposer anchored at the bottom — leading = MicButton */}
      <div className="px-4 pb-4">
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void submit()}
          disabled={busy}
          placeholder={`Message ${agent.name}…`}
          leading={
            <MicButton
              onTranscript={(t) =>
                setDraft((d) => (d.trim() ? `${d} ${t}` : t))
              }
              disabled={busy}
            />
          }
        />
      </div>
    </div>
  );
}
