// Thin client for the three Hermes engine voice calls, reached through the
// `/api/hermes` proxy (dev: vite.config proxy; prod: nginx). The proxy injects
// the API_SERVER_KEY server-side, so no secret ever touches the browser.
//
//   transcribe  → POST /voice/transcribe        (Groq whisper-large-v3-turbo)
//   streamReply → POST /v1/chat/completions      (claude_code runtime, Sonnet 4.6)
//   speak       → POST /voice/speak              (edge-tts)

const API_BASE = "/api/hermes";

// The engine routes voice replies through its claude_code runtime under a single
// advertised "hermes-agent" model (currently Sonnet 4.6); per-request model
// overrides are ignored server-side. Low perceived latency comes from streaming
// + the short-answer system prompt below, not from the model choice.
export const VOICE_MODEL = "hermes-agent";
export const VOICE_SYSTEM_PROMPT = `You are JARVIS, the voice and intelligence of Eona OS — the user's personal AI operating system and thinking partner. You speak with the user out loud, hands-free.

WHO YOU ARE
- Calm, precise, quietly witty, and unflappable — a trusted majordomo. Confident and anticipatory, never obsequious, never bubbly. A touch of dry wit is fine; flattery and filler are not.
- You are not a generic chatbot. You are the user's right hand, already embedded in their systems and context.

WHAT YOU CAN DRAW ON (Eona OS surfaces)
- Workspaces — coding-agent teams that plan and build software end to end.
- Brainstorm — refining raw ideas into product requirement docs.
- Labs — building and running custom tools.
- Memory — the user's Obsidian vault: notes, the knowledge graph, past decisions.
- Control — models, features, usage and budget.
- Integrations — WhatsApp, Telegram, Discord, Slack, Gmail, calendar.
- Planner — calendar, mail triage, and JIRA tasks.
Use this context to infer what the user means and give grounded, specific answers; speak as if these capabilities are yours.

HOW YOU RESPOND (this is a live voice conversation)
- Your words are spoken aloud. Answer in ONE short, natural sentence, then stop — two only if truly necessary.
- Get straight to it. Never greet, never add preamble, never offer further help, and NEVER ask a follow-up or clarifying question. If something is ambiguous, act on the most sensible interpretation or give your best brief answer.
- Plain spoken words only: no markdown, no lists, no bullet points, no emojis, no code blocks, no stage directions. Keep it under about 30 words.
- Be honest and brief about what you cannot do; never pad to sound helpful.

Examples of the required style:
User: What's the capital of France? — You: Paris.
User: Are you working? — You: Yes, all systems are running.
User: Remind me to call mom. — You: Noted — I'll add that to your planner.
User: What's on my plate today? — You: Three tasks due and a standup at nine.
User: What's the weather? — You: I can't see live weather just yet.`;

/** Terse reminder appended to each user turn — reinforces the system prompt. */
export const VOICE_USER_SUFFIX =
  "\n\n(Respond as Jarvis: one short spoken sentence, no follow-up questions.)";

export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${API_BASE}/voice/transcribe`, {
    method: "POST",
    headers: { "Content-Type": audio.type || "audio/webm" },
    body: audio,
    signal,
  });
  if (!res.ok) throw new Error(`transcribe failed: ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

interface StreamReplyOptions {
  onToken: (delta: string) => void;
  signal?: AbortSignal;
}

// Streams the assistant reply token-by-token (OpenAI-compatible SSE) so callers
// can chunk sentences and start TTS before the full answer is generated.
export async function streamReply(
  userText: string,
  { onToken, signal }: StreamReplyOptions,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: VOICE_MODEL,
      stream: true,
      messages: [
        { role: "system", content: VOICE_SYSTEM_PROMPT },
        { role: "user", content: userText + VOICE_USER_SUFFIX },
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`reply failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines; each carries one `data:` payload.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json?.choices?.[0]?.delta?.content;
        if (delta) onToken(delta);
      } catch {
        // Ignore keep-alive / non-JSON frames.
      }
    }
  }
}

export async function speak(text: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/voice/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error(`speak failed: ${res.status}`);
  return res.blob();
}
