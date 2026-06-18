"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { SendHorizontal, Volume2, VolumeX } from "lucide-react";
import type { Agent, Message } from "@/lib/types";
import { sendMessageStream } from "@/lib/hermes";
import { speak } from "@/lib/voice";
import { LAYER_ITEM, LAYER_VARIANTS, TRANSITION_MICRO } from "@/lib/aurora";
import { SpatialStage } from "@/components/ui/SpatialStage";
import { ParallaxLayer } from "@/components/ui/ParallaxLayer";
import { GlassCard } from "@/components/ui/GlassCard";
import { TiltCard } from "@/components/ui/TiltCard";
import { Toolbar } from "@/components/ui/Toolbar";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { MicButton } from "@/components/ui/MicButton";
import { TierBadge } from "@/components/ui/TierBadge";

interface ChatViewProps {
  agent: Agent;
}

// ---------------------------------------------------------------------------
// MessageBubble — renders one message as a floating glass plane.
// The actively-streaming agent message gets TiltCard (flat) so it lifts.
// ---------------------------------------------------------------------------

interface BubbleProps {
  message: Message;
  isStreaming: boolean;
}

function MessageBubble({ message, isStreaming }: BubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      // User messages: right-aligned, accent-tinted glass plane.
      <motion.li
        variants={LAYER_ITEM}
        className="self-end"
        style={{ maxWidth: "80%" }}
      >
        {/* Wrap GlassCard in a div for accent-tint overrides — GlassCard has no style prop. */}
        <div
          style={{
            background: "rgba(124, 92, 255, 0.18)",
            borderColor: "rgba(124, 92, 255, 0.35)",
            color: "var(--foreground)",
            borderRadius: "var(--radius-xl)",
            border: "1px solid rgba(124, 92, 255, 0.35)",
            padding: "0.625rem 1rem",
            fontSize: "0.875rem",
            backdropFilter: "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
            boxShadow: "var(--elev-1), var(--glass-edge)",
          }}
        >
          {message.text}
        </div>
      </motion.li>
    );
  }

  // Agent message — raised glass surface when streaming (§9).
  if (isStreaming) {
    return (
      <motion.li
        variants={LAYER_ITEM}
        className="self-start"
        style={{ maxWidth: "85%" }}
      >
        <TiltCard flat glow className="px-4 py-2.5 text-sm text-foreground/90">
          {message.text || (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
                aria-hidden="true"
              />
              Thinking…
            </span>
          )}
        </TiltCard>
      </motion.li>
    );
  }

  // Agent message — settled glass plane.
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
// Data wiring: sendMessageStream, speak, MicButton all preserved.
// ---------------------------------------------------------------------------

export function ChatView({ agent }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  // replyId is tracked to know which message is actively streaming.
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Preserve original submit logic exactly; only add streamingId tracking.
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
          prev.map((m) => (m.id === replyId ? { ...m, text: m.text + chunk } : m)),
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

  // Toolbar actions: speaker toggle + tier badge.
  const toolbarActions = (
    <div className="flex items-center gap-3">
      <motion.button
        type="button"
        onClick={() => setSpeakReplies((v) => !v)}
        whileTap={{ scale: 0.93 }}
        transition={TRANSITION_MICRO}
        className={[
          "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
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
    <SpatialStage className="flex h-full flex-col">
      <Toolbar
        icon={<AgentIcon agent={agent} size="lg" />}
        title={agent.name}
        subtitle={agent.blurb}
        actions={toolbarActions}
      />

      {/* Message list — mild parallax makes the plane feel floating.
          ParallaxLayer has no style prop; className drives flex layout. */}
      <ParallaxLayer
        depth={0.04}
        plane="base"
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
          {messages.length === 0 ? (
            <div className="mx-auto mt-16 max-w-md text-center text-sm text-muted">
              <p className="mb-1 text-foreground/80">
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
            </div>
          ) : (
            <motion.ul
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
        </div>
      </ParallaxLayer>

      {/* Input bar — glass panel anchored at the bottom.
          Override border-radius to 0 via Tailwind since GlassCard has no style prop. */}
      <GlassCard
        as="aside"
        elevation={2}
        className="px-6 py-4 !rounded-none"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <MicButton
            onTranscript={(t) =>
              setDraft((d) => (d.trim() ? `${d} ${t}` : t))
            }
            disabled={busy}
          />
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
          <motion.button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !draft.trim()}
            whileTap={{ scale: 0.9 }}
            transition={TRANSITION_MICRO}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-40"
            aria-label="Send"
          >
            <SendHorizontal className="h-4 w-4" />
          </motion.button>
        </div>
      </GlassCard>
    </SpatialStage>
  );
}
