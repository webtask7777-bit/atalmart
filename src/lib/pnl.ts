/**
 * Profit & Loss math — pure functions, no I/O.
 *
 * Everything here follows the money convention in `./money.ts`: values are
 * whole/decimal rupees, and we never trust the client to have done the sums.
 * These helpers turn (cost, price, mrp) and (orders + their line COGS) into the
 * numbers the admin P&L and pricing console render.
 *
 * Definitions used across the admin:
 *   • cost   — landed wholesale cost per unit (products.cost_price)
 *   • price  — the selling price the customer pays (products.price)
 *   • mrp    — printed maximum retail price
 *   • margin (₹)  = price − cost           (gross profit per unit)
 *   • margin (%)  = margin / price × 100    (as a share of revenue, not cost)
 *   • markup (%)  = margin / cost × 100     (how much we mark cost up)
 *   • COGS   — cost of goods sold = Σ(line cost × qty) over sold items
 *   • Gross profit = revenue − COGS
 *   • Net profit   = gross profit − discounts − delivery subsidy + other
 */

import type { Order, OrderItem, Product } from "@/types";

export interface Margin {
  cost: number;
  price: number;
  mrp: number;
  /** price − cost, per unit. Negative = selling below cost (a loss). */
  marginRupees: number;
  /** margin as a % of price (revenue share). 0 when price is 0. */
  marginPct: number;
  /** margin as a % of cost (markup). 0 when cost is 0/unknown. */
  markupPct: number;
  /** true when cost is 0 — margin can't be trusted, flag for data entry. */
  costMissing: boolean;
  /** true when price < cost (and cost is known) — actively loss-making. */
  lossMaking: boolean;
  /** discount off MRP the customer sees, as a %. */
  mrpDiscountPct: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Per-unit margin breakdown for one price/cost/mrp triple. */
export function computeMargin(
  price: number,
  cost: number,
  mrp: number = price,
): Margin {
  const p = Number(price) || 0;
  const c = Number(cost) || 0;
  const m = Number(mrp) || p;
  const marginRupees = r2(p - c);
  const costMissing = c <= 0;
  return {
    cost: c,
    price: p,
    mrp: m,
    marginRupees,
    marginPct: p > 0 ? r2((marginRupees / p) * 100) : 0,
    markupPct: c > 0 ? r2((marginRupees / c) * 100) : 0,
    costMissing,
    lossMaking: !costMissing && p < c,
    mrpDiscountPct: m > 0 ? r2(((m - p) / m) * 100) : 0,
  };
}

/** Margin for a catalog product (uses its default price + cost). */
export function productMargin(p: Product): Margin {
  return computeMargin(p.price, p.cost_price ?? 0, p.mrp);
}

/**
 * Given a desired margin % (of price) and a known cost, the selling price that
 * hits it. Rounded to whole rupees (grocery convention). Returns cost when the
 * target is impossible (>= 100%).
 *
 *   price = cost / (1 − targetPct/100)
 */
export function priceForTargetMargin(cost: number, targetPct: number): number {
  const c = Number(cost) || 0;
  const t = Number(targetPct) || 0;
  if (c <= 0) return 0;
  if (t <= 0) return Math.round(c);
  if (t >= 100) return Math.round(c); // unreachable target → fall back to cost
  return Math.round(c / (1 - t / 100));
}

export interface OrderPnl {
  orderId: string;
  status: string;
  placedAt: string;
  /** Merchandise revenue = Σ line price×qty (excludes delivery fee). */
  itemsRevenue: number;
  /** Σ line cost×qty. */
  cogs: number;
  /** itemsRevenue − cogs. */
  grossProfit: number;
  grossMarginPct: number;
  discount: number;
  deliveryFee: number;
  /** What the customer paid in total (orders.total). */
  total: number;
  /** How many line COGS values were missing (cost 0) — data-quality signal. */
  linesMissingCost: number;
}

/** Should an order count toward realised P&L? Cancelled/return-rejected don't. */
export function isRealisedOrder(status: string): boolean {
  return status !== "cancelled" && status !== "return_rejected";
}

/** Roll a single order (with its items) into a P&L row. */
export function orderPnl(order: Order): OrderPnl {
  const items: OrderItem[] = order.items ?? [];
  let itemsRevenue = 0;
  let cogs = 0;
  let linesMissingCost = 0;
  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    itemsRevenue += (Number(it.price) || 0) * qty;
    const unitCost = Number(it.cost_price) || 0;
    if (unitCost <= 0) linesMissingCost += 1;
    cogs += unitCost * qty;
  }
  itemsRevenue = r2(itemsRevenue);
  cogs = r2(cogs);
  const grossProfit = r2(itemsRevenue - cogs);
  return {
    orderId: order.id,
    status: order.status,
    placedAt: order.placed_at,
    itemsRevenue,
    cogs,
    grossProfit,
    grossMarginPct: itemsRevenue > 0 ? r2((grossProfit / itemsRevenue) * 100) : 0,
    discount: Number(order.discount) || 0,
    deliveryFee: Number(order.delivery_fee) || 0,
    total: Number(order.total) || 0,
    linesMissingCost,
  };
}

