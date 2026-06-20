import { GlassChatBar } from "@/components/ui/glass-chat-bar";
import AuroraOrb from "@/components/ui/AuroraOrb";
import { GlassCircle } from "@/components/ui/glass-circle";
import { useVoiceAgent, orbFor, type VoiceState } from "@/lib/voice/useVoiceAgent";

const STATE_META: Record<VoiceState, { label: string; color: string }> = {
  idle: { label: "Idle", color: "#8a8fa3" },
  listening: { label: "Listening", color: "#22d3a8" },
  thinking: { label: "Thinking", color: "#a78bfa" },
  speaking: { label: "Speaking", color: "#34d399" },
  error: { label: "Error", color: "#f4694d" },
};

// HomeScreen — the interactive "talk to the agent" home. The Aurora Orb reflects
// the live voice state; tap it (or the mic) to talk, or say the wake word when
// hands-free is armed. Pipeline: Groq STT → claude_code (Sonnet 4.6) → edge-tts.
export function HomeScreen() {
  const voice = useVoiceAgent();
  const meta = STATE_META[voice.state];
  const speaking = voice.state === "speaking";

  return (
    <>
      {/* Aurora Orb — the living centerpiece; tap to talk / barge-in. */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <button
          type="button"
          onClick={voice.talk}
          aria-label={speaking ? "Interrupt and talk" : "Talk to the agent"}
          className="rounded-full transition-transform duration-200 hover:scale-[1.02] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
        >
          <GlassCircle>
            <AuroraOrb size={260} state={orbFor(voice.state)} />
          </GlassCircle>
        </button>
      </div>

      {/* Bottom group: live state readout + caption + chat bar. */}
      <div className="fixed bottom-8 left-1/2 z-30 flex w-[min(640px,92vw)] -translate-x-1/2 flex-col items-center gap-3">
        {/* caption (what you said / what it's saying) */}
        {(voice.transcript || voice.caption) && (
          <div className="max-w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center backdrop-blur-md">
            {voice.transcript && (
              <p className="truncate text-[12px] text-white/45">“{voice.transcript}”</p>
            )}
            {voice.caption && (
              <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug text-white/85">
                {voice.caption}
              </p>
            )}
          </div>
        )}

        {/* live state pill */}
        <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-1.5 shadow-[0_6px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
          <span
            className={`h-2 w-2 rounded-full ${voice.state !== "idle" ? "animate-pulse" : ""}`}
            style={{ background: meta.color }}
          />
          <span className="text-[13px] font-semibold tracking-tight text-white">
            {meta.label}
          </span>
          <span className="text-[12px] text-white/40">
            · {voice.wakeArmed ? 'say "Hey Jarvis"' : "tap the orb to talk"}
          </span>
        </div>

        {voice.error && (
          <p className="text-[12px] text-[#f4694d]">{voice.error}</p>
        )}

        <GlassChatBar onMic={voice.talk} />
      </div>
    </>
  );
}
