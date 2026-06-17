// Browser voice helpers for the dashboard mic. STT/TTS round-trip through the
// same-origin /api/hermes proxy (which attaches the engine bearer server-side),
// so no API key ever reaches the browser. Backed by the engine's
// /voice/transcribe and /voice/speak endpoints (gateway/platforms/api_server.py).

const BASE = "/api/hermes";

export interface Recorder {
  stop: () => Promise<Blob>;
}

/**
 * Start microphone capture. Returns a controller whose stop() resolves to the
 * recorded audio Blob (webm/opus where supported). Rejects if mic access is
 * denied or MediaRecorder is unavailable.
 */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start();
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      }),
  };
}

/** Send recorded audio to the engine STT endpoint; returns the transcript. */
export async function transcribe(blob: Blob): Promise<string> {
  const res = await fetch(`${BASE}/voice/transcribe`, {
    method: "POST",
    headers: { "content-type": blob.type || "audio/webm" },
    body: blob,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`transcribe failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

/** Synthesize speech for `text` and play it back. No-op on empty text. */
export async function speak(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const res = await fetch(`${BASE}/voice/speak`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: trimmed }),
  });
  if (!res.ok) throw new Error(`speak failed (${res.status})`);
  const buf = await res.arrayBuffer();
  const type = res.headers.get("content-type") ?? "audio/mpeg";
  const url = URL.createObjectURL(new Blob([buf], { type }));
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  try {
    await audio.play();
  } catch {
    URL.revokeObjectURL(url);
  }
}
