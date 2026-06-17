#!/usr/bin/env python3
"""Export a Piper training checkpoint (.ckpt) to a deployable .onnx + .onnx.json.

Works on Apple Silicon (CPU-only) without the full piper training stack: it loads
the checkpoint's weights straight into a vendored ``SynthesizerTrn`` generator and
traces ``infer`` to ONNX — bypassing PyTorch-Lightning, librosa and
piper-phonemize (the deps that don't build cleanly on macOS arm64). The
training-only ``monotonic_align`` import is stubbed since inference never uses it.

The ``.onnx.json`` is your dataset's preprocessing ``config.json`` (sample rate,
phoneme id map, espeak voice) — required for the voice to load in Piper/Hermes.

Usage:
    python3 scripts/voice/export_checkpoint.py \
        --checkpoint scripts/voice/miles-morales/epoch=4769-step=5376.ckpt \
        --config     scripts/voice/miles-morales/config.json \
        --output     ~/.hermes/voices/en_US-miles-medium.onnx

Needs: torch + numpy in the current interpreter, and the rhasspy/piper source
(auto-cloned to a cache dir unless --piper-src is given). torch.onnx.export does
the tracing; no GPU required.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import types
from pathlib import Path

PIPER_REPO = "https://github.com/rhasspy/piper.git"
OPSET = 15


def ensure_piper_src(piper_src: Path | None) -> Path:
    """Return a path to piper's ``src/python`` (clone into a cache if needed)."""
    if piper_src:
        src = piper_src / "src" / "python" if (piper_src / "src" / "python").exists() else piper_src
        if not (src / "piper_train" / "vits" / "models.py").exists():
            sys.exit(f"error: --piper-src has no piper_train/vits/models.py under {src}")
        return src
    cache = Path.home() / ".cache" / "agent-home-piper-src"
    src = cache / "src" / "python"
    if not (src / "piper_train" / "vits" / "models.py").exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        print(f"Cloning piper source → {cache} …")
        subprocess.run(["git", "clone", "--depth", "1", PIPER_REPO, str(cache)], check=True)
    return src


def load_synthesizer(ckpt_path: Path, piper_src: Path):
    """Build SynthesizerTrn from the checkpoint's hyper_parameters + weights."""
    sys.path.insert(0, str(piper_src))

    # Stub the training-only MAS extension so models.py imports without the
    # cython build (inference / export never calls it).
    stub = types.ModuleType("piper_train.vits.monotonic_align")
    stub.maximum_path = lambda *a, **k: (_ for _ in ()).throw(
        RuntimeError("monotonic_align is training-only and unavailable in export")
    )
    sys.modules["piper_train.vits.monotonic_align"] = stub

    import torch
    from piper_train.vits.models import SynthesizerTrn

    ckpt = torch.load(str(ckpt_path), map_location="cpu", weights_only=False)
    hp = dict(ckpt["hyper_parameters"])

    def g(key, default=None):
        return hp[key] if key in hp else default

    filter_length = int(g("filter_length", 1024))
    hop_length = int(g("hop_length", 256))
    segment_size = int(g("segment_size", 8192))

    model_g = SynthesizerTrn(
        n_vocab=int(g("num_symbols")),
        spec_channels=filter_length // 2 + 1,
        segment_size=segment_size // hop_length,
        inter_channels=int(g("inter_channels", 192)),
        hidden_channels=int(g("hidden_channels", 192)),
        filter_channels=int(g("filter_channels", 768)),
        n_heads=int(g("n_heads", 2)),
        n_layers=int(g("n_layers", 6)),
        kernel_size=int(g("kernel_size", 3)),
        p_dropout=float(g("p_dropout", 0.1)),
        resblock=str(g("resblock", "2")),
        resblock_kernel_sizes=g("resblock_kernel_sizes", (3, 5, 7)),
        resblock_dilation_sizes=g("resblock_dilation_sizes", ((1, 2), (2, 6), (3, 12))),
        upsample_rates=g("upsample_rates", (8, 8, 4)),
        upsample_initial_channel=int(g("upsample_initial_channel", 256)),
        upsample_kernel_sizes=g("upsample_kernel_sizes", (16, 16, 8)),
        n_speakers=int(g("num_speakers", 1)),
        gin_channels=int(g("gin_channels", 0)),
        use_sdp=bool(g("use_sdp", True)),
    )

    # Pull the generator weights (state_dict keys are prefixed "model_g.").
    gen_state = {
        k[len("model_g."):]: v
        for k, v in ckpt["state_dict"].items()
        if k.startswith("model_g.")
    }
    missing, unexpected = model_g.load_state_dict(gen_state, strict=False)
    if missing:
        print(f"  note: {len(missing)} missing keys (ok if training-only), e.g. {missing[:3]}")
    if unexpected:
        print(f"  note: {len(unexpected)} unexpected keys, e.g. {unexpected[:3]}")
    return torch, model_g, int(g("num_symbols")), int(g("num_speakers", 1))