export interface PnlSummary {
  orders: number;
  itemsRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  discounts: number;
  deliveryFees: number;
  /** grossProfit − discounts (delivery fee is charged to customer, so it's
   *  revenue-neutral here unless you model rider payout separately). */
  netProfit: number;
  netMarginPct: number;
  /** orders that had ≥1 line with no cost entered. */
  ordersWithMissingCost: number;
  avgOrderValue: number;
  avgGrossProfit: number;
}

/**
 * Aggregate realised orders into a P&L summary.
 *
 * Net profit here = gross profit − coupon discounts. Delivery fee is money the
 * customer pays, so it isn't subtracted; if/when rider payouts are modelled,
 * subtract them here. Kept explicit so the admin sees exactly what's counted.
 */
export function summarisePnl(orders: Order[]): PnlSummary {
  const rows = orders.filter((o) => isRealisedOrder(o.status)).map(orderPnl);
  const n = rows.length;
  const itemsRevenue = r2(rows.reduce((s, r) => s + r.itemsRevenue, 0));
  const cogs = r2(rows.reduce((s, r) => s + r.cogs, 0));
  const grossProfit = r2(itemsRevenue - cogs);
  const discounts = r2(rows.reduce((s, r) => s + r.discount, 0));
  const deliveryFees = r2(rows.reduce((s, r) => s + r.deliveryFee, 0));
  const netProfit = r2(grossProfit - discounts);
  return {
    orders: n,
    itemsRevenue,
    cogs,
    grossProfit,
    grossMarginPct: itemsRevenue > 0 ? r2((grossProfit / itemsRevenue) * 100) : 0,
    discounts,
    deliveryFees,
    netProfit,
    netMarginPct: itemsRevenue > 0 ? r2((netProfit / itemsRevenue) * 100) : 0,
    ordersWithMissingCost: rows.filter((r) => r.linesMissingCost > 0).length,
    avgOrderValue: n > 0 ? r2(itemsRevenue / n) : 0,
    avgGrossProfit: n > 0 ? r2(grossProfit / n) : 0,
  };
}

export interface ProductPnlRow {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

/** Break realised orders down by product — the best/worst sellers by profit. */
export function productPnl(orders: Order[]): ProductPnlRow[] {
  const map = new Map<string, ProductPnlRow>();
  for (const o of orders) {
    if (!isRealisedOrder(o.status)) continue;
    for (const it of o.items ?? []) {
      const key = it.product_id || it.product_name;
      const qty = Number(it.quantity) || 0;
      const rev = (Number(it.price) || 0) * qty;
      const cogs = (Number(it.cost_price) || 0) * qty;
      const row =
        map.get(key) ??
        {
          productId: it.product_id || "",
          productName: it.product_name,
          unitsSold: 0,
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          grossMarginPct: 0,
        };
      row.unitsSold += qty;
      row.revenue = r2(row.revenue + rev);
      row.cogs = r2(row.cogs + cogs);
      row.grossProfit = r2(row.revenue - row.cogs);
      row.grossMarginPct = row.revenue > 0 ? r2((row.grossProfit / row.revenue) * 100) : 0;
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.grossProfit - a.grossProfit);
}

export interface PurchaseTotals {
  goodsSubtotal: number;
  taxTotal: number;
  grandTotal: number;
}

/**
 * Totals for a set of PO lines + header extras. Mirrors what
 * receive_purchase_order computes server-side, so the UI preview and the DB
 * agree on the invoice grand total.
 */
export function purchaseTotals(
  lines: { quantity: number; unit_cost: number; tax_rate: number }[],
  shipping: number = 0,
  other: number = 0,
): PurchaseTotals {
  let goods = 0;
  let tax = 0;
  for (const l of lines) {
    const taxable = (Number(l.unit_cost) || 0) * (Number(l.quantity) || 0);
    goods += taxable;
    tax += taxable * (Number(l.tax_rate) || 0) / 100;
  }
  goods = r2(goods);
  tax = r2(tax);
  return {
    goodsSubtotal: goods,
    taxTotal: tax,
    grandTotal: r2(goods + tax + (Number(shipping) || 0) + (Number(other) || 0)),
  };
}

/**
 * Preview the landed unit cost each line will get on receive, matching the
 * allocation the RPC does (header shipping+other spread pro-rata by gross line
 * value). Returned in the same order as `lines`.
 */
export function landedUnitCosts(
  lines: { quantity: number; unit_cost: number; tax_rate: number }[],
  shipping: number = 0,
  other: number = 0,
): number[] {
  const extra = (Number(shipping) || 0) + (Number(other) || 0);
  const gross = lines.map(
    (l) =>
      (Number(l.unit_cost) || 0) *
      (Number(l.quantity) || 0) *
      (1 + (Number(l.tax_rate) || 0) / 100),
  );
  const totalGross = gross.reduce((s, g) => s + g, 0);
  return lines.map((l, i) => {
    const qty = Number(l.quantity) || 0;
    if (qty <= 0) return 0;
    const alloc = totalGross > 0 ? (gross[i] / totalGross) * extra : 0;
    return r2((gross[i] + alloc) / qty);
  });
}
