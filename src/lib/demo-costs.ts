/**
 * Demo-mode cost synthesis.
 *
 * Live mode gets real wholesale costs from products.cost_price (entered in the
 * admin / written by receive_purchase_order). Demo mode has no such data, so we
 * synthesise a *deterministic* plausible cost per SKU purely from its id + price
 * — same id always yields the same cost, so the Pricing table and the P&L page
 * agree, and a handful of SKUs deliberately land as thin-margin / loss-making so
 * the flags on those pages have something to show.
 *
 * This exists ONLY to make the demo sandbox exercisable. It never runs in live
 * mode (all callers gate on isDemoMode()).
 */

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** A deterministic pseudo wholesale cost for a demo SKU. */
export function demoLineCost(productId: string, price: number): number {
  const p = Number(price) || 0;
  if (p <= 0) return 0;
  const h = hash(productId || String(p));
  const bucket = h % 12;
  let ratio: number;
  if (bucket === 0) ratio = 1.04 + (h % 6) / 100; // ~1 in 12 sells below cost
  else if (bucket === 1) ratio = 0.9 + (h % 6) / 100; // thin margin
  else ratio = 0.58 + (h % 24) / 100; // healthy 58–81% of price
  return Math.max(1, Math.round(p * ratio));
}

/** Fill cost_price on demo products that don't already have one. */
export function withDemoCosts<T extends { id: string; price: number; cost_price?: number }>(
  products: T[],
): T[] {
  return products.map((p) =>
    p.cost_price && p.cost_price > 0
      ? p
      : { ...p, cost_price: demoLineCost(p.id, p.price) },
  );
}
