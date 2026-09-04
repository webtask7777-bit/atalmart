/**
 * Admin reports — pure aggregators over orders / purchase orders / products.
 * No I/O; the Reports page feeds these from the existing hooks and the Excel
 * exporter (report-export.ts) turns the rows into sheets.
 */

import { isRealisedOrder, orderPnl } from "@/lib/pnl";
import type { Order, Product, PurchaseOrder } from "@/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Sales register ────────────────────────────────────────────────────────
export interface SalesRow {
  orderId: string;
  placedAt: string;
  status: string;
  paymentMethod: string;
  couponCode: string;
  items: number;
  goods: number;
  discount: number;
  deliveryFee: number;
  total: number;
  cogs: number;
  grossProfit: number;
}

export function salesRegister(orders: Order[]): SalesRow[] {
  return [...orders]
    .sort((a, b) => (a.placed_at < b.placed_at ? 1 : -1))
    .map((o) => {
      const p = orderPnl(o);
      return {
        orderId: o.id,
        placedAt: o.placed_at,
        status: o.status,
        paymentMethod: o.payment_method || "cod",
        couponCode: o.coupon_code || "",
        items: (o.items ?? []).reduce((s, it) => s + (Number(it.quantity) || 0), 0),
        goods: p.itemsRevenue,
        discount: p.discount,
        deliveryFee: p.deliveryFee,
        total: p.total,
        cogs: isRealisedOrder(o.status) ? p.cogs : 0,
        grossProfit: isRealisedOrder(o.status) ? p.grossProfit : 0,
      };
    });
}

// ── Purchase register + input GST ─────────────────────────────────────────
export interface PurchaseRow {
  poId: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplier: string;
  status: string;
  lines: number;
  units: number;
  goods: number;
  /** GST split by rate, e.g. { "5": 120.5, "18": 40 } (tax rupees). */
  taxByRate: Record<string, number>;
  tax: number;
  freight: number;
  other: number;
  grandTotal: number;
}

export interface GstRateSummary {
  rate: number;
  taxable: number;
  tax: number;
}

/** Received + draft POs, newest first. Cancelled ones are excluded. */
export function purchaseRegister(pos: PurchaseOrder[]): PurchaseRow[] {
  return pos
    .filter((po) => po.status !== "cancelled")
    .map((po) => {
      const taxByRate: Record<string, number> = {};
      let units = 0;
      let goods = 0;
      let tax = 0;
      for (const it of po.items ?? []) {
        const taxable = (Number(it.unit_cost) || 0) * (Number(it.quantity) || 0);
        const t = taxable * ((Number(it.tax_rate) || 0) / 100);
        const key = String(Number(it.tax_rate) || 0);
        taxByRate[key] = r2((taxByRate[key] ?? 0) + t);
        units += Number(it.quantity) || 0;
        goods += taxable;
        tax += t;
      }
      return {
        poId: po.id,
        invoiceNumber: po.invoice_number || "",
        invoiceDate: po.invoice_date || po.created_at.slice(0, 10),
        supplier: po.supplier?.name || "",
        status: po.status,
        lines: po.items?.length ?? 0,
        units,
        goods: r2(goods),
        taxByRate,
        tax: r2(tax),
        freight: Number(po.shipping_total) || 0,
        other: Number(po.other_charges) || 0,
        grandTotal: Number(po.grand_total) || r2(goods + tax),
      };
    })
    .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1));
}

/** Input-tax credit summary: taxable value + GST grouped by rate. */
export function gstInputSummary(pos: PurchaseOrder[]): GstRateSummary[] {
  const map = new Map<number, GstRateSummary>();
  for (const po of pos) {
    if (po.status !== "received") continue; // only booked stock counts as ITC
    for (const it of po.items ?? []) {
      const rate = Number(it.tax_rate) || 0;
      const taxable = (Number(it.unit_cost) || 0) * (Number(it.quantity) || 0);
      const row = map.get(rate) ?? { rate, taxable: 0, tax: 0 };
      row.taxable = r2(row.taxable + taxable);
      row.tax = r2(row.tax + taxable * (rate / 100));
      map.set(rate, row);
    }
  }
  return [...map.values()].sort((a, b) => a.rate - b.rate);
}

// ── Stock valuation ───────────────────────────────────────────────────────
export interface StockRow {
  productId: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  cost: number;
  value: number;
  price: number;
  retailValue: number;
  costMissing: boolean;
}

