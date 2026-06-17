#!/usr/bin/env python3
"""Build a Piper / TextyMcSpeechy dataset from audio you already have + transcripts.

Use this when you bring your own clips (mp3/wav/flac/m4a/…) together with the
text spoken in each. It normalizes every clip to the format Piper training
expects — 22050 Hz, mono, 16-bit PCM WAV — and writes a TextyMcSpeechy
``metadata.csv`` (``filename|transcription``, no extension). Output matches what
record_dataset.py produces, so it drops straight into
``tts_dojo/DATASETS/<name>/``.

This is the SUPERVISED, pre-segmented path: each input clip must be ONE
utterance (ideally 1–15s) paired with its exact transcript. Long, unsegmented
recordings are flagged but not split (forced alignment is out of scope here —
ask for the Whisper segmentation variant if you need it).

Two ways to supply the pairs:

  1) Manifest file — one ``audio|text`` line per clip (delimiter auto-detected:
     '|', then TAB, then the first comma). Audio paths may be absolute or
     relative to the manifest's folder:

         python3 scripts/voice/prepare_dataset.py --name myvoice \
             --manifest /path/to/clips/manifest.txt

         # manifest.txt
         intro.wav|Hello, this is my voice.
         line02.mp3|The quick brown fox jumps over the lazy dog.

  2) Audio dir with sidecar .txt — each ``clip.wav`` has a ``clip.txt`` holding
     its transcript:

         python3 scripts/voice/prepare_dataset.py --name myvoice \
             --audio-dir /path/to/clips

Optional roomtone (recommended): a ~20s silence clip for noise profiling:

         ... --roomtone /path/to/silence.wav

Requires ffmpeg on PATH (brew install ffmpeg). No Python audio deps.
"""
from __future__ import annotations

import argparse
import contextlib
import shutil
import subprocess
import sys
import wave
from pathlib import Path
from typing import List, NamedTuple, Optional

SAMPLE_RATE = 22050
CHANNELS = 1
MIN_S, MAX_S = 1.0, 15.0  # TextyMcSpeechy sweet spot per clip
AUDIO_EXTS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".opus", ".mp4", ".webm"}


class Pair(NamedTuple):
    audio: Path
    text: str


def _require_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("error: ffmpeg not found on PATH. Install it (macOS: brew install ffmpeg).")
    return ffmpeg


def _split_pair(line: str) -> Optional[tuple[str, str]]:
    """Split a manifest line into (audio, text). Prefer '|', then TAB, then comma."""
    for delim in ("|", "\t"):
        if delim in line:
            a, t = line.split(delim, 1)
            return a.strip(), t.strip()
    if "," in line:
        a, t = line.split(",", 1)
        return a.strip(), t.strip()
    return None


def load_from_manifest(path: Path) -> List[Pair]:
    base = path.parent
    pairs: List[Pair] = []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parsed = _split_pair(line)
        if not parsed:
            print(f"warning: line {lineno} has no delimiter — skipping: {line!r}")
            continue
        audio_ref, text = parsed
        if not audio_ref or not text:
            print(f"warning: line {lineno} missing audio or text — skipping")
            continue
        audio = (base / audio_ref).expanduser() if not Path(audio_ref).is_absolute() else Path(audio_ref)
        if not audio.exists():
            print(f"warning: line {lineno} audio not found, skipping: {audio}")
            continue
        pairs.append(Pair(audio, text))
    return pairs


def load_from_audio_dir(audio_dir: Path) -> List[Pair]:
    pairs: List[Pair] = []
    for audio in sorted(audio_dir.iterdir()):
        if audio.suffix.lower() not in AUDIO_EXTS:
            continue
        sidecar = audio.with_suffix(".txt")
        if not sidecar.exists():
            print(f"warning: no transcript ({sidecar.name}) for {audio.name} — skipping")
            continue
        text = sidecar.read_text(encoding="utf-8").strip()
        if not text:
            print(f"warning: empty transcript for {audio.name} — skipping")
            continue
        pairs.append(Pair(audio, text))
    return pairs


