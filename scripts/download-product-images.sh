#!/usr/bin/env bash
# Download product images from official brand sites and convert to WebP.
# Usage: ./download-product-images.sh <mapping_file>
# mapping_file format: <productId>|<referer>|<imageUrl>

set -euo pipefail

MAPPING="${1:-/dev/stdin}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/products"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok=0; fail=0
while IFS='|' read -r pid referer url; do
  [ -z "${pid:-}" ] && continue
  case "$pid" in \#*) continue ;; esac

  ext="${url##*.}"; ext="${ext%%\?*}"
  tmpfile="$TMP/$pid.$ext"
  out="$OUT_DIR/$pid.webp"

  # Try up to 3 times with backoff on 429
  attempt=0
  code=""
  while [ $attempt -lt 3 ]; do
    code=$(curl -s -L -A "$UA" -e "$referer" "$url" -o "$tmpfile" -w "%{http_code}")
    if [ "$code" = "200" ] && [ -s "$tmpfile" ]; then break; fi
    if [ "$code" = "429" ]; then
      attempt=$((attempt+1))
      sleep $((attempt * 5))
    else
      break
    fi
  done
  if [ "$code" != "200" ] || [ ! -s "$tmpfile" ]; then
    echo "FAIL  $pid  HTTP=$code  $url"
    fail=$((fail+1))
    sleep 1
    continue
  fi
  sleep 2  # rate-limit-friendly pacing

  # Resize >1000px → 1000px max, convert to webp q=85 (no bg removal — preserve original packaging)
  if cwebp -quiet -q 85 -resize 1000 0 "$tmpfile" -o "$out" 2>/dev/null; then
    orig=$(stat -f%z "$tmpfile")
    new=$(stat -f%z "$out")
    pct=$((100 - new*100/orig))
    # Delete old PNG if WebP successfully created
    rm -f "$OUT_DIR/$pid.png" "$OUT_DIR/$pid.jpg" "$OUT_DIR/$pid.jpeg"
    echo "OK    $pid  ${orig}B → ${new}B (-${pct}%)"
    ok=$((ok+1))
  else
    echo "FAIL  $pid  cwebp failed"
    fail=$((fail+1))
  fi
done < "$MAPPING"

echo ""
echo "Done. OK=$ok FAIL=$fail"