def export(torch, model_g, num_symbols: int, num_speakers: int, out: Path) -> None:
    """Trace model_g.infer to ONNX (mirrors piper_train.export_onnx)."""
    model_g.eval()
    with torch.no_grad():
        model_g.dec.remove_weight_norm()

    def infer_forward(text, text_lengths, scales, sid=None):
        noise_scale, length_scale, noise_scale_w = scales[0], scales[1], scales[2]
        return model_g.infer(
            text, text_lengths,
            noise_scale=noise_scale, length_scale=length_scale,
            noise_scale_w=noise_scale_w, sid=sid,
        )[0].unsqueeze(1)

    model_g.forward = infer_forward

    seq = torch.randint(low=0, high=num_symbols, size=(1, 50), dtype=torch.long)
    seq_len = torch.LongTensor([seq.size(1)])
    scales = torch.FloatTensor([0.667, 1.0, 0.8])
    sid = torch.LongTensor([0]) if num_speakers > 1 else None

    out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model=model_g,
        args=(seq, seq_len, scales, sid),
        f=str(out),
        opset_version=OPSET,
        input_names=["input", "input_lengths", "scales", "sid"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size", 1: "phonemes"},
            "input_lengths": {0: "batch_size"},
            "output": {0: "batch_size", 1: "time"},
        },
    )


def write_voice_config(cfg_path: Path, json_out: Path) -> None:
    """Write the .onnx.json, normalized to the strict Piper schema.

    Training notebooks can emit a minimal language block ({"code": "en-us"}) and
    put the dataset name in audio.quality. The Piper GUI rejects that with
    "The field 'family' is missing at 'language'". Fill the canonical language
    fields and a valid quality so the voice imports everywhere (Hermes/piper-tts
    is lenient, but the desktop app and Home Assistant are not).
    """
    c = json.loads(cfg_path.read_text(encoding="utf-8"))
    code = ((c.get("language") or {}).get("code")
            or (c.get("espeak") or {}).get("voice") or "en-us")
    norm = code.replace("_", "-").lower()
    fam = norm.split("-")[0]
    region = norm.split("-")[1].upper() if "-" in norm else ""
    c["language"] = {
        "code": f"{fam}_{region}" if region else fam,
        "family": fam,
        "region": region,
        "name_native": "English" if fam == "en" else fam,
        "name_english": "English" if fam == "en" else fam,
        "country_english": "United States" if region == "US" else region,
    }
    c.setdefault("espeak", {})["voice"] = norm
    audio = c.setdefault("audio", {})
    if audio.get("quality") in (None, "", c.get("dataset")):
        audio["quality"] = "medium"
    audio.setdefault("sample_rate", 22050)
    json_out.write_text(json.dumps(c, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--config", required=True, help="dataset config.json → becomes <output>.json")
    p.add_argument("--output", required=True, help="Path to write the .onnx (the .onnx.json is written beside it).")
    p.add_argument("--piper-src", default=None, help="Path to a rhasspy/piper checkout (auto-cloned if omitted).")
    args = p.parse_args()

    ckpt = Path(args.checkpoint).expanduser()
    cfg = Path(args.config).expanduser()
    out = Path(args.output).expanduser()
    for f in (ckpt, cfg):
        if not f.exists():
            sys.exit(f"error: not found: {f}")

    piper_src = ensure_piper_src(Path(args.piper_src).expanduser() if args.piper_src else None)
    print(f"Loading checkpoint {ckpt.name} …")
    torch, model_g, num_symbols, num_speakers = load_synthesizer(ckpt, piper_src)
    print(f"Exporting ONNX (num_symbols={num_symbols}, num_speakers={num_speakers}) …")
    export(torch, model_g, num_symbols, num_speakers, out)

    json_out = out.with_suffix(out.suffix + ".json")  # model.onnx -> model.onnx.json
    write_voice_config(cfg, json_out)
    size_mb = out.stat().st_size / 1024 / 1024
    print(f"\n✓ {out}  ({size_mb:.1f} MB)")
    print(f"✓ {json_out}")
    print("Verify next, then copy both into ~/.hermes/voices/ and set tts.piper.voice.")


if __name__ == "__main__":
    main()
