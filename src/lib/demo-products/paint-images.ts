import type { Product } from "@/types";

/**
 * Demo mode paints real product images onto the demo catalogue.
 *
 * The demo seed files ship with `image_url: null` (images are uploaded to the
 * live store post-launch), so the demo used to show 📦 placeholders everywhere.
 * This maps each demo product to a real image from the LIVE catalogue by name
 * (see scripts/_match-demo-images.mjs — ~550 of ~1150 match), so the demo looks
 * like the real store.
 *
 * The map is dynamic-imported so it only loads in demo mode and never bloats the
 * production/live bundle. Products with no match keep the 📦 fallback.
 */

type ImgEntry = { image_url: string; image_urls?: string[] };
let mapCache: Record<string, ImgEntry> | null = null;

async function getMap(): Promise<Record<string, ImgEntry>> {
  if (mapCache) return mapCache;
  const mod = await import("./live-image-map.json");
  mapCache = (mod.default ?? mod) as Record<string, ImgEntry>;
  return mapCache;
}

export async function paintDemoImages(products: Product[]): Promise<Product[]> {
  const map = await getMap();
  return products.map((p) => {
    if (p.image_url) return p; // already has one
    const hit = map[p.name];
    if (!hit) return p;
    return {
      ...p,
      image_url: hit.image_url,
      image_urls: hit.image_urls?.length ? hit.image_urls : p.image_urls,
    };
  });
}
