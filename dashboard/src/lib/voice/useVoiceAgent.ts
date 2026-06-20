import { useCallback, useEffect, useRef, useState } from "react";
import { transcribe, streamReply, speak } from "@/lib/voice/engineClient";
import { SentenceChunker } from "@/lib/voice/sentences";
import { recordUtterance } from "@/lib/voice/recorder";
import { AudioQueue } from "@/lib/voice/player";
import { loadWakeWord, type WakeWord } from "@/lib/voice/wakeword";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

/** Maps the voice machine onto the Aurora Orb's four visual states. */
export type OrbState = "idle" | "listening" | "thinking" | "working";
export function orbFor(state: VoiceState): OrbState {
  if (state === "listening") return "listening";
  if (state === "thinking") return "thinking";
  if (state === "speaking") return "working";
  return "idle";
}

export interface VoiceAgent {
  state: VoiceState;
  transcript: string;
  caption: string;
  error: string | null;
  /** True once the openWakeWord models loaded and hands-free is armed. */
  wakeArmed: boolean;
  /** Begin a turn now (push-to-talk / barge-in). */
  talk: () => void;
  /** Stop everything and return to idle. */
  cancel: () => void;
}

// Full voice loop: Groq STT → claude_code (Sonnet 4.6) stream → edge-tts, with
// sentence-level pipelining so the first audio plays before the answer finishes.
export function useVoiceAgent(): VoiceAgent {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wakeArmed, setWakeArmed] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const wakeRef = useRef<WakeWord | null>(null);
  const queueRef = useRef<AudioQueue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const getStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = s;
    return s;
  }, []);

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    queueRef.current?.stop();
    queueRef.current = null;
    busyRef.current = false;
  }, []);

  const runTurn = useCallback(async () => {
    if (busyRef.current) stopAll();
    busyRef.current = true;
    setError(null);
    setCaption("");
    setTranscript("");
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const stream = await getStream();

      // 1) listen + endpoint
      setState("listening");
      const audio = await recordUtterance({ stream, signal: abort.signal });

      // 2) transcribe (Groq)
      setState("thinking");
      const text = await transcribe(audio, abort.signal);
      setTranscript(text);
      if (!text) {
        setState("idle");
        busyRef.current = false;
        return;
      }

      // 3) stream the reply → chunk sentences → speak each → queue audio
      const chunker = new SentenceChunker();
      const queue = new AudioQueue(
        () => setState("speaking"),
        () => {
          setState("idle");
          busyRef.current = false;
        },
      );
      queueRef.current = queue;

      const synth = async (sentence: string) => {
        try {
          const blob = await speak(sentence, abort.signal);
          queue.enqueue(blob);
        } catch {
          /* skip a failed sentence rather than abort the whole reply */
        }
      };

      await streamReply(text, {
        signal: abort.signal,
        onToken: (delta) => {
          setCaption((c) => c + delta);
          for (const sentence of chunker.push(delta)) void synth(sentence);
        },
      });
      const tail = chunker.flush();
      if (tail) await synth(tail);

      // If nothing was queued (empty reply), settle back to idle.
      if (!queue.isActive) {
        setState("idle");
        busyRef.current = false;
      }
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "voice error");
      setState("error");
      busyRef.current = false;
      window.setTimeout(() => setState("idle"), 2500);
    }
  }, [getStream, stopAll]);

  const talk = useCallback(() => void runTurn(), [runTurn]);

  const cancel = useCallback(() => {
    stopAll();
    setState("idle");
  }, [stopAll]);

  // Arm hands-free wake word (best-effort; silently stays push-to-talk if the
  // openWakeWord models aren't present).
  useEffect(() => {
    let disposed = false;
    (async () => {
      const ww = await loadWakeWord();
      if (disposed || !ww) return;
      try {
        const stream = await getStream();
        ww.start(stream, () => {
          if (!busyRef.current) void runTurn();
        });
        wakeRef.current = ww;
        setWakeArmed(true);
      } catch {
        /* mic denied — push-to-talk remains */
      }
    })();
    return () => {
      disposed = true;
      wakeRef.current?.stop();
      abortRef.current?.abort();
      queueRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [getStream, runTurn]);

  return { state, transcript, caption, error, wakeArmed, talk, cancel };
}
