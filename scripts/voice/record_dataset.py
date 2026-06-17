#!/usr/bin/env python3
"""Record a custom-voice dataset for Piper / TextyMcSpeechy.

Reads a prompt list (``id|text`` per line), records one WAV per prompt at the
format Piper training expects — 22050 Hz, mono, 16-bit PCM — and maintains a
``metadata.csv`` in TextyMcSpeechy's format (``filename|transcription``, no file
extension; first line the ``roomtone`` clip).

Per prompt:  ENTER to start  →  ENTER to stop  →  playback  →  keep / redo / skip.
Already-recorded prompts are skipped on the next run, so you can record in
sessions. Output drops straight into a folder you can hand to TextyMcSpeechy's
``create_dataset.sh`` (point it at this folder, or copy it into
``tts_dojo/DATASETS/<voicename>/``).

Usage:
    python3 scripts/voice/record_dataset.py --name myvoice
    python3 scripts/voice/record_dataset.py --list-devices
    python3 scripts/voice/record_dataset.py --name myvoice --device 2

Requires: sounddevice + numpy  (pip install sounddevice numpy).
On macOS, grant microphone permission to your terminal app the first time.
"""
from __future__ import annotations

import argparse
import sys
import wave
from pathlib import Path
from typing import List, NamedTuple

SAMPLE_RATE = 22050  # Piper training target (preprocessing also derives 16000).
CHANNELS = 1
SAMPWIDTH = 2  # bytes -> 16-bit PCM


class Prompt(NamedTuple):
    id: str
    text: str


def _import_audio():
    """Lazy-import the audio stack with a friendly install hint."""
    try:
        import numpy as np  # noqa: F401
        import sounddevice as sd  # noqa: F401
    except ImportError as exc:  # pragma: no cover - environment hint
        sys.exit(
            f"Missing audio dependency: {exc}\n"
            "Install with:  pip install sounddevice numpy\n"
            "(macOS: also grant your terminal Microphone access in System Settings.)"
        )
    return np, sd


def parse_prompts(path: Path) -> List[Prompt]:
    """Parse ``id|text`` lines, skipping blanks and ``#`` comments."""
    prompts: List[Prompt] = []
    seen: set[str] = set()
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "|" not in line:
            print(f"warning: line {lineno} has no '|' separator — skipping: {line!r}")
            continue
        pid, text = line.split("|", 1)
        pid, text = pid.strip(), text.strip()
        if not pid or not text:
            print(f"warning: line {lineno} missing id or text — skipping")
            continue
        if pid in seen:
            sys.exit(f"error: duplicate prompt id {pid!r} on line {lineno}")
        seen.add(pid)
        prompts.append(Prompt(pid, text))
    if not prompts:
        sys.exit(f"error: no usable prompts found in {path}")
    return prompts


def write_metadata(out_dir: Path, prompts: List[Prompt]) -> int:
    """(Re)write metadata.csv for every prompt that has a recorded WAV.

    Order follows the prompt file. Returns the number of entries written.
    """
    lines: List[str] = []
    for p in prompts:
        if (out_dir / f"{p.id}.wav").exists():
            lines.append(f"{p.id}|{p.text}")
    (out_dir / "metadata.csv").write_text(
        "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8"
    )
    return len(lines)


def record_once(sd, np) -> "np.ndarray":
    """Record from the default (or selected) input until the user presses ENTER.

    Returns an int16 mono numpy array.
    """
    frames: List["np.ndarray"] = []

    def callback(indata, _frames, _time, status):
        if status:
            print(f"  (audio status: {status})", file=sys.stderr)
        frames.append(indata.copy())

    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16", callback=callback
    ):
        input("  ● recording… press ENTER to stop")
    if not frames:
        return np.zeros((0, CHANNELS), dtype="int16")
    return np.concatenate(frames, axis=0)


def save_wav(path: Path, audio, np) -> None:
    """Write an int16 mono array as a 22050 Hz 16-bit PCM WAV."""
    data = np.asarray(audio, dtype="int16").reshape(-1)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPWIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(data.tobytes())


def _duration_s(audio, np) -> float:
    return float(np.asarray(audio).shape[0]) / SAMPLE_RATE


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="myvoice", help="Voice/dataset name (output subdir).")
    parser.add_argument(
        "--prompts",
        default=str(Path(__file__).with_name("recording_prompts.txt")),
        help="Prompt list file (id|text per line).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output base dir (default: <repo>/voice-dataset). Dataset goes in <output>/<name>.",
    )
    parser.add_argument("--device", type=int, default=None, help="Input device index (see --list-devices).")
    parser.add_argument("--list-devices", action="store_true", help="List audio devices and exit.")
    args = parser.parse_args()

    np, sd = _import_audio()

    if args.list_devices:
        print(sd.query_devices())
        return
    if args.device is not None:
        sd.default.device = (args.device, None)

    prompts = parse_prompts(Path(args.prompts).expanduser())
    base = Path(args.output).expanduser() if args.output else Path(__file__).resolve().parents[2] / "voice-dataset"
    out_dir = base / args.name
    out_dir.mkdir(parents=True, exist_ok=True)

    done = sum(1 for p in prompts if (out_dir / f"{p.id}.wav").exists())
    print(f"Dataset: {out_dir}")
    print(f"Prompts: {len(prompts)}   already recorded: {done}\n")
    print("Controls:  ENTER start → ENTER stop → then  [ENTER] keep · [r] redo · [s] skip · [q] save & quit\n")

    try:
        for i, p in enumerate(prompts, 1):
            wav_path = out_dir / f"{p.id}.wav"
            if wav_path.exists():
                continue

            while True:
                print(f"[{i}/{len(prompts)}]  {p.id}")
                print(f"    “{p.text}”")
                choice = input("  press ENTER to start (s=skip, q=quit): ").strip().lower()
                if choice == "q":
                    raise KeyboardInterrupt
                if choice == "s":
                    print("  skipped.\n")
                    break

                audio = record_once(sd, np)
                dur = _duration_s(audio, np)
                if dur < 0.3:
                    print("  too short — let's try again.\n")
                    continue
                print(f"  captured {dur:.1f}s — playing back…")
                try:
                    sd.play(audio, SAMPLE_RATE)
                    sd.wait()
                except Exception as exc:  # playback is best-effort
                    print(f"  (playback unavailable: {exc})")

                verdict = input("  [ENTER] keep · [r] redo · [s] skip · [q] save & quit: ").strip().lower()
                if verdict == "q":
                    save_wav(wav_path, audio, np)
                    write_metadata(out_dir, prompts)
                    raise KeyboardInterrupt
                if verdict == "r":
                    print()
                    continue
                if verdict == "s":
                    print("  skipped.\n")
                    break
                save_wav(wav_path, audio, np)
                total = write_metadata(out_dir, prompts)
                print(f"  saved {wav_path.name}  (metadata.csv: {total} clips)\n")
                break
    except KeyboardInterrupt:
        print("\nStopping.")

    total = write_metadata(out_dir, prompts)
    print(f"\nDone. {total}/{len(prompts)} clips recorded in {out_dir}")
    print("metadata.csv written. Next: run TextyMcSpeechy training (see scripts/voice/README.md).")


if __name__ == "__main__":
    main()
