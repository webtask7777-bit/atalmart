"use client";

import type { ImageLoaderProps } from "next/image";
import { supabaseTransformUrl } from "@/lib/supabase-image-url";

/**
 * Custom next/image loader (wired via `images.loaderFile` in next.config.ts).
 *
 * Why: Vercel's image optimizer quota was exhausted (402s site-wide), so the
 * site fell back to `unoptimized: true` — which shipped 2800×2800 product
 * JPGs (600 KB+) into 124 px cards. Supabase Storage has its own image
 * transformation endpoint (`/render/image/`) that resizes + converts to
 * WebP on the fly, so we route every Supabase public-storage URL through
 * it and let `sizes`/`srcset` pick the right width.
 *
 * The transform is requested as a `width × width` box with `resize=contain`:
 * every Supabase image on the site sits in a square, object-contain frame
 * (product cards, detail hero, gallery thumbs, admin previews), and many
 * pack shots are tall portraits — width-only resizing left a 384×2560 image
 * behind a 60×384 slot. Contain caps the LONGER side at `width` and keeps
 * the aspect ratio, so it is safe for landscape sources too.
 *
 * Anything that is NOT a Supabase storage URL (local /banners, /categories,
 * data: QR codes, admin picker thumbnails) is returned untouched.
 */
export default function supabaseImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  return (
    supabaseTransformUrl(src, {
      width,
      height: width,
      resize: "contain",
      quality: quality ?? 75,
    }) ?? src
  );
}
