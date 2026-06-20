// openWakeWord in the browser (onnxruntime-web) — keyless, offline wake-word
// spotting. Pipeline (per the openWakeWord project, v0.5.1 models):
//   16 kHz audio (int16 magnitude) → melspectrogram model → [time, 32] mel frames
//                → normalize (mel/10 + 2)
//                → embedding model over a sliding 76-frame window, stride 8
//                → wakeword model over a rolling 16-embedding window → score
//
// Verified model I/O (onnxruntime introspection of the v0.5.1 release models):
//   melspectrogram: in 'input' [batch, samples] → out 'output' [time, 1, dim, 32]
//   embedding:      in 'input_1' [batch, 76, 32, 1] → out 'conv2d_19' [batch, 1, 1, 96]
//   hey_jarvis:     in 'x.1' [1, 16, 96] → out '53' [1, 1] (sigmoid score)
//
// Calibration (engine-synthesized "hey jarvis" WAV vs. silence): the wake phrase
// peaks at ~0.996 while silence and non-wake audio stay at ~0.000, so THRESHOLD
// 0.5 sits in a wide dead zone. Re-calibrate against your mic if it over/under-fires.
//
// Models live in /models/oww/ (see public/models/oww/README). If they're absent
// or fail to load, load() returns null and the caller falls back to push-to-talk.
//
// onnxruntime-web (a ~26 MB WASM runtime) is dynamically imported ONLY after the
// model files are confirmed present, so the default push-to-talk path ships none
// of it. Types are imported type-only (erased at build).
import type * as Ort from "onnxruntime-web";

const MODEL_DIR = "/models/oww";
const MEL_BINS = 32; // mel frequency bins per frame
const MEL_FRAMES = 76; // embedding model window (mel frames)
const MEL_STRIDE = 8; // new mel frames between embedding computations
const MEL_PER_CHUNK = 8; // new mel frames produced per CHUNK (1280 / 160 hop)
const EMB_WINDOW = 16; // wakeword model window (embeddings)
const CHUNK = 1280; // 80 ms @ 16 kHz — openWakeWord's frame step
// Left-context for the mel STFT: the model drops ~3 frames at each window edge,
// so we run it over a rolling window of recent audio (CHUNK_CTX + 1 chunks) and
// keep only the MEL_PER_CHUNK newest frames — matching a full-clip mel exactly.
const CHUNK_CTX = 2;
const MEL_WIN_SAMPLES = CHUNK * (CHUNK_CTX + 1);
const THRESHOLD = 0.5; // see calibration note above
const COOLDOWN_MS = 2000;

export interface WakeWord {
  /** Begin processing a 16 kHz mono mic stream; calls onWake on detection. */
  start(stream: MediaStream, onWake: () => void): void;
  stop(): void;
}

