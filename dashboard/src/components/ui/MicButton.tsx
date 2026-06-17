"use client";

import { useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { startRecording, transcribe, type Recorder } from "@/lib/voice";

interface MicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type MicState = "idle" | "recording" | "transcribing";

/**
 * Push-to-talk mic: click to start recording, click again to stop and
 * transcribe. The resulting text is handed back via onTranscript. Failures
 * (mic denied, STT error) reset to idle silently so the user can retry.
 */
export function MicButton({ onTranscript, disabled }: MicButtonProps) {
  const [state, setState] = useState<MicState>("idle");
  const recorderRef = useRef<Recorder | null>(null);

  async function toggle(): Promise<void> {
    if (state === "transcribing") return;

    if (state === "idle") {
      try {
        recorderRef.current = await startRecording();
        setState("recording");
      } catch {
        setState("idle");
      }
      return;
    }

    // recording -> stop + transcribe
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) {
      setState("idle");
      return;
    }
    setState("transcribing");
    try {
      const blob = await rec.stop();
      const text = await transcribe(blob);
      if (text) onTranscript(text);
    } catch {
      /* swallow — user can retry */
    } finally {
      setState("idle");
    }
  }

  const label =
    state === "recording"
      ? "Stop recording"
      : state === "transcribing"
        ? "Transcribing…"
        : "Record voice";

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={disabled || state === "transcribing"}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
        state === "recording"
          ? "animate-pulse border-red-500/60 bg-red-500/10 text-red-500"
          : "border-border bg-surface text-foreground/80 hover:border-accent/60"
      }`}
      aria-label={label}
      title={label}
    >
      {state === "transcribing" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "recording" ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}
