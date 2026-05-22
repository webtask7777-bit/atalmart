#!/usr/bin/env python3
"""
Atalmart product image uploader (unit-aware).

For each image in /Users/vivekkumar/atalmart product img/:
  1. Parse the filename to extract { product family, pack size, role }.
  2. Find an existing DB product with matching name AND unit. If none, AUTO-CREATE
     a new product row (cloned from the base SKU but with the right unit + price).
  3. Upload to Supabase Storage (bucket: product-images, path: <product_id>/<role>-<hash>.png).
  4. Update product.image_url (front-of-pack) + product.image_urls[] (other angles).

Re-runnable: storage uploads are upserts, product matches are stable per filename.

Naming convention recognized:
    FoP-*    front-of-pack       (becomes the primary image_url)
    BoP-*    back-of-pack
    SC-*     side / composition
    Ing-*    ingredients label
    NI-*     nutritional info
    02-*, 03-*  sequential additional shots
Pack sizes detected: 100g, 200g, 250g, 500g, 1kg, 200ml, 500ml, 1L, etc.

Usage:
    python3 scripts/upload-product-images.py
    python3 scripts/upload-product-images.py --dry-run     # show plan
    python3 scripts/upload-product-images.py --no-create   # don't auto-create new SKUs
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

# ─── Config ─────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FOLDER = Path("/Users/vivekkumar/atalmart product img")
BUCKET = "product-images"
SUPPORTED = {".png", ".jpg", ".jpeg", ".webp"}


def load_env() -> dict[str, str]:
    env_path = ROOT / ".env.local"
    out: dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", line)
            if m:
                out[m.group(1)] = m.group(2).strip()
    return out


ENV = load_env()
SUPABASE_URL = ENV.get("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_ROLE = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SUPABASE_URL or not SERVICE_ROLE:
    sys.exit("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")


# ─── Tiny HTTP helper ─────────────────────────────────────────────────
def request(method: str, path: str, *, body: bytes | None = None, headers: dict | None = None):
    url = f"{SUPABASE_URL}{path}"
    h = {"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}", **(headers or {})}
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def rest(method: str, path: str, json_body: object | None = None, *, prefer: str | None = None):
    body = json.dumps(json_body).encode("utf-8") if json_body is not None else None
    headers = {}
    if body:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    status, raw = request(method, path, body=body, headers=headers)
    if status >= 400:
        sys.stderr.write(f"[REST] {method} {path} -> {status} {raw[:200]!r}\n")
    return status, raw


# ─── Filename parsing ─────────────────────────────────────────────────
ROLE_RE = re.compile(r"^(FoP|BoP|SC|Ing|NI|\d{2})[-_]", re.IGNORECASE)
# Pack size: 200g, 1kg, 500ml, 1L, 1.5L, etc. (with optional space)
SIZE_RE = re.compile(
    r"(?<![\d.])(\d+(?:\.\d+)?)\s?(g|kg|ml|l|pc|pcs)\b",
    re.IGNORECASE,
)
# Family token "Cheese Cubes" / "Gold Milk Pouch" — strip role + size + decorations
DECOR_RE = re.compile(r"[-_]NEW[-_]AW$|[-_]+$", re.IGNORECASE)


def normalize_unit(raw_value: str, raw_unit: str) -> str:
    """('200', 'g') -> '200 g', ('1', 'kg') -> '1 kg'."""
    val = raw_value.lstrip("0") or "0"
    if val.endswith(".0"):
        val = val[:-2]
    u = raw_unit.lower()
    if u == "l":
        u = "L"
    return f"{val} {u}"


def parse_filename(filename: str) -> dict:
    stem = Path(filename).stem
    m = ROLE_RE.match(stem)
    role = m.group(1).upper() if m else "OTHER"
    # Strip prefix
    body = re.sub(r"^(FoP|BoP|SC|Ing|NI|\d{2})[-_]", "", stem, flags=re.IGNORECASE)
    # Extract pack size
    size_match = SIZE_RE.search(body)
    pack_size = None
    if size_match:
        pack_size = normalize_unit(size_match.group(1), size_match.group(2))
        body = SIZE_RE.sub("", body, count=1)  # strip the size
    # Strip "NEW-AW" decorations
    body = DECOR_RE.sub("", body)
    body = re.sub(r"[-_]+", "-", body).strip("-_")
    family = body.lower()
    return {
        "role": role,
        "family": family,
        "pack_size": pack_size,
        "filename": filename,
    }


# ─── Family → product family name in DB ───────────────────────────────
FAMILY_TO_BASE = {
    "amul-butter-carton": "Amul Butter",
    "butter-carton": "Amul Butter",
    "butter-tub": "Amul Butter",
    "butter": "Amul Butter",
    "taaza-milk": "Amul Taaza Milk",
    "taaza": "Amul Taaza Milk",
    "gold-milk-pouch": "Amul Gold Milk",  # red pouch, separate from tetrapack
    "gold-milk": "Amul Gold Milk",
    # "Gold-Slim-Tetrapack" = Amul Gold in slim tetrapack carton (NOT Slim n Trim,
    # which is a different SKU — double-toned low-fat milk).
    "gold-slim-tetrapack": "Amul Gold Tetrapack",
    "slim-n-trim-pouch": "Amul Slim 'n' Trim Milk",
    "slim-n-trim": "Amul Slim 'n' Trim Milk",
    # Generic "Tetrapack-Pack" = Amul Taaza tetrapack carton
    "tetrapack-pack": "Amul Taaza Tetrapack",
    "buffalo": "Amul Buffalo Milk",
    "milk-cheese-cubes": "Amul Cheese Cubes",
    "cheese-cubes": "Amul Cheese Cubes",
    "blend-diced-cheese-pouch": "Amul Diced Cheese",
    "blend-diced-cheese": "Amul Diced Cheese",
    "diced-cheese": "Amul Diced Cheese",
    "cheese-slices": "Amul Cheese Slices",
    "mithai-mate": "Amul Mithai Mate",  # condensed milk — separate from Mishti Doi
    "masti-dahi": "Amul Masti Dahi Family Pack",
    "dahi": "Amul Masti Dahi Family Pack",
    "chaas": "Amul Masala Chaas",
    "shrikhand": "Amul Shrikhand Elaichi",
    "lassi": "Amul Lassi Mango",
    "mishti": "Amul Mishti Doi",
    "cream": "Cream (Amul)",
    "ghee": "Amul Ghee",
}


def best_family_match(family_token: str) -> str | None:
    """Find the longest hint that's a substring of the filename token."""
    matches = [(hint, name) for hint, name in FAMILY_TO_BASE.items() if hint in family_token]
    if not matches:
        return None
    # Longest hint wins (more specific)
    matches.sort(key=lambda x: -len(x[0]))
    return matches[0][1]


