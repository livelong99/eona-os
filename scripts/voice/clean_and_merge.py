#!/usr/bin/env python3
"""Re-segment a timestamped recording into cleaner, fuller utterances for Piper.

Improves on segment_from_timestamps.py for ASR-captioned sources by:
  1. MERGING consecutive caption windows into ~--target-seconds utterances, so a
     phrase split across a caption boundary becomes internal to one clip.
  2. SNAPPING each cut to the quietest point near the boundary (local RMS
     minimum) so clips begin/end in a pause rather than mid-word.
  3. CLEANING text: collapse whitespace, capitalize, add terminal punctuation,
     and apply a small, high-confidence ASR-fix map. (Aggressive auto-correction
     is deliberately avoided — replacing a word the audio doesn't say misaligns
     text and audio, which hurts TTS training more than the typo did.)

Audio and text are regenerated TOGETHER from the same time spans, so every
``fileNNNN.wav`` still matches its ``metadata.csv`` line exactly. Output format is
the usual 22050 Hz mono 16-bit WAV + TextyMcSpeechy metadata.csv.

Usage:
    python3 scripts/voice/clean_and_merge.py \
        --audio scripts/voice/miles.mp3 \
        --transcript scripts/voice/transcript_with_timestamp.txt \
        --name miles_clean

Requires ffmpeg on PATH. Pure-Python audio analysis (no numpy).
"""
from __future__ import annotations

import argparse
import array
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path
from typing import List, NamedTuple

SAMPLE_RATE = 22050
CHANNELS = 1
SAMPWIDTH = 2
_TS = re.compile(r"^\s*\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*\S)?\s*$")

# High-confidence ASR fixes only (whole word, case-insensitive). "symbios" /
# bare "symbiot" are not English words and the actor clearly says the real ones,
# so fixing them makes the transcript MATCH the audio better. Keep this list
# tiny and obvious — see module docstring on why over-correcting is harmful.
_FIXES = {
    "symbios": "symbiotes",
    "symbiot": "symbiote",
    "symbio": "symbiote",
    "spider-man": "Spider-Man",
    "spiderman": "Spider-Man",
    "mj": "MJ",
    "nyc": "NYC",
}


class Seg(NamedTuple):
    start: float
    text: str


def _require_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("error: ffmpeg not found on PATH (macOS: brew install ffmpeg).")
    return ffmpeg


def parse_transcript(path: Path) -> List[Seg]:
    segs: List[Seg] = []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        m = _TS.match(raw)
        if not m:
            print(f"warning: line {lineno} has no [timestamp] — skipping")
            continue
        hh, mm, ss, text = m.group(1), m.group(2), m.group(3), (m.group(4) or "").strip()
        start = (int(hh) if hh else 0) * 3600 + int(mm) * 60 + int(ss)
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            segs.append(Seg(float(start), text))
    if not segs:
        sys.exit(f"error: no usable timestamped lines in {path}")
    return segs


def decode_to_pcm(ffmpeg: str, src: Path) -> "array.array":
    """Decode any input to a mono 22050 Hz 16-bit PCM sample array."""
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "full.wav"
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", str(src),
             "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS), "-sample_fmt", "s16", str(wav)],
            check=True, stdin=subprocess.DEVNULL, timeout=600,
        )
        with wave.open(str(wav), "rb") as wf:
            raw = wf.readframes(wf.getnframes())
    samples = array.array("h")
    samples.frombytes(raw)
    return samples


