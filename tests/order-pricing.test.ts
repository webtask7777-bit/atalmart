import { test } from "node:test";
import assert from "node:assert/strict";
import { priceOrder, type PricingDeps } from "@/lib/server/order-pricing";
import type { Coupon } from "@/lib/constants";

/** Server-side quote with the audit fixture (ACCEPTANCE-TESTS.json). */
const PRODUCTS = {
  "p-amul": { id: "p-amul", name: "Amul Taaza Milk (500 ml)", price: 28, stock: 40, active: true },
  "p-bread": { id: "p-bread", name: "Britannia Bread (400 g)", price: 45, stock: 10, active: true },
  "p-gone": { id: "p-gone", name: "Old SKU", price: 10, stock: 5, active: false },
};
const VARIANTS = {
  "v-500": { id: "v-500", product_id: "p-amul", unit: "500 ml", price: 30, stock: 50 },
  "v-1l": { id: "v-1l", product_id: "p-amul", unit: "1 L", price: 59, stock: 30 },
  "v-other": { id: "v-other", product_id: "p-bread", unit: "800 g", price: 1, stock: 99 },
};
const COUPONS: Record<string, Coupon> = {
  NAYA10: { code: "NAYA10", description: "", type: "percent", value: 10, minOrder: 299, maxDiscount: 100 },
  ATAL50: { code: "ATAL50", description: "", type: "flat", value: 50, minOrder: 199, firstOrderOnly: true },
};
const deps = (over: Partial<PricingDeps> = {}, rules = { fee: 25, freeAbove: 299, minOrder: 49 }): PricingDeps => ({
  getProduct: async (id) => (PRODUCTS as Record<string, (typeof PRODUCTS)["p-amul"]>)[id] ?? null,
  getVariant: async (id) => (VARIANTS as Record<string, (typeof VARIANTS)["v-500"]>)[id] ?? null,
  getCoupon: async (code) => COUPONS[code.toUpperCase()] ?? null,
  getUserOrderCount: async () => 0,
  getUserCouponUsage: async () => 0,
  getWalletBalance: async () => 0,
  getDeliveryRules: async () => rules,
  ...over,
});

test("T03 — 1 L variant: ₹59 line, ₹59 subtotal, ₹25 delivery, ₹84 total, label says 1 L only", async () => {
  const r = await priceOrder({ lines: [{ product_id: "p-amul", quantity: 1, variant_id: "v-1l" }] }, "u1", deps());
  assert.ok(r.ok);
  assert.equal(r.lines[0].product_name, "Amul Taaza Milk (1 L)");
  assert.equal(r.lines[0].unit_price, 59);
  assert.deepEqual([r.subtotal, r.deliveryFee, r.total], [59, 25, 84]);
});

test("T06 — one of each variant: two lines, ₹89 subtotal, ₹114 total", async () => {
  const r = await priceOrder(
    { lines: [{ product_id: "p-amul", quantity: 1, variant_id: "v-500" }, { product_id: "p-amul", quantity: 1, variant_id: "v-1l" }] },
    "u1",
    deps(),
  );
  assert.ok(r.ok);
  assert.deepEqual(r.lines.map((l) => [l.product_name, l.line_total]), [["Amul Taaza Milk (500 ml)", 30], ["Amul Taaza Milk (1 L)", 59]]);
  assert.deepEqual([r.subtotal, r.total], [89, 114]);
});

test("T09 — the server ignores client prices and rejects foreign / missing variants and inactive products", async () => {
  // No price field exists on a cart line — the only inputs are ids + qty.
  const swapped = await priceOrder({ lines: [{ product_id: "p-amul", quantity: 1, variant_id: "v-other" }] }, "u1", deps());
  assert.ok(!swapped.ok && swapped.status === 400 && /does not belong/.test(swapped.error));
  const missing = await priceOrder({ lines: [{ product_id: "p-amul", quantity: 1, variant_id: "v-nope" }] }, "u1", deps());
  assert.ok(!missing.ok && missing.status === 404);
  const gone = await priceOrder({ lines: [{ product_id: "p-gone", quantity: 1 }] }, "u1", deps());
  assert.ok(!gone.ok && gone.status === 409);
  const over = await priceOrder({ lines: [{ product_id: "p-amul", quantity: 31, variant_id: "v-1l" }] }, "u1", deps());
  assert.ok(!over.ok && over.status === 409 && /only 30 in stock/.test(over.error));
});

test("T17 — minimum order on merchandise: ₹48 refused, ₹49 and ₹50 priced; delivery never counts", async () => {
  const at = (price: number) =>
    priceOrder({ lines: [{ product_id: "p-x", quantity: 1 }] }, "u1", deps({ getProduct: async () => ({ id: "p-x", name: "X", price, stock: 9, active: true }) }));
  const r48 = await at(48);
  assert.ok(!r48.ok && r48.status === 400 && /Minimum order ₹49/.test(r48.error));
  const r49 = await at(49);
  assert.ok(r49.ok && r49.total === 74);
  assert.ok((await at(50)).ok);
  // No minimum configured → nothing is refused.
  const none = await priceOrder({ lines: [{ product_id: "p-amul", quantity: 1, variant_id: "v-500" }] }, "u1", deps({}, { fee: 25, freeAbove: 299, minOrder: 0 }));
  assert.ok(none.ok);
});

test("T18 — free delivery inclusive at ₹299 after coupon", async () => {
  const at = (price: number, couponCode?: string) =>
    priceOrder({ lines: [{ product_id: "p-x", quantity: 1 }], couponCode }, "u1", deps({ getProduct: async () => ({ id: "p-x", name: "X", price, stock: 9, active: true }) }));
  const a = await at(298), b = await at(299), c = await at(300);
  assert.ok(a.ok && a.deliveryFee === 25);
  assert.ok(b.ok && b.deliveryFee === 0 && b.total === 299);
  assert.ok(c.ok && c.deliveryFee === 0);
  // NAYA10 on ₹320 → −₹32 → ₹288 after coupon → fee applies again.
  const d = await at(320, "NAYA10");
  assert.ok(d.ok && d.couponDiscount === 32 && d.deliveryFee === 25 && d.total === 313);
});

test("T20 — NAYA10: threshold, ₹100 cap, whole-rupee rounding", async () => {
  const at = (price: number) =>
    priceOrder({ lines: [{ product_id: "p-x", quantity: 1 }], couponCode: "NAYA10" }, "u1", deps({ getProduct: async () => ({ id: "p-x", name: "X", price, stock: 9, active: true }) }));
  const under = await at(298);
  assert.ok(!under.ok && /Min order ₹299/.test(under.error));
  const r = await at(1234);
  assert.ok(r.ok && r.couponDiscount === 100 && r.total === 1134);
  const odd = await at(305); // 10% = 30.5 → rounds to 31 (Math.round), stays an integer
  assert.ok(odd.ok && Number.isInteger(odd.couponDiscount) && odd.couponDiscount === 31);
});

test("T19 — ATAL50 first-order only; ₹199 boundary", async () => {
  const at = (price: number, orders: number) =>
    priceOrder({ lines: [{ product_id: "p-x", quantity: 1 }], couponCode: "ATAL50" }, "u1", deps({
      getProduct: async () => ({ id: "p-x", name: "X", price, stock: 9, active: true }),
      getUserOrderCount: async () => orders,
    }));
  assert.ok(!(await at(198, 0)).ok);
  const ok = await at(199, 0);
  assert.ok(ok.ok && ok.couponDiscount === 50);
  const returning = await at(199, 1);
  assert.ok(!returning.ok && /first order/i.test(returning.error));
});
