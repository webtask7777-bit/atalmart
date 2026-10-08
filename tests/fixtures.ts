/**
 * Regression fixture from the audit handoff (ACCEPTANCE-TESTS.json):
 *   500 ml ₹30 / MRP ₹32 · 1 L ₹59 / MRP ₹62 · delivery ₹25 · free ≥ ₹299.
 * Test values only — they do not establish the merchant's retail prices.
 */
import type { Product, ProductVariant, CartItem } from "@/types";

export const V500: ProductVariant = {
  id: "v-500", product_id: "p-amul", unit: "500 ml", price: 30, mrp: 32,
  stock: 50, sort_order: 1, is_default: true, image_url: null, created_at: "2026-01-01",
};
export const V1L: ProductVariant = {
  id: "v-1l", product_id: "p-amul", unit: "1 L", price: 59, mrp: 62,
  stock: 30, sort_order: 2, is_default: false, image_url: null, created_at: "2026-01-01",
};
/** The live shape: catalogue row named "(500 ml)" at ₹28 that ALSO has variants. */
export const AMUL: Product = {
  id: "p-amul", name: "Amul Taaza Milk (500 ml)", name_hi: "अमूल ताज़ा दूध", description: "Toned milk",
  category_id: "c-dairy", subcategory: "Milk", price: 28, mrp: 30, unit: "500 ml", image_url: null,
  stock: 40, active: true, created_at: "2026-01-01", variants: [V500, V1L],
  category: { id: "c-dairy", name: "Dairy", name_hi: "डेयरी", icon: "🥛", sort_order: 2, active: true },
};
export const BREAD: Product = {
  id: "p-bread", name: "Britannia Bread (400 g)", name_hi: "ब्रेड", description: null,
  category_id: "c-bakery", price: 45, mrp: 50, unit: "400 g", image_url: null,
  stock: 10, active: true, created_at: "2026-01-01",
};
export const line = (product: Product, variant: ProductVariant | null, quantity: number): CartItem => ({
  product, variant, quantity,
});
export const DELIVERY = { fee: 25, freeAbove: 299 };