def convert(ffmpeg: str, src: Path, dst: Path) -> None:
    """Resample/encode any input to 22050 Hz mono 16-bit PCM WAV."""
    cmd = [
        ffmpeg, "-y", "-loglevel", "error", "-i", str(src),
        "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "-sample_fmt", "s16",
        str(dst),
    ]
    subprocess.run(cmd, check=True, stdin=subprocess.DEVNULL, timeout=120)


def wav_duration_s(path: Path) -> float:
    with contextlib.closing(wave.open(str(path), "rb")) as wf:
        return wf.getnframes() / float(wf.getframerate() or SAMPLE_RATE)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--name", default="myvoice", help="Voice/dataset name (output subdir).")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--manifest", help="Manifest file: 'audio|text' per line.")
    src.add_argument("--audio-dir", help="Folder of audio + sidecar .txt transcripts.")
    parser.add_argument("--roomtone", help="Optional ~20s silence clip for noise profiling.")
    parser.add_argument(
        "--output", default=None,
        help="Output base dir (default: <repo>/voice-dataset). Dataset goes in <output>/<name>.",
    )
    args = parser.parse_args()

    ffmpeg = _require_ffmpeg()

    if args.manifest:
        pairs = load_from_manifest(Path(args.manifest).expanduser())
    else:
        pairs = load_from_audio_dir(Path(args.audio_dir).expanduser())
    if not pairs:
        sys.exit("error: no usable (audio, transcript) pairs found.")

    base = Path(args.output).expanduser() if args.output else Path(__file__).resolve().parents[2] / "voice-dataset"
    out_dir = base / args.name
    out_dir.mkdir(parents=True, exist_ok=True)

    meta: List[str] = []
    too_short = too_long = 0

    # Roomtone first (kept in metadata; do NOT count toward clip stats).
    if args.roomtone:
        rt = Path(args.roomtone).expanduser()
        if not rt.exists():
            sys.exit(f"error: roomtone file not found: {rt}")
        convert(ffmpeg, rt, out_dir / "roomtone.wav")
        meta.append("roomtone|Please record about twenty seconds of silence to capture the room tone.")
        print("roomtone.wav  (remove from the training folder before run_training.sh; keep its metadata line)")

    for i, pair in enumerate(pairs, 1):
        clip_id = f"file{i:04d}"
        dst = out_dir / f"{clip_id}.wav"
        try:
            convert(ffmpeg, pair.audio, dst)
        except subprocess.CalledProcessError as exc:
            print(f"  ✗ {pair.audio.name}: ffmpeg failed ({exc}) — skipping")
            continue
        except subprocess.TimeoutExpired:
            print(f"  ✗ {pair.audio.name}: ffmpeg timed out — skipping")
            continue

        dur = wav_duration_s(dst)
        flag = ""
        if dur < MIN_S:
            too_short += 1
            flag = f"  ⚠ {dur:.1f}s (<{MIN_S:g}s — very short)"
        elif dur > MAX_S:
            too_long += 1
            flag = f"  ⚠ {dur:.1f}s (>{MAX_S:g}s — consider splitting)"
        meta.append(f"{clip_id}|{pair.text}")
        print(f"  ✓ {clip_id}  {pair.audio.name}  {dur:.1f}s{flag}")

    (out_dir / "metadata.csv").write_text("\n".join(meta) + ("\n" if meta else ""), encoding="utf-8")

    clips = len(meta) - (1 if args.roomtone else 0)
    print(f"\nDataset: {out_dir}")
    print(f"  clips: {clips}   metadata.csv lines: {len(meta)}")
    if clips < 50:
        print(f"  note: {clips} clips is below TextyMcSpeechy's 50–200 sweet spot — more is better.")
    if too_short or too_long:
        print(f"  warnings: {too_short} under {MIN_S:g}s, {too_long} over {MAX_S:g}s "
              "(fine-tuning is forgiving, but trim outliers for best results).")
    print("Next: train with TextyMcSpeechy (see scripts/voice/README.md), then set "
          "tts.piper.voice to the exported .onnx.")


if __name__ == "__main__":
    main()
