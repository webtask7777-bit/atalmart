import type { Product } from "@/types";

/**
 * Compact factory used by every per-category seed file. Keeps each `p(...)`
 * call short and uniform across the catalogue.
 *
 * `img` defaults to null. Per project policy we don't ship product images
 * (Vivek uploads them post-launch); the cards show a placeholder box icon.
 */
export const p = (
  id: string,
  name: string,
  name_hi: string,
  desc: string,
  cat: string,
  price: number,
  mrp: number,
  unit: string,
  stock: number,
  img?: string,
): Product => ({
  id,
  name,
  name_hi,
  description: desc,
  category_id: cat,
  price,
  mrp,
  unit,
  image_url: img ?? null,
  stock,
  active: true,
  created_at: "",
});
