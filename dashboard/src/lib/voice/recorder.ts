// Mic capture with voice-activity endpointing: records until the speaker goes
// quiet for `silenceMs` (or `maxMs` elapses), then resolves the utterance as a
// webm/opus Blob ready for the transcribe call.

interface RecordOptions {
  stream: MediaStream;
  silenceMs?: number;
  maxMs?: number;
  /** RMS below this (0–1) counts as silence. */
  threshold?: number;
  signal?: AbortSignal;
}

export async function recordUtterance({
  stream,
  silenceMs = 900,
  maxMs = 12000,
  threshold = 0.012,
  signal,
}: RecordOptions): Promise<Blob> {
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  return new Promise<Blob>((resolve, reject) => {
    let raf = 0;
    let lastVoice = performance.now();
    let sawVoice = false;
    const started = performance.now();

    const cleanup = () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      audioCtx.close().catch(() => {});
    };

    const stop = () => {
      if (recorder.state !== "inactive") recorder.stop();
    };

    recorder.onstop = () => {
      cleanup();
      resolve(new Blob(chunks, { type: mime }));
    };

    if (signal) {
      signal.addEventListener("abort", () => {
        cleanup();
        if (recorder.state !== "inactive") recorder.stop();
        reject(new DOMException("aborted", "AbortError"));
      });
    }

    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();

      if (rms > threshold) {
        lastVoice = now;
        sawVoice = true;
      }
      const quietFor = now - lastVoice;
      const elapsed = now - started;

      if ((sawVoice && quietFor > silenceMs) || elapsed > maxMs) {
        stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    recorder.start();
    raf = requestAnimationFrame(tick);
  });
}
