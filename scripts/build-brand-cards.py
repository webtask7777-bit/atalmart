#!/usr/bin/env python3
"""
Build normalised brand-logo cards from the owner's logo pack.

Input  : ~/Downloads/brand-logos 2   (PNG/SVG per brand, grouped by parent company,
         SOURCES.csv + MISSING.txt), SVGs pre-rendered to transparent PNGs by
         scratch/brands/render-svgs.mjs, plus the Best Price HUL pack for BRU /
         Brooke Bond / Lipton.
Output : public/brands/<slug>.webp    512x512, transparent, logo fitted + centred
         src/lib/brands-data.ts       generated manifest (name, parent, logo,
                                      search term, live product count, flags)
         docs/brand-logos-audit.md    research report
         <scratch>/brands/preview-*.png  contact sheets for review

Usage: python3 scripts/build-brand-cards.py [--dry-run]
"""
import csv, json, os, re, sys, glob, unicodedata
from collections import Counter, defaultdict
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

PACK = os.path.expanduser("~/Downloads/brand-logos 2")
SCRATCH = os.environ.get("SCRATCH", "/private/tmp/claude-501/-Users-vivekkumar-Desktop-atalmart/e82cb496-ef69-424e-8a4f-6a9c972593d4/scratchpad/brands")
RENDER = os.path.join(SCRATCH, "svg-render")
BESTPRICE = os.path.join(SCRATCH, "hul_bestprice_brand_pack/logos/extracted_from_bestprice")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_IMG = os.path.join(ROOT, "public/brands")
MANIFEST = os.path.join(ROOT, "src/lib/brands-data.ts")
REPORT = os.path.join(ROOT, "docs/brand-logos-audit.md")
DRY = "--dry-run" in sys.argv

CANVAS = 512
LOGO_BOX = (440, 330)   # wordmarks: wide, not too tall
TILE_BOX = (380, 380)   # square coloured tiles / badges

PARENT_LABEL = {
    "AMUL": "Amul (GCMMF)", "BEST PRICE _ WALMART": "Best Price / Walmart",
    "BRITANNIA": "Britannia", "COCA-COLA": "Coca-Cola", "COLGATE-PALMOLIVE": "Colgate-Palmolive",
    "DABUR": "Dabur", "GODREJ CONSUMER": "Godrej Consumer", "HUL": "Hindustan Unilever",
    "ITC": "ITC", "JYOTHY LABS": "Jyothy Labs", "MARICO": "Marico",
    "MONDELEZ-CADBURY": "Mondelez (Cadbury)", "NESTLE": "Nestlé", "P&G": "Procter & Gamble",
    "PARLE AGRO": "Parle Agro", "PARLE PRODUCTS": "Parle Products", "PEPSICO": "PepsiCo",
    "RECKITT": "Reckitt", "TATA CONSUMER": "Tata Consumer",
}

