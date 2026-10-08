import { test } from "node:test";
import assert from "node:assert/strict";
import { primaryOffer, productDisplayName, productFamilyName, type PublicProduct } from "@/lib/server/public-product";

const base: PublicProduct = {
  id: "p", name: "Amul Taaza Milk (500 ml)", name_hi: null, description: null, price: 28, mrp: 30, unit: "500 ml",
  image_url: null, image_urls: null, stock: 40, active: true, created_at: "", category: { name: "Dairy" },
};

test("T01 — title/metadata quote the default variant, not the product row", () => {
  const p: PublicProduct = {
    ...base,
    variants: [
      { id: "v2", unit: "1 L", price: 59, mrp: 62, stock: 30, is_default: false, sort_order: 2 },
      { id: "v1", unit: "500 ml", price: 30, mrp: 32, stock: 50, is_default: true, sort_order: 1 },
    ],
  };
  const o = primaryOffer(p);
  assert.deepEqual([o.price, o.mrp, o.unit], [30, 32, "500 ml"]);
  assert.equal(productDisplayName(p), "Amul Taaza Milk (500 ml)");
  assert.equal(productFamilyName(p), "Amul Taaza Milk");
  assert.deepEqual(o.packs.map((x) => x.price), [30, 59]);
});

test("single-pack product keeps the row price and name", () => {
  const o = primaryOffer(base);
  assert.deepEqual([o.price, o.unit, o.packs.length], [28, "500 ml", 1]);
  assert.equal(productDisplayName(base), "Amul Taaza Milk (500 ml)");
  assert.equal(productDisplayName({ ...base, name: "Devbhog Shrikhand", unit: "100 g" }), "Devbhog Shrikhand (100 g)");
});
