#!/usr/bin/env python3
"""Slice one long audio file into a Piper dataset using a timestamped transcript.

Input: a single audio file (any format ffmpeg reads) plus a transcript whose
lines look like ``[HH:MM:SS] text spoken from that moment``. Each timestamp marks
a segment boundary, so we cut the audio between consecutive timestamps and pair
each clip with its line of text — exact alignment, no guessing.

Output: ``<output>/<name>/file0001.wav …`` (22050 Hz mono 16-bit) + a
TextyMcSpeechy ``metadata.csv`` (``filename|transcription``). Drops straight into
``tts_dojo/DATASETS/<name>/``.

Efficiency: the source is decoded to a 22050 Hz mono WAV exactly once, then
sliced in memory by sample offset — no per-segment ffmpeg spawns.

Trailing-silence guard: ASR captions start at speech onset, so each clip is
capped at ``--max-seconds`` from its timestamp. When the gap to the next caption
is longer than that (a pause/silence), only the leading speech is kept and the
dead air is dropped — which keeps text and audio aligned.

Usage:
    python3 scripts/voice/segment_from_timestamps.py \
        --audio scripts/voice/miles.mp3 \
        --transcript scripts/voice/transcript_with_timestamp.txt \
        --name miles
    # quick subset (TextyMcSpeechy's 50–200 sweet spot):
    ... --limit 200

Requires ffmpeg on PATH (brew install ffmpeg). No Python audio deps.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path
from typing import List, NamedTuple, Optional

SAMPLE_RATE = 22050
CHANNELS = 1
SAMPWIDTH = 2  # 16-bit
_TS = re.compile(r"^\s*\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*\S)?\s*$")


class Seg(NamedTuple):
    start: float
    text: str


def _require_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("error: ffmpeg not found on PATH. Install it (macOS: brew install ffmpeg).")
    return ffmpeg


def parse_transcript(path: Path) -> List[Seg]:
    """Parse ``[HH:MM:SS] text`` (or ``[MM:SS]``) lines into (start_seconds, text)."""
    segs: List[Seg] = []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        m = _TS.match(raw)
        if not m:
            print(f"warning: line {lineno} has no [timestamp] prefix — skipping")
            continue
        hh, mm, ss, text = m.group(1), m.group(2), m.group(3), (m.group(4) or "").strip()
        start = (int(hh) if hh else 0) * 3600 + int(mm) * 60 + int(ss)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        segs.append(Seg(float(start), text))
    if not segs:
        sys.exit(f"error: no usable timestamped lines found in {path}")
    return segs


def decode_to_wav(ffmpeg: str, src: Path, dst: Path) -> None:
    cmd = [
        ffmpeg, "-y", "-loglevel", "error", "-i", str(src),
        "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "-sample_fmt", "s16", str(dst),
    ]
    subprocess.run(cmd, check=True, stdin=subprocess.DEVNULL, timeout=600)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--audio", required=True, help="Source audio file (mp3/wav/…).")
    parser.add_argument("--transcript", required=True, help="Timestamped transcript ([HH:MM:SS] text per line).")
    parser.add_argument("--name", default="myvoice", help="Voice/dataset name (output subdir).")
    parser.add_argument("--output", default=None, help="Output base dir (default: <repo>/voice-dataset).")
    parser.add_argument("--max-seconds", type=float, default=12.0, help="Cap per clip; trims trailing silence (default 12).")
    parser.add_argument("--min-seconds", type=float, default=1.0, help="Drop clips shorter than this (default 1.0).")
    parser.add_argument("--limit", type=int, default=0, help="Only emit the first N clips (0 = all).")
    args = parser.parse_args()

    ffmpeg = _require_ffmpeg()
    audio = Path(args.audio).expanduser()
    if not audio.exists():
        sys.exit(f"error: audio not found: {audio}")
    segs = parse_transcript(Path(args.transcript).expanduser())

    base = Path(args.output).expanduser() if args.output else Path(__file__).resolve().parents[2] / "voice-dataset"
    out_dir = base / args.name
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        full = Path(td) / "full.wav"
        print(f"Decoding {audio.name} → 22050 Hz mono (once)…")
        decode_to_wav(ffmpeg, audio, full)
        with wave.open(str(full), "rb") as wf:
            n_frames = wf.getnframes()
            frames = wf.readframes(n_frames)  # raw 16-bit mono PCM bytes
        total_s = n_frames / float(SAMPLE_RATE)
        print(f"Decoded {total_s:.1f}s ({n_frames} frames).\n")

        meta: List[str] = []
        kept = skipped_short = capped = 0
        idx = 0
        for i, seg in enumerate(segs):
            nxt = segs[i + 1].start if i + 1 < len(segs) else total_s
            end = min(nxt, seg.start + args.max_seconds, total_s)
            if nxt - seg.start > args.max_seconds:
                capped += 1
            dur = end - seg.start
            if dur < args.min_seconds:
                skipped_short += 1
                continue

            s0 = int(seg.start * SAMPLE_RATE)
            s1 = int(end * SAMPLE_RATE)
            chunk = frames[s0 * SAMPWIDTH:s1 * SAMPWIDTH]
            if len(chunk) < int(args.min_seconds * SAMPLE_RATE) * SAMPWIDTH:
                skipped_short += 1
                continue

            idx += 1
            clip_id = f"file{idx:04d}"
            with wave.open(str(out_dir / f"{clip_id}.wav"), "wb") as out:
                out.setnchannels(CHANNELS)
                out.setsampwidth(SAMPWIDTH)
                out.setframerate(SAMPLE_RATE)
                out.writeframes(chunk)
            meta.append(f"{clip_id}|{seg.text}")
            kept += 1
            if args.limit and kept >= args.limit:
                break

    (out_dir / "metadata.csv").write_text("\n".join(meta) + ("\n" if meta else ""), encoding="utf-8")

    print(f"Dataset: {out_dir}")
    print(f"  clips kept: {kept}   skipped (too short): {skipped_short}   capped to max-seconds: {capped}")
    if kept > 200:
        print(f"  note: {kept} clips is large — great for quality but slower to train. "
              f"Use --limit 150 for a quick first pass.")
    elif kept < 50:
        print(f"  note: {kept} clips is below TextyMcSpeechy's 50–200 sweet spot.")
    print("Next: train with TextyMcSpeechy (see scripts/voice/README.md), then set "
          "tts.piper.voice to the exported .onnx.")


if __name__ == "__main__":
    main()