def snap_to_silence(samples: "array.array", t: float, win: float) -> float:
    """Return a time near ``t`` (±win) where short-window energy is lowest."""
    total = len(samples)
    frame = int(0.02 * SAMPLE_RATE)          # 20 ms energy window
    step = max(1, int(0.01 * SAMPLE_RATE))   # 10 ms search step
    lo = max(0, int((t - win) * SAMPLE_RATE))
    hi = min(total, int((t + win) * SAMPLE_RATE))
    best_c, best_e = int(t * SAMPLE_RATE), None
    c = lo
    while c < hi:
        a = max(0, c - frame // 2)
        b = min(total, c + frame // 2)
        e = 0
        for i in range(a, b):
            s = samples[i]
            e += s * s
        if best_e is None or e < best_e:
            best_e, best_c = e, c
        c += step
    return best_c / float(SAMPLE_RATE)


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\b\w+\b", lambda m: _FIXES.get(m.group(0).lower(), m.group(0)), text)
    if text:
        text = text[0].upper() + text[1:]
    if text and text[-1] not in ".!?":
        text += "."
    return text


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--audio", required=True)
    p.add_argument("--transcript", required=True)
    p.add_argument("--name", default="myvoice_clean")
    p.add_argument("--output", default=None)
    p.add_argument("--target-seconds", type=float, default=10.0, help="Aim for clips around this long (default 10).")
    p.add_argument("--max-seconds", type=float, default=15.0, help="Never exceed this per clip (default 15).")
    p.add_argument("--snap-window", type=float, default=0.35, help="± seconds to search for a quiet cut (default 0.35).")
    p.add_argument("--limit", type=int, default=0, help="Only emit first N clips (0 = all).")
    args = p.parse_args()

    ffmpeg = _require_ffmpeg()
    audio = Path(args.audio).expanduser()
    if not audio.exists():
        sys.exit(f"error: audio not found: {audio}")
    segs = parse_transcript(Path(args.transcript).expanduser())

    base = Path(args.output).expanduser() if args.output else Path(__file__).resolve().parents[2] / "voice-dataset"
    out_dir = base / args.name
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Decoding {audio.name} → 22050 Hz mono (once)…")
    samples = decode_to_pcm(ffmpeg, audio)
    total_s = len(samples) / float(SAMPLE_RATE)
    print(f"Decoded {total_s:.1f}s.\n")

    # Group consecutive captions into ~target-seconds utterances by their start
    # times (end of a caption = start of the next). Force-close before max.
    starts = [s.start for s in segs] + [total_s]
    group_start_idx: List[int] = [0]
    g0 = 0
    for i in range(1, len(segs)):
        if starts[i] - starts[g0] >= args.target_seconds or starts[i + 1] - starts[g0] > args.max_seconds:
            group_start_idx.append(i)
            g0 = i
    group_start_idx.append(len(segs))  # sentinel end

    # Snap each internal group boundary once, reuse for prev.end & next.start.
    boundary_time = {0: segs[0].start, len(segs): total_s}
    for gi in group_start_idx[1:-1]:
        boundary_time[gi] = snap_to_silence(samples, segs[gi].start, args.snap_window)

    meta: List[str] = []
    kept = 0
    for k in range(len(group_start_idx) - 1):
        a, b = group_start_idx[k], group_start_idx[k + 1]
        t0, t1 = boundary_time[a], boundary_time[b]
        if t1 - t0 < 0.6:
            continue
        text = clean_text(" ".join(s.text for s in segs[a:b]))
        if not text:
            continue
        s0, s1 = int(t0 * SAMPLE_RATE), int(t1 * SAMPLE_RATE)
        clip = array.array("h", samples[s0:s1])
        kept += 1
        clip_id = f"file{kept:04d}"
        with wave.open(str(out_dir / f"{clip_id}.wav"), "wb") as out:
            out.setnchannels(CHANNELS)
            out.setsampwidth(SAMPWIDTH)
            out.setframerate(SAMPLE_RATE)
            out.writeframes(clip.tobytes())
        meta.append(f"{clip_id}|{text}")
        if args.limit and kept >= args.limit:
            break

    (out_dir / "metadata.csv").write_text("\n".join(meta) + ("\n" if meta else ""), encoding="utf-8")
    print(f"Dataset: {out_dir}")
    print(f"  clips: {kept}  (merged from {len(segs)} caption fragments)")
    print("  text: whitespace + capitalization + terminal punctuation + conservative ASR fixes applied.")
    print("Next: train with TextyMcSpeechy (scripts/voice/README.md). For best quality, "
          "skim metadata.csv and fix any lines that clearly mishear the audio.")


if __name__ == "__main__":
    main()