# Brand name -> catalogue search token(s). The storefront search is a plain
# ILIKE on the product name, so the token must be spelled the way the
# catalogue spells it ("Lays", not "Lay's").
ALIASES = {k: v for k, v in {
    "Lay's": ["Lays", "Lay's"], "Nescafé": ["Nescafé"], "Coca-Cola": ["Coca-Cola", "Coca Cola", "Coke"],
    "Head & Shoulders": ["Head & Shoulders", "Head and Shoulders"], "Hide & Seek": ["Hide & Seek", "Hide and Seek"],
    "YiPPee!": ["Yippee"], "50-50": ["50-50", "50 50"], "Parle Marie": ["Parle Marie"], "Parle Top": ["Parle Top"],
    "Maggi": ["Maggi"], "KitKat": ["KitKat", "Kit Kat"], "Mountain Dew": ["Mountain Dew"], "Thums Up": ["Thums Up"],
    "Surf Excel": ["Surf Excel", "Surf"], "Ching's Secret": ["Ching's", "Chings"], "Tata Coffee Grand": ["Tata Coffee"],
    "Good Day": ["Good Day"], "Jim Jam": ["Jim Jam", "JimJam"], "Marie Gold": ["Marie Gold"], "Milk Bikis": ["Milk Bikis"],
    "Little Hearts": ["Little Hearts"], "Uncle Chipps": ["Uncle Chipps", "Uncle Chips"], "Oral-B": ["Oral-B", "Oral B"],
    "Fab!": ["Parle Fab"], "Happy Happy": ["Happy Happy"], "Kaccha Mango Bite": ["Kaccha Mango"], "Mango Bite": ["Mango Bite"],
    "Rol-a-Cola": ["Rol-a-Cola"], "Milk Shakti": ["Milk Shakti"], "Set Wet": ["Set Wet"], "Just Herbs": ["Just Herbs"],
    "Pure Sense": ["Pure Sense"], "True Elements": ["True Elements"], "Organic India": ["Organic India"],
    "Tata Soulfull": ["Soulfull"], "Old Spice": ["Old Spice"], "Ambi Pur": ["Ambi Pur", "Ambipur"], "Air Wick": ["Air Wick", "Airwick"],
    "Minute Maid": ["Minute Maid"], "Appy Fizz": ["Appy Fizz", "Appy"], "Great Value": ["Great Value"], "Member's Mark": ["Member's Mark"],
    "ITC Master Chef": ["Master Chef"], "Bar-One": ["Bar One", "Bar-One"], "Herbal Essences": ["Herbal Essences"],
    "Love Beauty and Planet": ["Love Beauty"], "Glow & Lovely": ["Glow & Lovely", "Glow and Lovely"], "Brooke Bond": ["Brooke Bond", "Red Label", "Taj Mahal"],
    "Pond's": ["Pond's", "Ponds"], "Aashirvaad": ["Aashirvaad"], "Sunfeast": ["Sunfeast"], "Bingo": ["Bingo"],
}.items()}
ALIASES = {unicodedata.normalize("NFC", k): v for k, v in ALIASES.items()}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# ── inventory ─────────────────────────────────────────────────────────────
def inventory():
    brands = {}
    for parent in sorted(os.listdir(PACK)):
        pdir = os.path.join(PACK, parent)
        if not os.path.isdir(pdir):
            continue
        for f in sorted(os.listdir(pdir)):
            stem, ext = os.path.splitext(f)
            if ext.lower() not in (".png", ".svg"):
                continue
            # macOS filenames are NFD ("e" + combining accent); normalise so
            # alias lookups and search tokens use the precomposed form.
            stem = unicodedata.normalize("NFC", stem)
            key = (parent, stem)
            b = brands.setdefault(key, {"parent": parent, "name": stem, "png": None, "svg": None})
            b[ext[1:].lower()] = os.path.join(pdir, f)
    return list(brands.values())