# ─── Storage helpers ─────────────────────────────────────────────────
def storage_upload(bytes_: bytes, dest_path: str, content_type: str) -> bool:
    status, raw = request(
        "POST",
        f"/storage/v1/object/{BUCKET}/{dest_path}",
        body=bytes_,
        headers={
            "Content-Type": content_type,
            "x-upsert": "true",
            "Cache-Control": "max-age=31536000, immutable",
        },
    )
    if status >= 400:
        sys.stderr.write(f"[storage] upload {dest_path} -> {status} {raw[:200]!r}\n")
        return False
    return True


def storage_public_url(path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"


# ─── Product creation (when no matching SKU exists) ──────────────────
def create_sku_variant(base_product: dict, target_unit: str) -> str | None:
    """Clone a product row, override unit + sensible price. Returns new id or None."""
    # Heuristic pricing per pack size — admin can edit later
    price_map = {
        "100 g": base_product["price"],
        "200 g": int(base_product["price"] * 1.8),
        "250 g": int(base_product["price"] * 2.2),
        "500 g": int(base_product["price"] * 4.0),
        "1 kg": int(base_product["price"] * 7.5),
        "200 ml": base_product["price"],
        "500 ml": int(base_product["price"] * 2.2),
        "1 L": int(base_product["price"] * 4.0),
        "1.5 L": int(base_product["price"] * 5.5),
    }
    base_unit = base_product.get("unit", "")
    base_price = base_product["price"]
    target_price = price_map.get(target_unit, base_price)
    target_mrp = max(target_price, int(target_price * 1.1))

    payload = {
        "name": f"{base_product['name']} ({target_unit})",
        "name_hi": base_product.get("name_hi", ""),
        "description": base_product.get("description"),
        "category_id": base_product["category_id"],
        "price": target_price,
        "mrp": target_mrp,
        "unit": target_unit,
        "stock": 25,
        "active": True,
        "country_of_origin": "India",
        "seller_name": "Atalmart Hyperpure Private Limited",
        "seller_address": "Sector 27, Atal Nagar, Naya Raipur, Chhattisgarh 492101",
    }
    status, raw = rest("POST", "/rest/v1/products", [payload], prefer="return=representation")
    if status >= 400:
        return None
    row = json.loads(raw)[0]
    return row["id"]


# ─── Main ────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder", default=str(DEFAULT_FOLDER))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--no-create",
        action="store_true",
        help="Don't auto-create new SKUs for unit mismatches; list as unmatched instead",
    )
    args = ap.parse_args()

    folder = Path(args.folder).expanduser()
    if not folder.exists():
        sys.exit(f"Folder not found: {folder}")

    files = sorted(
        f for f in folder.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED and not f.name.startswith(".")
    )
    print(f"→ Found {len(files)} image files")

    # Fetch all products
    status, raw = rest("GET", "/rest/v1/products?select=id,name,unit,price,mrp,category_id,name_hi,description&limit=2000")
    if status != 200:
        sys.exit(f"Failed to fetch products")
    products = json.loads(raw)
    print(f"   {len(products)} products in DB")

    # Group files: (base_name, unit) -> list of (role, path)
    groups: dict[tuple[str, str | None], list[tuple[str, Path]]] = {}
    skipped: list[tuple[Path, str]] = []
    for f in files:
        parsed = parse_filename(f.name)
        family = parsed["family"]
        # Skip hash-named files (no descriptive token)
        if len(family) > 30 and not any(h in family for h in FAMILY_TO_BASE):
            skipped.append((f, "hash-named, no family token"))
            continue
        base_name = best_family_match(family)
        if not base_name:
            skipped.append((f, f"unknown family: '{family[:40]}'"))
            continue
        key = (base_name, parsed["pack_size"])
        groups.setdefault(key, []).append((parsed["role"], f))

    print(f"\n→ Grouped into {len(groups)} (product, pack-size) buckets:")
    for (name, size), items in sorted(groups.items()):
        print(f"   {name}  ({size or 'no size'})  — {len(items)} files")

    # Resolve / create products for each group
    role_order = {"FOP": 0, "01": 1, "02": 2, "03": 3, "04": 4, "BOP": 5, "SC": 6, "NI": 7, "ING": 8}
    products_by_name = {p["name"].lower(): p for p in products}

    uploaded = 0
    updated = 0
    created = 0
    unmatched_groups = []

    for (base_name, target_unit), file_list in sorted(groups.items()):
        # Try exact name + unit match first
        # E.g. "Amul Butter" + "200 g" → look for product where name contains "Amul Butter" AND unit == "200 g"
        target_unit_norm = target_unit or ""
        product_id = None
        product_name_with_size = f"{base_name} ({target_unit_norm})" if target_unit else base_name

        for p in products:
            if p["name"].lower() == base_name.lower() and p["unit"] == target_unit_norm:
                product_id = p["id"]
                break
            # Also try "Amul Butter (200 g)" style names from earlier auto-creates
            if p["name"].lower() == product_name_with_size.lower():
                product_id = p["id"]
                break

        # If no exact size match, try the base product (only if base has no specific size)
        if not product_id and not target_unit:
            for p in products:
                if p["name"].lower() == base_name.lower():
                    product_id = p["id"]
                    break

        # Auto-create new SKU if name matches but unit differs
        if not product_id and target_unit and not args.no_create:
            base_product = products_by_name.get(base_name.lower())
            if base_product:
                if args.dry_run:
                    print(f"   [PLAN] create '{product_name_with_size}' (clone from {base_product['name']})")
                    continue
                new_id = create_sku_variant(base_product, target_unit)
                if new_id:
                    created += 1
                    product_id = new_id
                    print(f"   ✦ Created new SKU: {product_name_with_size}")

        if not product_id:
            unmatched_groups.append((base_name, target_unit, [f.name for _, f in file_list]))
            continue

        # Upload + update
        file_list.sort(key=lambda x: role_order.get(x[0], 99))
        urls = []
        for role, f in file_list:
            sha = hashlib.sha1(f.name.encode()).hexdigest()[:8]
            dest = f"{product_id}/{role.lower()}-{sha}{f.suffix.lower()}"
            ct = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}[f.suffix.lower()]
            if args.dry_run:
                urls.append(storage_public_url(dest))
                continue
            ok = storage_upload(f.read_bytes(), dest, ct)
            if ok:
                uploaded += 1
                urls.append(storage_public_url(dest))

        if urls:
            if args.dry_run:
                print(f"   [PLAN] {product_name_with_size}: {len(urls)} images")
            else:
                rest(
                    "PATCH",
                    f"/rest/v1/products?id=eq.{product_id}",
                    {"image_url": urls[0], "image_urls": urls[1:] or []},
                )
                updated += 1
                print(f"   ✓ {product_name_with_size}  ({len(urls)} images)")

    print(f"\n✓ Done.")
    print(f"   Created SKUs:    {created}")
    print(f"   Uploaded files:  {uploaded}")
    print(f"   Products updated:{updated}")
    if skipped:
        print(f"   Skipped files:   {len(skipped)}")
        for f, why in skipped[:10]:
            print(f"     • {f.name} — {why}")
    if unmatched_groups:
        print(f"\n   ⚠ Unmatched groups ({len(unmatched_groups)}):")
        for name, size, files in unmatched_groups:
            print(f"     • '{name}' ({size or 'no size'})  — {len(files)} files")


if __name__ == "__main__":
    main()
