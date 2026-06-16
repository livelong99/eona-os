"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { sendMessage } from "@/lib/hermes";

type Target = "image" | "video" | "both";

export function PromptFoundryView() {
  const [brief, setBrief] = useState("");
  const [target, setTarget] = useState<Target>("both");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    const text = brief.trim();
    if (!text || busy) return;
    setBusy(true);
    setOutput("");
    try {
      const { reply } = await sendMessage(
        "prompt-writer",
        `[prompt-foundry target=${target}] ${text}`,
      );
      setOutput(reply.text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Sparkles className="h-5 w-5 text-accent" />
        <div>
          <h2 className="text-lg font-semibold">Prompt Foundry</h2>
          <p className="text-xs text-muted">
            Brief → maximally-detailed Google Flow prompts (no media APIs)
          </p>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-px overflow-hidden bg-border lg:grid-cols-2">
        <div className="flex flex-col gap-3 overflow-y-auto bg-background p-6">
          <label className="text-xs font-medium text-muted">Brief</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={8}
            placeholder="Subject, mood, style, brand cues, references…"
            className="resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent/60"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted">Target</span>
            {(["image", "video", "both"] as Target[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={`rounded-lg border px-3 py-1 text-xs capitalize transition-colors ${
                  target === t
                    ? "border-accent/60 bg-accent/15 text-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || !brief.trim()}
            className="mt-1 self-start rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
          >
            {busy ? "Generating…" : "Generate prompts"}
          </button>
        </div>

        <div className="overflow-y-auto bg-background p-6">
          <label className="text-xs font-medium text-muted">
            Flow-ready output
          </label>
          <pre className="mt-2 min-h-40 whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 font-mono text-xs text-foreground/90">
            {output || "Output appears here, ready to paste into Google Flow."}
          </pre>
        </div>
      </div>
    </div>
  );
}
