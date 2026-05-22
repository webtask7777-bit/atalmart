#!/usr/bin/env python3
"""
Atalmart image watcher.

Polls ./incoming-images/ for new image files. For each file whose name starts
with a product ID (p1, p47, p152, etc.), the script:

    1. Flattens transparent backgrounds onto white (so Next.js Image can
       serve WebP without black corners)
    2. Resizes the longest side down to 1000px if larger
    3. Encodes as WebP @ q=85
    4. Saves to public/products/{pid}.webp
    5. Cleans up any old png/jpg for that product
    6. Patches src/lib/demo-data.ts to point at the new file
    7. Deletes the incoming source file

Usage:
    python3 scripts/watch-images.py
    npm run watch-images          # same thing
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import time
from pathlib import Path

try:
    from PIL import Image  # type: ignore
except ImportError:
    sys.stderr.write("✘ Pillow not installed. Run: pip3 install --user Pillow\n")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
INCOMING = ROOT / "incoming-images"
PRODUCTS = ROOT / "public" / "products"
DEMO = ROOT / "src" / "lib" / "demo-data.ts"
POLL_SECONDS = 2

SUPPORTED = {".png", ".jpg", ".jpeg", ".webp"}
PID_RE = re.compile(r"^(p\d+)", re.IGNORECASE)


# ─── colour helpers (no deps) ───
def c(txt: str, code: str) -> str:
    return f"\033[{code}m{txt}\033[0m" if sys.stdout.isatty() else txt


def ok(s: str) -> str:
    return c(s, "32")


def warn(s: str) -> str:
    return c(s, "33")


def err(s: str) -> str:
    return c(s, "31")


def dim(s: str) -> str:
    return c(s, "2")


def find_cwebp() -> str:
    for candidate in [
        os.environ.get("CWEBP_PATH"),
        "/opt/homebrew/bin/cwebp",
        "/usr/local/bin/cwebp",
        "/usr/bin/cwebp",
    ]:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    try:
        out = subprocess.check_output(["which", "cwebp"], text=True).strip()
        if out:
            return out
    except Exception:
        pass
    sys.stderr.write(
        err("✘ cwebp not found. Install: ")
        + "brew install webp (mac) | apt install webp (linux)\n"
    )
    sys.exit(1)


CWEBP = find_cwebp()


def process(src: Path) -> None:
    name = src.name
    m = PID_RE.match(name)
    if not m:
        print(
            warn(f"  SKIP {name}")
            + dim("  (no p{N} prefix — rename to p1.png, p47.jpg, etc.)")
        )
        try:
            src.rename(src.with_suffix(src.suffix + ".skipped"))
        except Exception:
            pass
        return
    pid = m.group(1).lower()
    try:
        # Flatten alpha onto white
        with Image.open(src) as img:
            if "A" in img.mode or img.mode == "P":
                img = img.convert("RGBA")
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[-1])
            else:
                bg = img.convert("RGB")
            if max(bg.size) > 1000:
                scale = 1000 / max(bg.size)
                bg = bg.resize(
                    (int(bg.size[0] * scale), int(bg.size[1] * scale)),
                    Image.LANCZOS,
                )
            tmp = Path("/tmp") / f"{pid}_atalmart_flat.png"
            bg.save(tmp)

        out = PRODUCTS / f"{pid}.webp"
        subprocess.run(
            [CWEBP, "-quiet", "-q", "85", str(tmp), "-o", str(out)],
            check=True,
        )
        tmp.unlink(missing_ok=True)

        # Remove any old format for this pid
        for ext in ("png", "jpg", "jpeg"):
            old = PRODUCTS / f"{pid}.{ext}"
            if old.exists():
                old.unlink()

        # Remove source
        src.unlink()

        size_kb = out.stat().st_size / 1024
        print(ok(f"  ✓ {pid}.webp") + dim(f"  ({size_kb:.1f} KB)"))
        sync_demo_data()
    except subprocess.CalledProcessError as e:
        print(err(f"  ✘ {name}: cwebp failed ({e})"))
    except Exception as e:
        print(err(f"  ✘ {name}: {e}"))


def sync_demo_data() -> None:
    """Patch src/lib/demo-data.ts so every product points at its actual on-disk file
    (or has image_url removed if no file exists).

    Process line-by-line so we don't get tripped up by parens inside string literals
    like `p("p1", "Tamatar (Tomato)", ...)`.
    """
    has_webp = {f.stem for f in PRODUCTS.glob("*.webp")}
    has_png = {f.stem for f in PRODUCTS.glob("*.png")}
    if not DEMO.exists():
        return
    lines = DEMO.read_text().splitlines(keepends=True)
    changed = False

    # Each product line begins with optional whitespace + p("pN",
    line_re = re.compile(r'^(\s*p\("(p\d+)",\s*.*?)\),(\s*)$')
    inner_img_re = re.compile(r',\s*"/products/p\d+\.(?:png|jpg|jpeg|webp)"')

    for i, line in enumerate(lines):
        m = line_re.match(line)
        if not m:
            continue
        head, pid, tail = m.group(1), m.group(2), m.group(3)
        target = None
        if pid in has_webp:
            target = f"/products/{pid}.webp"
        elif pid in has_png:
            target = f"/products/{pid}.png"
        # Strip any existing image_url first
        head_clean = inner_img_re.sub("", head)
        new_line = (
            f'{head_clean}, "{target}"),{tail}' if target else f"{head_clean}),{tail}"
        )
        if new_line != line:
            lines[i] = new_line
            changed = True

    if changed:
        DEMO.write_text("".join(lines))


def is_stable(path: Path) -> bool:
    """Return True if the file size hasn't changed across a tiny pause —
    avoids processing a file that's still being copied."""
    try:
        s1 = path.stat().st_size
        time.sleep(0.4)
        return path.exists() and path.stat().st_size == s1 > 0
    except FileNotFoundError:
        return False


def watch() -> None:
    INCOMING.mkdir(parents=True, exist_ok=True)
    PRODUCTS.mkdir(parents=True, exist_ok=True)

    print(c("\n📁 Atalmart image watcher", "1;33"))
    print(dim(f"   watching  {INCOMING}"))
    print(dim(f"   output    {PRODUCTS}"))
    print(dim(f"   cwebp     {CWEBP}"))
    print(
        dim(
            "\n   Drop p1.png, p47.jpg, p152.webp etc. into the folder.\n"
            "   Press Ctrl+C to stop.\n"
        )
    )

    while True:
        try:
            files = [
                f
                for f in INCOMING.iterdir()
                if f.is_file() and f.suffix.lower() in SUPPORTED
            ]
            for f in files:
                if is_stable(f):
                    process(f)
            time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            print(dim("\n   👋 Stopped"))
            break
        except Exception as e:
            print(err(f"   ! watcher error: {e}"))
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    watch()