def load_sources():
    src = {}
    with open(os.path.join(PACK, "SOURCES.csv"), newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            src[(r["parent"].strip(), r["brand"].strip())] = r
    return src


def load_missing():
    out = []
    for line in open(os.path.join(PACK, "MISSING.txt"), encoding="utf-8"):
        if "|" in line:
            p, b = [x.strip() for x in line.split("|", 1)]
            out.append((p, b))
    return out


# ── image processing ──────────────────────────────────────────────────────
def corner_colour(im):
    w, h = im.size
    px = [im.getpixel((0, 0)), im.getpixel((w - 1, 0)), im.getpixel((0, h - 1)), im.getpixel((w - 1, h - 1))]
    return px


def is_near_white(p, tol=18):
    return p[3] > 16 and all(c >= 255 - tol for c in p[:3])


def knock_out_white_edges(im, tol=22):
    """Make the edge-connected near-white background transparent (flood fill
    from the borders), leaving white inside the artwork untouched."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if a == 0 or (r >= 255 - tol and g >= 255 - tol and b >= 255 - tol):
            px[x, y] = (r, g, b, 0)
            stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def pick_source(b):
    """Best available raster for the brand: pre-rendered SVG > big PNG > small PNG."""
    cands = []
    rp = os.path.join(RENDER, f"{b['parent']}__{b['name']}.png")
    if b["svg"] and os.path.exists(rp):
        cands.append(("svg", rp))
    if b["png"]:
        cands.append(("png", b["png"]))
    if b["parent"] == "HUL":
        bp = {"BRU": "bru-1024-transparent.png", "Brooke Bond": "brooke-bond-1024-transparent.png", "Lipton": "lipton-1024-transparent.png"}.get(b["name"])
        if bp and os.path.exists(os.path.join(BESTPRICE, bp)):
            cands.append(("bestprice", os.path.join(BESTPRICE, bp)))
    # prefer svg render; else the largest transparent raster
    best = None
    for kind, path in cands:
        im = Image.open(path)
        score = (2 if kind == "svg" else 1 if kind == "bestprice" else 0, im.size[0] * im.size[1])
        if best is None or score > best[0]:
            best = (score, kind, path)
    return best[1], best[2]


def make_card(b):
    kind, path = pick_source(b)
    im = Image.open(path).convert("RGBA")
    # Classify the background from the whole border ring, not just the four
    # corners: tightly cropped wordmarks (Axe, Lakmé, Pantene…) have glyph
    # pixels in a corner but a transparent border everywhere else.
    w, h = im.size
    ring = ([im.getpixel((x, 0)) for x in range(w)] + [im.getpixel((x, h - 1)) for x in range(w)]
            + [im.getpixel((0, y)) for y in range(h)] + [im.getpixel((w - 1, y)) for y in range(h)])
    n = len(ring)
    transparent = sum(1 for p in ring if p[3] < 16) / n >= 0.6
    white = not transparent and sum(1 for p in ring if is_near_white(p)) / n >= 0.6
    tile = False
    if not transparent and white:
        im = knock_out_white_edges(im)
    elif not transparent:
        tile = True  # solid coloured background is part of the mark: keep as a rounded tile
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError(f"empty after processing: {path}")
    im = im.crop(bbox)
    if tile:
        # Round the tile's corners but keep whatever transparency the artwork
        # already has (never paint transparent pixels opaque).
        r = int(min(im.size) * 0.08)
        im.putalpha(ImageChops.multiply(im.getchannel("A"), rounded_mask(im.size, r)))
    src_w, src_h = im.size
    box = TILE_BOX if tile or abs(src_w / src_h - 1) < 0.25 else LOGO_BOX
    scale = min(box[0] / src_w, box[1] / src_h)
    low_res = min(src_w, src_h) < 90 or (scale > 2.6 and max(src_w, src_h) < 400)
    new = (max(1, round(src_w * scale)), max(1, round(src_h * scale)))
    im = im.resize(new, Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(im, ((CANVAS - new[0]) // 2, (CANVAS - new[1]) // 2), im)
    return canvas, {"source_kind": kind, "source_path": path, "source_size": f"{src_w}x{src_h}", "tile": tile, "low_res": low_res}


# ── catalogue matching ────────────────────────────────────────────────────
def load_products():
    p = os.path.join(SCRATCH, "products.json")
    return json.load(open(p)) if os.path.exists(p) else []


def match_products(name, products):
    tokens = ALIASES.get(name, [name])
    keys = [norm(t) for t in tokens]
    hits = []
    for p in products:
        if not p.get("active"):
            continue
        n = norm(p["name"])
        for k in keys:
            if n == k or n.startswith(k + " ") or (" " + k + " ") in (" " + n + " "):
                hits.append(p)
                break
    return tokens[0], hits


# ── preview sheet ─────────────────────────────────────────────────────────
def font(size, bold=False):
    for cand in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
                 "/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(cand):
            return ImageFont.truetype(cand, size)
    return ImageFont.load_default()


def preview_sheets(entries, per_sheet_parents=5):
    groups = defaultdict(list)
    for e in entries:
        groups[e["parent_label"]].append(e)
    parents = sorted(groups, key=lambda p: -len(groups[p]))
    cols, cw, ch, pad = 6, 210, 250, 16
    sheets = []
    for i in range(0, len(parents), per_sheet_parents):
        chunk = parents[i:i + per_sheet_parents]
        rows = sum((len(groups[p]) + cols - 1) // cols for p in chunk)
        H = 60 + rows * (ch + pad) + len(chunk) * 44
        W = pad + cols * (cw + pad)
        sheet = Image.new("RGB", (W, H), (247, 245, 240))
        d = ImageDraw.Draw(sheet)
        d.text((pad, 18), "ATALMART — BRAND LOGO CARDS (review sheet)", fill=(60, 40, 20), font=font(22, True))
        y = 60
        for p in chunk:
            d.text((pad, y + 8), f"{p}  ·  {len(groups[p])} brands", fill=(180, 74, 0), font=font(18, True))
            y += 44
            for j, e in enumerate(groups[p]):
                x = pad + (j % cols) * (cw + pad)
                yy = y + (j // cols) * (ch + pad)
                d.rounded_rectangle((x, yy, x + cw, yy + ch), radius=18, fill=(255, 255, 255), outline=(228, 222, 212))
                logo = Image.open(e["out"]).convert("RGBA").resize((176, 176), Image.LANCZOS)
                sheet.paste(logo, (x + 17, yy + 10), logo)
                d.text((x + 12, yy + 196), e["name"][:24], fill=(40, 30, 20), font=font(15, True))
                d.text((x + 12, yy + 218), f"{e['products']} live products" if e["products"] else "no products yet", fill=(120, 110, 100), font=font(12))
                if e["low_res"]:
                    d.rounded_rectangle((x + cw - 70, yy + 8, x + cw - 8, yy + 26), radius=6, fill=(220, 60, 60))
                    d.text((x + cw - 64, yy + 11), "LOW RES", fill="white", font=font(10, True))
                if e["tile"]:
                    d.text((x + cw - 40, yy + ch - 22), "tile", fill=(160, 150, 140), font=font(11))
            y += ((len(groups[p]) + cols - 1) // cols) * (ch + pad)
        out = os.path.join(SCRATCH, f"preview-{len(sheets) + 1}.png")
        sheet.save(out)
        sheets.append(out)
    return sheets


# ── main ──────────────────────────────────────────────────────────────────
def main():
    brands = inventory()
    sources = load_sources()
    missing = load_missing()
    products = load_products()
    os.makedirs(OUT_IMG, exist_ok=True)
    entries = []
    for b in brands:
        slug = slugify(b["name"])
        if b["parent"] == "BEST PRICE _ WALMART":
            continue  # wholesaler private labels — not something Atalmart retails
        card, meta = make_card(b)
        out = os.path.join(OUT_IMG, f"{slug}.webp")
        if not DRY:
            card.save(out, "WEBP", quality=88, method=6)
        search, hits = match_products(b["name"], products)
        src = sources.get((b["parent"].replace(" _ ", " / "), b["name"])) or {}
        entries.append({
            "slug": slug, "name": b["name"], "parent": b["parent"], "parent_label": PARENT_LABEL.get(b["parent"], b["parent"].title()),
            "out": out, "search": search, "products": len(hits), "tile": meta["tile"], "low_res": meta["low_res"],
            "source_kind": meta["source_kind"], "source_size": meta["source_size"], "source": src.get("source", ""),
            "source_url": src.get("source_url", ""), "kb": os.path.getsize(out) // 1024 if os.path.exists(out) else 0,
        })
    entries.sort(key=lambda e: (-e["products"], e["name"].lower()))

    # manifest
    lines = [
        "// GENERATED by scripts/build-brand-cards.py — do not hand-edit.",
        "// Source: owner's logo pack (~/Downloads/brand-logos 2) + Best Price HUL pack.",
        "// `products` = active catalogue products matching the brand at build time.",
        "",
        "export interface BrandCard {",
        "  slug: string;",
        "  name: string;",
        "  parent: string;",
        "  /** 512×512 transparent WebP under /public/brands */",
        "  logo: string;",
        "  /** Search token spelled the way the catalogue spells it */",
        "  search: string;",
        "  products: number;",
        "  /** Coloured square tile (background is part of the mark) */",
        "  tile: boolean;",
        "  /** Source artwork was small — replace when a better file arrives */",
        "  lowRes: boolean;",
        "}",
        "",
        "export const BRAND_CARDS: BrandCard[] = [",
    ]
    for e in entries:
        lines.append("  " + json.dumps({"slug": e["slug"], "name": e["name"], "parent": e["parent_label"], "logo": f"/brands/{e['slug']}.webp",
                                        "search": e["search"], "products": e["products"], "tile": e["tile"], "lowRes": e["low_res"]}, ensure_ascii=False) + ",")
    lines += ["];", "", "/** Brands worth a storefront tile: live products behind them. */",
              "export const SHOPPABLE_BRANDS = BRAND_CARDS.filter((b) => b.products >= 2);", ""]
    if not DRY:
        os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
        open(MANIFEST, "w", encoding="utf-8").write("\n".join(lines))

    sheets = preview_sheets(entries) if not DRY else []

    # report
    by_source = Counter((e["source"] or "unknown").split(" (")[0] for e in entries)
    low = [e for e in entries if e["low_res"]]
    tiles = [e for e in entries if e["tile"]]
    with_products = [e for e in entries if e["products"] > 0]
    active = [p for p in products if p.get("active")]
    first_words = Counter(norm(p["name"]).split(" ")[0] for p in active)
    have = {norm(e["search"]).split(" ")[0] for e in entries} | {norm(e["name"]).split(" ")[0] for e in entries}
    gaps = [(w, c) for w, c in first_words.most_common(80) if w not in have and c >= 3]
    total_kb = sum(e["kb"] for e in entries)
    rep = [
        "# Brand logo pack — research & card build",
        "",
        f"Pack: `~/Downloads/brand-logos 2` · {len(brands)} logo files across {len(PARENT_LABEL)} parent companies · built {len(entries)} cards",
        "",
        "## What was built",
        f"- `public/brands/<slug>.webp` — {len(entries)} cards, 512×512, transparent, logo fitted and centred (total {total_kb} KB, avg {total_kb // max(1, len(entries))} KB).",
        "- `src/lib/brands-data.ts` — generated manifest (`BRAND_CARDS`, `SHOPPABLE_BRANDS`).",
        f"- Best Price / Walmart private labels (Great Value, Member's Mark) skipped: wholesaler labels, not retailed on Atalmart.",
        "",
        "## Source quality",
        "| Source | Brands |", "|---|---|",
    ] + [f"| {s} | {n} |" for s, n in by_source.most_common()] + [
        "",
        f"- Vector (SVG) available for {sum(1 for e in entries if e['source_kind'] == 'svg')} brands → rendered at 1024 px, crisp at any size.",
        f"- {len(tiles)} logos are coloured square tiles (background is part of the mark, e.g. Parle Products' site tiles, Colgate, 7UP, Durex) → kept as rounded tiles.",
        f"- {len(low)} logos are LOW RES (source shorter side < 90 px or heavy upscale). They look soft above ~120 px on screen; replace when better files arrive:",
    ] + [f"  - {e['name']} ({e['parent_label']}, {e['source_size']})" for e in low] + [
        "",
        "## Catalogue coverage (live products, active only)",
        f"- {len(with_products)} of {len(entries)} pack brands have at least one active product; {sum(1 for e in entries if e['products'] >= 2)} have 2+ (these get a storefront tile).",
        "",
        "| Brand | Parent | Live products | Search token |", "|---|---|---|---|",
    ] + [f"| {e['name']} | {e['parent_label']} | {e['products']} | `{e['search']}` |" for e in with_products] + [
        "",
        "### Big catalogue brands with NO logo in the pack",
        "(first word of active product names, ≥3 products — worth sourcing next)",
        "",
        "| Brand word | Active products |", "|---|---|",
    ] + [f"| {w} | {c} |" for w, c in gaps] + [
        "",
        f"The pack's own MISSING.txt lists {len(missing)} further brands it could not source; the owner decided not to chase them (\"jitna mila kafi hai\").",
    ] + [
        "",
        "## Notes",
        "- Logos are registered trademarks of their owners. Showing them as \"shop by brand\" navigation for genuine products you retail is ordinary nominative use; do not alter the marks, put them inside Atalmart-branded compositions, or imply endorsement.",
        "- Wikipedia/Brandfetch files are generally the current official marks; the logos-download / seeklogo / logoshape files are fan uploads — spot-check against the brand's own site before using in print.",
        "- Re-run `python3 scripts/build-brand-cards.py` after dropping better files into the pack; the manifest and product counts regenerate.",
        "",
    ]
    if not DRY:
        os.makedirs(os.path.dirname(REPORT), exist_ok=True)
        open(REPORT, "w", encoding="utf-8").write("\n".join(rep))
    print(f"cards: {len(entries)}  low-res: {len(low)}  tiles: {len(tiles)}  with products: {len(with_products)}  2+: {sum(1 for e in entries if e['products'] >= 2)}  total {total_kb} KB")
    print("sheets:", sheets)
    print("gaps:", gaps[:25])


if __name__ == "__main__":
    main()
