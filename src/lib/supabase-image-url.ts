/**
 * Supabase Storage image-transform URL helpers. Plain module (no "use
 * client") so it can be used from both the next/image loader in the browser
 * and server code such as generateMetadata / JSON-LD.
 *
 * Supabase's `/render/image/` endpoint resizes and converts to WebP on the
 * fly, which is how product images get served at card size instead of the
 * 2800×2800 originals. Non-Supabase URLs are left untouched by every helper.
 */

export const SUPABASE_PUBLIC_RE =
  /^(https:\/\/[a-z0-9-]+\.supabase\.co)\/storage\/v1\/object\/public\/(.+)$/i;

/** Supabase caps transform width/height at 2500 px. */
export const MAX_TRANSFORM_PX = 2500;

export interface TransformOptions {
  width: number;
  height?: number;
  quality?: number;
  /** Only applied when height is given. Defaults to "contain". */
  resize?: "cover" | "contain" | "fill";
}

/**
 * Rewrite a public-storage URL to its transformed equivalent.
 * Returns null when `src` is not a Supabase public-storage URL.
 */
export function supabaseTransformUrl(
  src: string | null | undefined,
  opts: TransformOptions,
): string | null {
  if (!src) return null;
  const match = src.match(SUPABASE_PUBLIC_RE);
  if (!match) return null;

  const [, origin, rest] = match;
  const [path, query = ""] = rest.split("?");
  const params = new URLSearchParams(query);
  params.set(
    "width",
    String(Math.min(Math.max(Math.round(opts.width), 16), MAX_TRANSFORM_PX)),
  );
  if (opts.height) {
    params.set(
      "height",
      String(Math.min(Math.max(Math.round(opts.height), 16), MAX_TRANSFORM_PX)),
    );
    params.set("resize", opts.resize ?? "contain");
  }
  params.set("quality", String(opts.quality ?? 75));

  return `${origin}/storage/v1/render/image/public/${path}?${params.toString()}`;
}
