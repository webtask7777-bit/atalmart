import type { Product } from "@/types";

/**
 * Stable per-product hash in [0,1) derived from the UUID. Deterministic
 * (same input → same output across reloads, so no flicker) but uncorrelated
 * with the product name. Used as a tiebreaker so different pack sizes of the
 * same product don't line up consecutively in listings.
 */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Stable shuffle ordering: in-stock items first, then ordered by id hash so
 * sibling sizes of the same product end up scattered apart instead of name-
 * sorted (which clustered "Amul Butter 100g/200g/1kg" in a row).
 */
export function shuffleForGrid<T extends Pick<Product, "id" | "stock">>(
  products: T[],
): T[] {
  return [...products].sort((a, b) => {
    const sa = a.stock > 0 ? 0 : 1;
    const sb = b.stock > 0 ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return hashId(a.id) - hashId(b.id);
  });
}
