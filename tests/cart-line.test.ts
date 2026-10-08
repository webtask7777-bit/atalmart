import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLine, resolveLines, summarizeLines, computeQuote, defaultVariant, cartKey } from "@/lib/cart-line";
import { AMUL, BREAD, V500, V1L, line, DELIVERY } from "./fixtures";

test("T02 — selected 1 L resolves to variant price, MRP and a size-free label", () => {
  const l = resolveLine(line(AMUL, V1L, 1));
  assert.equal(l.displayName, "Amul Taaza Milk (1 L)");
  assert.equal(l.familyName, "Amul Taaza Milk");
  assert.equal(l.packLabel, "1 L");
  assert.equal(l.unitPrice, 59);
  assert.equal(l.unitMrp, 62);
  assert.equal(l.lineTotal, 59);
  assert.equal(l.key, cartKey("p-amul", "v-1l"));
  assert.ok(!l.displayName.includes("500 ml"), "no contradictory 500 ml label");
});

test("T04 — savings use the selected variant MRP (₹3), not the base product (₹2)", () => {
  const s = summarizeLines(resolveLines([line(AMUL, V1L, 1)]));
  assert.equal(s.merchandiseSavings, 3);
  assert.equal(s.subtotal, 59);
  assert.equal(s.mrpTotal, 62);
});

test("T03 — one 1 L item: ₹59 line, ₹59 subtotal, ₹25 delivery, ₹84 total", () => {
  const s = summarizeLines(resolveLines([line(AMUL, V1L, 1)]));
  const q = computeQuote({ subtotal: s.subtotal, couponDiscount: 0, deliveryFee: DELIVERY.fee, freeDeliveryAbove: DELIVERY.freeAbove });
  assert.equal(q.subtotal, 59);
  assert.equal(q.deliveryFee, 25);
  assert.equal(q.total, 84);
});

test("T05 — quantity 2 of 1 L: ₹118 subtotal, ₹124 MRP, ₹6 savings, ₹143 total", () => {
  const s = summarizeLines(resolveLines([line(AMUL, V1L, 2)]));
  assert.deepEqual([s.subtotal, s.mrpTotal, s.merchandiseSavings], [118, 124, 6]);
  const q = computeQuote({ subtotal: s.subtotal, couponDiscount: 0, deliveryFee: 25, freeDeliveryAbove: 299 });
  assert.equal(q.total, 143);
});

test("T06 — one of each variant: separate lines ₹30 + ₹59, ₹89 subtotal, ₹94 MRP, ₹5 savings, ₹114 total", () => {
  const lines = resolveLines([line(AMUL, V500, 1), line(AMUL, V1L, 1)]);
  assert.equal(lines.length, 2);
  assert.notEqual(lines[0].key, lines[1].key, "cart keys distinguish variants");
  assert.deepEqual(lines.map((l) => l.lineTotal), [30, 59]);
  const s = summarizeLines(lines);
  assert.deepEqual([s.subtotal, s.mrpTotal, s.merchandiseSavings], [89, 94, 5]);
  assert.equal(computeQuote({ subtotal: 89, couponDiscount: 0, deliveryFee: 25, freeDeliveryAbove: 299 }).total, 114);
});

test("T07 — removing the 1 L line leaves 500 ml untouched", () => {
  const items = [line(AMUL, V500, 2), line(AMUL, V1L, 1)];
  const remaining = items.filter((it) => cartKey(it.product.id, it.variant?.id) !== cartKey("p-amul", "v-1l"));
  const s = summarizeLines(resolveLines(remaining));
  assert.equal(remaining[0].quantity, 2);
  assert.equal(s.subtotal, 60);
});

test("single-pack product keeps its catalogue name and product price", () => {
  const l = resolveLine(line(BREAD, null, 1));
  assert.equal(l.displayName, "Britannia Bread (400 g)");
  assert.equal(l.unitPrice, 45);
  assert.equal(l.lineSavings, 5);
  assert.equal(l.key, "p-bread");
});

test("default variant: is_default wins, else lowest sort_order", () => {
  assert.equal(defaultVariant(AMUL)?.id, "v-500");
  assert.equal(defaultVariant({ variants: [{ ...V1L, is_default: false }, { ...V500, is_default: false }] })?.id, "v-500");
  assert.equal(defaultVariant(BREAD), null);
});

test("T18 — free delivery is inclusive at ₹299 (after coupon)", () => {
  const q = (subtotal: number, couponDiscount = 0) =>
    computeQuote({ subtotal, couponDiscount, deliveryFee: 25, freeDeliveryAbove: 299 });
  assert.equal(q(298).deliveryFee, 25);
  assert.equal(q(299).deliveryFee, 0);
  assert.equal(q(300).deliveryFee, 0);
  assert.equal(q(298).freeDeliveryGap, 1);
  assert.equal(q(299).deliveryWaived, 25);
  // Coupon can pull an order back under the threshold — fee returns, gap explains it.
  assert.equal(q(320, 50).deliveryFee, 25);
  assert.equal(q(320, 50).freeDeliveryGap, 29);
});

test("T17 — minimum order counts merchandise only; delivery never satisfies it", () => {
  const q = (subtotal: number) =>
    computeQuote({ subtotal, couponDiscount: 0, deliveryFee: 25, freeDeliveryAbove: 299, minOrderAmount: 49 });
  assert.equal(q(48).minOrderGap, 1);
  assert.equal(q(49).minOrderGap, 0);
  assert.equal(q(50).minOrderGap, 0);
  assert.equal(q(24).minOrderGap, 25, "₹24 + ₹25 delivery is still short");
});

test("wallet caps at balance and at the payable amount", () => {
  const q = computeQuote({ subtotal: 59, couponDiscount: 0, deliveryFee: 25, freeDeliveryAbove: 299, walletBalance: 500, useWallet: true });
  assert.equal(q.walletApplied, 84);
  assert.equal(q.total, 0);
  const q2 = computeQuote({ subtotal: 59, couponDiscount: 0, deliveryFee: 25, freeDeliveryAbove: 299, walletBalance: 20, useWallet: true });
  assert.equal(q2.walletApplied, 20);
  assert.equal(q2.total, 64);
});

test("money stays whole rupees even for a fractional legacy price", () => {
  const l = resolveLine(line({ ...BREAD, price: 49.99, mrp: 55.5 }, null, 3));
  assert.equal(l.unitPrice, 50);
  assert.equal(l.lineTotal, 150);
  assert.ok(Number.isInteger(l.lineSavings));
});