export function stockValuation(products: Product[]): StockRow[] {
  return products
    .filter((p) => p.active !== false)
    .map((p) => {
      const stock = Math.max(0, Number(p.stock) || 0);
      const cost = Number(p.cost_price) || 0;
      return {
        productId: p.id,
        name: p.name,
        category: p.category?.name || "",
        unit: p.unit,
        stock,
        cost,
        value: r2(stock * cost),
        price: Number(p.price) || 0,
        retailValue: r2(stock * (Number(p.price) || 0)),
        costMissing: cost <= 0 && stock > 0,
      };
    })
    .sort((a, b) => b.value - a.value);
}

// ── Reorder suggestions ───────────────────────────────────────────────────
export interface ReorderRow {
  productId: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  unitsSold: number;
  /** units/day over the window */
  velocity: number;
  /** stock ÷ velocity; Infinity when nothing sells */
  daysOfCover: number;
  /** units to order to reach `targetDays` of cover, 0 if already covered */
  suggestedQty: number;
  lastCost: number;
  estCost: number;
  urgency: "out" | "critical" | "soon" | "ok";
}

export interface ReorderOptions {
  /** Window the sales were counted over. */
  windowDays: number;
  /** How many days of stock to hold after the order lands. Default 14. */
  targetDays?: number;
  /** Below this many days of cover → "critical". Default 5. */
  criticalDays?: number;
  /** Below this → "soon". Default 10. */
  soonDays?: number;
}

/**
 * Sales velocity per product over the window vs. current stock → what to put
 * on the next Flipkart Wholesale order. Only realised orders count as sales.
 */
export function reorderSuggestions(
  orders: Order[],
  products: Product[],
  opts: ReorderOptions,
): ReorderRow[] {
  const windowDays = Math.max(1, opts.windowDays);
  const targetDays = opts.targetDays ?? 14;
  const criticalDays = opts.criticalDays ?? 5;
  const soonDays = opts.soonDays ?? 10;

  const sold = new Map<string, number>();
  for (const o of orders) {
    if (!isRealisedOrder(o.status)) continue;
    for (const it of o.items ?? []) {
      if (!it.product_id) continue;
      sold.set(it.product_id, (sold.get(it.product_id) ?? 0) + (Number(it.quantity) || 0));
    }
  }

  const rows: ReorderRow[] = [];
  for (const p of products) {
    if (p.active === false) continue;
    const stock = Math.max(0, Number(p.stock) || 0);
    const unitsSold = sold.get(p.id) ?? 0;
    const velocity = unitsSold / windowDays;
    const daysOfCover = velocity > 0 ? stock / velocity : Infinity;
    const suggestedQty = velocity > 0 ? Math.max(0, Math.ceil(velocity * targetDays - stock)) : 0;
    let urgency: ReorderRow["urgency"] = "ok";
    if (stock <= 0 && unitsSold > 0) urgency = "out";
    else if (daysOfCover < criticalDays) urgency = "critical";
    else if (daysOfCover < soonDays) urgency = "soon";
    const lastCost = Number(p.cost_price) || 0;
    rows.push({
      productId: p.id,
      name: p.name,
      category: p.category?.name || "",
      unit: p.unit,
      stock,
      unitsSold,
      velocity: r2(velocity),
      daysOfCover: Number.isFinite(daysOfCover) ? r2(daysOfCover) : Infinity,
      suggestedQty,
      lastCost,
      estCost: r2(suggestedQty * lastCost),
      urgency,
    });
  }
  const rank = { out: 0, critical: 1, soon: 2, ok: 3 };
  return rows
    .filter((r) => r.unitsSold > 0 || r.stock <= 0)
    .sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.daysOfCover - b.daysOfCover || b.unitsSold - a.unitsSold);
}

/** Days between the earliest order in the set and now, at least 1. */
export function windowDaysFromOrders(orders: Order[], fallback: number): number {
  if (orders.length === 0) return fallback;
  const earliest = orders.reduce(
    (min, o) => (o.placed_at < min ? o.placed_at : min),
    orders[0].placed_at,
  );
  const days = (Date.now() - new Date(earliest).getTime()) / 86_400_000;
  return Math.max(1, Math.min(fallback, Math.ceil(days)));
}

/** ISO date (YYYY-MM-DD) `days` ago — kept out of components so render stays pure. */
export function sinceIsoForDays(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