async function exists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function loadWakeWord(modelFile = "hey_jarvis.onnx"): Promise<WakeWord | null> {
  // Cheap gate: if the models aren't deployed, never pull the WASM runtime.
  const present = await exists(`${MODEL_DIR}/${modelFile}`);
  if (!present) return null;

  const ort = await import("onnxruntime-web");
  ort.env.wasm.numThreads = 1;
  // Self-hosted runtime files (public/ort) — without this, onnxruntime can't
  // locate its .wasm under Vite's hashed asset names and session creation
  // throws, silently disabling the wake word. Offline, no CDN.
  ort.env.wasm.wasmPaths = "/ort/";
  const load = (name: string) => ort.InferenceSession.create(`${MODEL_DIR}/${name}`);
  let mel: Ort.InferenceSession, emb: Ort.InferenceSession, ww: Ort.InferenceSession;
  try {
    [mel, emb, ww] = await Promise.all([
      load("melspectrogram.onnx"),
      load("embedding_model.onnx"),
      load(modelFile),
    ]);
  } catch {
    return null;
  }
  const Tensor = ort.Tensor;

  let melBuf: number[][] = [];
  let embBuf: number[][] = [];
  let audioCtx: AudioContext | null = null;
  let node: ScriptProcessorNode | null = null;
  let src: MediaStreamAudioSourceNode | null = null;
  let pcm: number[] = [];
  let rawWin: number[] = []; // rolling raw-audio window for the mel STFT
  let lastFire = 0;
  let running = false;

  const inName = (s: Ort.InferenceSession) => s.inputNames[0];
  const outName = (s: Ort.InferenceSession) => s.outputNames[0];

  // # of mel frames consumed since the last embedding was computed; once we have
  // a full 76-frame window we emit an embedding every MEL_STRIDE (8) new frames.
  let melSinceEmb = MEL_STRIDE;

  const computeEmbedding = async (): Promise<Float32Array> => {
    // openWakeWord normalizes mel energies before the embedding model.
    const win = melBuf.slice(-MEL_FRAMES);
    const flat = new Float32Array(MEL_FRAMES * MEL_BINS);
    for (let f = 0; f < MEL_FRAMES; f++) {
      const row = win[f];
      for (let b = 0; b < MEL_BINS; b++) flat[f * MEL_BINS + b] = row[b] / 10 + 2;
    }
    const embOut = await emb.run({
      [inName(emb)]: new Tensor("float32", flat, [1, MEL_FRAMES, MEL_BINS, 1]),
    });
    return embOut[outName(emb)].data as Float32Array; // 96-d
  };

  const runChunk = async (samples: Float32Array, onWake: () => void) => {
    // Maintain a rolling raw-audio window so the mel STFT keeps its left-context;
    // running it per isolated CHUNK would fragment the spectrogram at frame edges.
    for (let i = 0; i < samples.length; i++) rawWin.push(samples[i]);
    if (rawWin.length > MEL_WIN_SAMPLES) rawWin = rawWin.slice(-MEL_WIN_SAMPLES);
    if (rawWin.length < MEL_WIN_SAMPLES) return; // still priming the buffer

    // openWakeWord feeds int16-magnitude samples, not normalized [-1, 1] floats.
    const pcm16 = new Float32Array(rawWin.length);
    for (let i = 0; i < rawWin.length; i++) pcm16[i] = rawWin[i] * 32767;

    // mel: [1, N] → output [time, 1, dim, 32]; the trailing axis is the 32 bins.
    // Keep only the MEL_PER_CHUNK newest frames — the rest are recomputed context.
    const melOut = await mel.run({
      [inName(mel)]: new Tensor("float32", pcm16, [1, pcm16.length]),
    });
    const m = melOut[outName(mel)];
    const data = m.data as Float32Array;
    const total = data.length / MEL_BINS;
    const startFrame = Math.max(0, total - MEL_PER_CHUNK);
    for (let f = startFrame; f < total; f++) {
      melBuf.push(Array.from(data.subarray(f * MEL_BINS, (f + 1) * MEL_BINS)));
    }
    // Keep a little slack beyond the window so striding has room.
    const maxMel = MEL_FRAMES + MEL_STRIDE * 4;
    if (melBuf.length > maxMel) melBuf = melBuf.slice(-maxMel);
    if (melBuf.length < MEL_FRAMES) return;

    // Emit one embedding per MEL_STRIDE new mel frames (sliding 76-frame window).
    melSinceEmb += total - startFrame;
    let fired = false;
    while (melSinceEmb >= MEL_STRIDE) {
      melSinceEmb -= MEL_STRIDE;
      const e = await computeEmbedding();
      embBuf.push(Array.from(e));
      if (embBuf.length > EMB_WINDOW) embBuf = embBuf.slice(-EMB_WINDOW);
      if (embBuf.length < EMB_WINDOW) continue;

      // wakeword: [1, 16, 96] → score
      const flatEmb = Float32Array.from(embBuf.flat());
      const wwOut = await ww.run({
        [inName(ww)]: new Tensor("float32", flatEmb, [1, EMB_WINDOW, embBuf[0].length]),
      });
      const score = (wwOut[outName(ww)].data as Float32Array)[0];
      const now = performance.now();
      if (score > THRESHOLD && now - lastFire > COOLDOWN_MS) {
        lastFire = now;
        embBuf = [];
        fired = true;
      }
    }
    if (fired) onWake();
  };

  return {
    start(stream, onWake) {
      running = true;
      audioCtx = new AudioContext({ sampleRate: 16000 });
      src = audioCtx.createMediaStreamSource(stream);
      node = audioCtx.createScriptProcessor(2048, 1, 1);
      src.connect(node);
      node.connect(audioCtx.destination);
      node.onaudioprocess = (ev) => {
        if (!running) return;
        const input = ev.inputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i++) pcm.push(input[i]);
        while (pcm.length >= CHUNK) {
          const slice = Float32Array.from(pcm.slice(0, CHUNK));
          pcm = pcm.slice(CHUNK);
          void runChunk(slice, onWake);
        }
      };
    },
    stop() {
      running = false;
      node?.disconnect();
      src?.disconnect();
      audioCtx?.close().catch(() => {});
      melBuf = [];
      embBuf = [];
      pcm = [];
      rawWin = [];
      melSinceEmb = MEL_STRIDE;
    },
  };
}
