#!/usr/bin/env python3
"""
Build the category campaign art (public/atalmart/category-banners/products/
<slug>.webp) from real catalogue packshots.

For each category in scripts/category-campaign-picks.json the three product
images are downloaded from Supabase storage, their white studio background
is removed (flood fill from the border, so white printed on the pack stays),
and they are composed into one transparent collage: the centre product
largest and in front, the two side products slightly smaller and tucked
behind it, all bottom-aligned. The banner component then floats this over
its gradient (CategoryPromoBanner, .productImage: object-fit contain).

Usage:
  python3 scripts/build-category-campaign-art.py            # all categories
  python3 scripts/build-category-campaign-art.py dairy pet-care
  REVIEW=1 ...   # also writes a contact sheet next to the cache for review

Requires Pillow + numpy. Downloads are cached in .cache/campaign-art/.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PICKS = ROOT / "scripts" / "category-campaign-picks.json"
OUT_DIR = ROOT / "public" / "atalmart" / "category-banners" / "products"
CACHE = ROOT / ".cache" / "campaign-art"
BUCKET = "https://gnrselkepycedynyxwjr.supabase.co/storage/v1/object/public/product-images/"

CENTRE_H = 640          # px, centre product height in the collage
SIDE_SCALE = 0.80       # side products relative to the centre
OVERLAP = 0.16          # how far each side product tucks behind the centre
MAX_W = 1000            # final collage width cap


def fetch(rel: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / rel.replace("/", "__")
    if not target.exists():
        urllib.request.urlretrieve(BUCKET + rel, target)
    return target


def cutout(im: Image.Image) -> Image.Image:
    """Transparent cutout: background = near-white pixels connected to the border."""
    im = im.convert("RGBA")
    if im.getchannel("A").getextrema()[0] < 250:
        return im  # already transparent
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    light = a.min(axis=2) >= 228
    seen = np.zeros((h, w), bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if light[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)
    band = (alpha > 0) & (alpha < 255)
    bright = a.min(axis=2).astype(np.float32)
    alpha[band] = np.minimum(alpha[band], np.clip((252 - bright[band]) * 5, 0, 255))
    return Image.fromarray(np.dstack([a.astype(np.uint8), alpha.astype(np.uint8)]), "RGBA")


def prepared(rel: str) -> tuple[Image.Image, tuple[int, int]]:
    src = Image.open(fetch(rel))
    size = src.size
    src = src.convert("RGBA")
    if max(src.size) > 1600:
        src.thumbnail((1600, 1600), Image.LANCZOS)
    out = cutout(src)
    return out.crop(out.getbbox()), size


def scale_to_h(im: Image.Image, h: int) -> Image.Image:
    r = h / im.height
    return im.resize((max(1, round(im.width * r)), h), Image.LANCZOS)


def compose(items: list[Image.Image]) -> Image.Image:
    """[left, centre, right] cutouts → one transparent, bottom-aligned collage."""
    left, centre, right = items
    c = scale_to_h(centre, CENTRE_H)
    l = scale_to_h(left, round(CENTRE_H * SIDE_SCALE))
    r = scale_to_h(right, round(CENTRE_H * SIDE_SCALE))
    lx = 0
    cx = l.width - round(l.width * OVERLAP)
    rx = cx + c.width - round(r.width * OVERLAP)
    width = rx + r.width
    height = CENTRE_H + 8
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    # sides first (behind), centre last (in front); everything sits on the baseline
    for im, x in ((l, lx), (r, rx), (c, cx)):
        canvas.alpha_composite(im, (x, height - im.height))
    canvas = canvas.crop(canvas.getbbox())
    if canvas.width > MAX_W:
        canvas = scale_to_h(canvas, round(canvas.height * MAX_W / canvas.width))
    return canvas


def main(argv: list[str]) -> int:
    picks: dict[str, list[str]] = {k: v for k, v in json.loads(PICKS.read_text()).items() if not k.startswith("_")}
    wanted = argv or list(picks)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tiles: list[tuple[str, Image.Image]] = []
    for slug in wanted:
        rels = picks[slug]
        if len(rels) != 3:
            print(f"{slug}: need exactly 3 picks, got {len(rels)}", file=sys.stderr)
            return 1
        cuts = []
        for rel in rels:
            im, size = prepared(rel)
            flag = "  (low-res source)" if max(size) < 600 else ""
            print(f"  {slug}: {rel.split('/')[0][:8]} {size[0]}x{size[1]} -> cut {im.width}x{im.height}{flag}")
            cuts.append(im)
        art = compose(cuts)
        out = OUT_DIR / f"{slug}.webp"
        art.save(out, "WEBP", quality=84, method=6)
        print(f"{slug}: {art.width}x{art.height} {out.stat().st_size // 1024} KB")
        tiles.append((slug, art))

    if os.environ.get("REVIEW"):
        S = 420
        cols = 4
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * S, rows * (S + 22)), (18, 18, 18))
        d = ImageDraw.Draw(sheet)
        for i, (slug, art) in enumerate(tiles):
            t = art.copy()
            t.thumbnail((S - 24, S - 24))
            tile = Image.new("RGBA", (S, S))
            for x in range(S):
                k = x / S
                tile.paste((int(24 + k * 200), int(90 - k * 40), int(70 + k * 10), 255), (x, 0, x + 1, S))
            tile.alpha_composite(t, ((S - t.width) // 2, (S - t.height) // 2))
            x, y = (i % cols) * S, (i // cols) * (S + 22)
            sheet.paste(tile.convert("RGB"), (x, y))
            d.text((x + 6, y + S + 4), slug, fill=(255, 255, 255))
        review = CACHE / "review.png"
        sheet.save(review)
        print(f"review sheet: {review}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
