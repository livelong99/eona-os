"use client";

// PromptFoundryView — dark-glass split panels (Wave 3).
//
// Input panel: GlowCard(glow="md") — raised, primary actor.
// Output panel: GlowCard(glow="sm") — recedes, secondary.
// The depth contrast between the two glow tiers is the visual split.
// Data wiring: sendMessage("hermes-agent", ...) preserved exactly.
// Export name + props signature unchanged.

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { sendMessage } from "@/lib/hermes";
import { SPRING_SNAPPY, TRANSITION_MICRO } from "@/lib/aurora";
import { GlowCard } from "@/components/ui/GlowCard";
import { Toolbar } from "@/components/ui/Toolbar";

type Target = "image" | "video" | "both";

// ---------------------------------------------------------------------------
// PromptFoundryView — spatial split panel.
//
// Input panel floats forward (ParallaxLayer raise) — it is the primary actor.
// Output panel recedes (ParallaxLayer back) — result, secondary.
// The depth contrast between raise and back is the "spatial split".
//
// Data wiring: sendMessage("hermes-agent", ...) preserved exactly.
// Export name + props signature unchanged.
// ---------------------------------------------------------------------------

export function PromptFoundryView() {
  const [brief, setBrief] = useState("");
  const [target, setTarget] = useState<Target>("both");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  // Original generate logic — unchanged.
  async function generate() {
    const text = brief.trim();
    if (!text || busy) return;
    setBusy(true);
    setOutput("");
    try {
      // "hermes-agent" routes to the engine's configured default model (Claude
      // via the claude_code runtime); server-side prompt-foundry skill applies.
      const { reply } = await sendMessage(
        "hermes-agent",
        `[prompt-foundry target=${target}] ${text}`,
      );
      setOutput(reply.text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        icon={<Sparkles className="h-4 w-4 text-accent" />}
        title="Prompt Foundry"
        subtitle="Brief → maximally-detailed Google Flow prompts (no media APIs)"
      />

      {/* Split-panel body — two GlowCard tiers create the depth contrast. */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-2">

        {/* Input panel — glow="md": primary, visually raised. */}
        <GlowCard
          as="section"
          glow="md"
          className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5"
          aria-label="Prompt brief"
        >
          <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            Brief
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={8}
            placeholder="Subject, mood, style, brand cues, references…"
            className="flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent/60"
          />

          {/* Target selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Target
            </span>
            {(["image", "video", "both"] as Target[]).map((t) => (
              <motion.button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                whileTap={{ scale: 0.93 }}
                transition={TRANSITION_MICRO}
                className={[
                  "rounded-lg border px-3 py-1 text-xs capitalize transition-colors cursor-pointer",
                  target === t
                    ? "border-accent/60 bg-accent/15 text-foreground"
                    : "border-border text-muted hover:text-foreground",
                ].join(" ")}
              >
                {t}
              </motion.button>
            ))}
          </div>

          {/* Generate button — pulses with SPRING_SNAPPY while busy */}
          <motion.button
            type="button"
            onClick={() => void generate()}
            disabled={busy || !brief.trim()}
            animate={busy ? { scale: [1, 1.02, 1] } : { scale: 1 }}
            transition={busy ? { ...SPRING_SNAPPY, repeat: Infinity } : SPRING_SNAPPY}
            className="mt-1 self-start rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {busy ? "Generating…" : "Generate prompts"}
          </motion.button>
        </GlowCard>

        {/* Output panel — glow="sm": secondary, visually receded. */}
        <GlowCard
          as="section"
          glow={busy ? "md" : "sm"}
          active={busy}
          className="flex min-h-0 flex-col overflow-y-auto p-5"
          aria-label="Flow-ready output"
        >
          <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            Flow-ready output
          </label>
          <pre
            className="mt-2 flex-1 min-h-40 whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 font-mono text-xs text-foreground/90"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {output || "Output appears here, ready to paste into Google Flow."}
          </pre>
        </GlowCard>

      </div>
    </div>
  );
}
