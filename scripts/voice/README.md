# Custom Piper voice for Hermes

Record your own voice, train a Piper model with
[TextyMcSpeechy](https://github.com/domesticatedviking/TextyMcSpeechy), and plug
the resulting `.onnx` into the Hermes `piper` TTS provider. The dashboard mic and
messaging-voice replies will then speak in your voice.

## 1. Build the dataset — pick ONE path

### Path A — bring your own audio + transcripts (`prepare_dataset.py`)

Use this when you already have clips (mp3/wav/…) and the text spoken in each.
Needs `ffmpeg` on PATH (`brew install ffmpeg`); no Python audio deps. Every clip
is normalized to **22050 Hz mono 16-bit WAV** and a TextyMcSpeechy `metadata.csv`
is written.

Each clip must be ONE utterance (ideally 1–15s) paired with its exact
transcript. Supply pairs either way:

```bash
# (1) a manifest:  audio|text  per line  (delimiter auto: '|', TAB, or first comma)
python3 scripts/voice/prepare_dataset.py --name myvoice \
    --manifest /path/to/clips/manifest.txt --roomtone /path/to/silence.wav

# manifest.txt
#   intro.wav|Hello, this is my voice.
#   line02.mp3|The quick brown fox jumps over the lazy dog.

# (2) a folder where each clip.wav has a sidecar clip.txt transcript
python3 scripts/voice/prepare_dataset.py --name myvoice --audio-dir /path/to/clips
```

Output: `voice-dataset/myvoice/file0001.wav …` + `metadata.csv`. Long clips
(>15s) and very short ones (<1s) are flagged but not dropped — trim outliers for
best results. Forced alignment of one long file to a flat transcript is out of
scope; ask for the Whisper-segmentation variant if that's what you have.

### Path C — one long file + a timestamped transcript (`segment_from_timestamps.py`)

When you have a single long recording and a transcript whose lines look like
`[HH:MM:SS] text`, the timestamps give exact alignment — each one is a cut point:

```bash
python3 scripts/voice/segment_from_timestamps.py \
    --audio scripts/voice/miles.mp3 \
    --transcript scripts/voice/transcript_with_timestamp.txt \
    --name miles
# first pass on a subset (50–200 sweet spot):
... --limit 150
```

The source is decoded to 22050 Hz mono once, then sliced by sample offset (no
per-clip ffmpeg). Each clip is capped at `--max-seconds` (default 12) so trailing
silence before the next caption is trimmed and text stays aligned. Output is the
usual `voice-dataset/<name>/` + `metadata.csv`.

Caveats for this path: ASR-style transcripts carry word errors and break
mid-sentence — usable for fine-tuning, but cleaning `metadata.csv` improves the
voice. Make sure the recording is **predominantly one speaker** (mixed voices
muddy the clone).

### Path B — record fresh with your mic

```bash
pip install sounddevice numpy        # one-time
python3 scripts/voice/record_dataset.py --name myvoice
# pick a mic first if needed:
python3 scripts/voice/record_dataset.py --list-devices
python3 scripts/voice/record_dataset.py --name myvoice --device 2
```

- Reads `scripts/voice/recording_prompts.txt` (~100 assistant-flavored prompts —
  inside TextyMcSpeechy's 50–200 sweet spot).
- Per prompt: **ENTER** to start, **ENTER** to stop, then keep / redo / skip.
- Writes `voice-dataset/myvoice/` containing `file0001.wav …` plus a
  `metadata.csv` in TextyMcSpeechy format (`filename|transcription`).
- The **first** prompt is `roomtone` — record ~20s of silence so the trainer can
  remove background noise. **Do not** copy the roomtone wav into the training set
  (TextyMcSpeechy uses it for noise profiling, then warns if it's left in).

**Recording tips:** quiet room, consistent mic distance and tone, no clipping,
trim long leading/trailing silence. Output is exactly what Piper wants:
**22050 Hz, mono, 16-bit PCM WAV.**

## 2. Train with TextyMcSpeechy

```bash
git clone https://github.com/domesticatedviking/TextyMcSpeechy
cd TextyMcSpeechy
# Place the dataset where the dojo expects it:
mkdir -p tts_dojo/DATASETS/myvoice
cp -r /path/to/agent-home/voice-dataset/myvoice/* tts_dojo/DATASETS/myvoice/
# (remove the roomtone wav from the folder if present, keep its metadata line)

./create_dataset.sh        # configure + preprocess (makes 22050/16000 wavs)
./run_training.sh          # fine-tunes from a pretrained medium/high checkpoint
```

Training runs in a tmux session; monitor until quality is good, then export.
The exported model lands in `tts_dojo/tts_voices/` as a Piper-named pair, e.g.
`en_US-myvoice_1234-medium.onnx` **and** `en_US-myvoice_1234-medium.onnx.json`.
You need **both** files.

## 3. Plug it into Hermes

The engine's piper provider accepts a direct path to an `.onnx`
(`tools/tts_tool.py` → `_resolve_piper_voice_path`, Case 1). The hermes container
mounts `~/.hermes` at `/opt/data`, so:

```bash
mkdir -p ~/.hermes/voices
cp en_US-myvoice_1234-medium.onnx       ~/.hermes/voices/
cp en_US-myvoice_1234-medium.onnx.json  ~/.hermes/voices/   # keep the .json next to it
```

Then set the provider + voice in `hermes/config.yaml` (re-seeded to
`~/.hermes/config.yaml` by `scripts/install.sh`):

```yaml
tts:
  enabled: true
  provider: piper
  piper:
    # In-container path (host: ~/.hermes/voices/...). The .onnx.json must sit
    # beside the .onnx with the same basename.
    voice: /opt/data/voices/en_US-myvoice_1234-medium.onnx
    # Optional synthesis knobs:
    length_scale: 1.0     # >1 slower, <1 faster
    noise_scale: 0.667
    noise_w_scale: 0.8
    volume: 1.0
    normalize_audio: true
```

Restart and verify:

```bash
docker compose restart hermes
# from the dashboard mic, or directly:
curl -s -X POST http://127.0.0.1:8642/voice/speak \
  -H "authorization: Bearer $API_SERVER_KEY" \
  -H 'content-type: application/json' \
  -d '{"text":"This is my custom voice."}' --output sample.mp3 && open sample.mp3
```

### Alternative: command-type provider
If you'd rather drive the `piper` CLI than the in-process engine, Hermes also
supports a command provider (no Python changes — `tools/tts_tool.py` header):

```yaml
tts:
  provider: piper-custom
  providers:
    piper-custom:
      type: command
      command: "piper -m /opt/data/voices/en_US-myvoice_1234-medium.onnx -f {output_path} < {input_path}"
```
