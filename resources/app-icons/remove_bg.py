#!/usr/bin/env python3
"""Turn the white-background squircle JPEGs into clean transparent PNGs.

The icons are near full-bleed squircles on white. We (1) crop to the squircle's
bounding box (drops the white margin), then (2) mask with an anti-aliased
superellipse so the rounded-corner cut-outs become transparent — crisp edges,
no white halo, interior highlights untouched. Outputs to mockup/public/icons/."""
import os
import numpy as np
from PIL import Image

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(SRC, "..", "..", "mockup", "public", "icons"))
os.makedirs(OUT, exist_ok=True)

NAMES = ["home", "workspace", "brainstorm", "labs", "memory",
         "control", "integrations", "planner"]
N_EXP = 5.0   # superellipse exponent ≈ Apple squircle
SS = 4        # supersample factor for anti-aliasing


def squircle_alpha(w, h, n=N_EXP, ss=SS):
    W, H = w * ss, h * ss
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    nx = (xx - (W - 1) / 2) / (W / 2)
    ny = (yy - (H - 1) / 2) / (H / 2)
    inside = (np.abs(nx) ** n + np.abs(ny) ** n) <= 1.0
    big = Image.fromarray((inside * 255).astype("uint8"), "L")
    return big.resize((w, h), Image.LANCZOS)


for name in NAMES:
    im = Image.open(os.path.join(SRC, f"{name}.jpeg")).convert("RGB")
    arr = np.asarray(im)

    # content = anything that isn't the near-white background → squircle bbox
    nonwhite = ~(arr >= 236).all(axis=2)
    ys, xs = np.where(nonwhite)
    t, b = ys.min(), ys.max() + 1
    l, r = xs.min(), xs.max() + 1

    # square up the bbox (so the squircle mask isn't stretched), centered
    bw, bh = r - l, b - t
    side = max(bw, bh)
    cx, cy = (l + r) // 2, (t + b) // 2
    l = max(0, cx - side // 2); t = max(0, cy - side // 2)
    r = min(im.width, l + side); b = min(im.height, t + side)
    l = max(0, r - side); t = max(0, b - side)

    crop = im.crop((l, t, r, b)).convert("RGBA")
    crop.putalpha(squircle_alpha(crop.width, crop.height))
    crop.save(os.path.join(OUT, f"{name}.png"))
    print(f"{name}: bbox {(l, t, r, b)} -> {crop.size}")

print("done ->", OUT)
