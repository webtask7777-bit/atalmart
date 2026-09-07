"use client";

/**
 * P&L data layer — pulls orders (with their line-level COGS snapshots) for a
 * date range and hands them to the pure aggregators in `@/lib/pnl`.
 *
 * COGS lives on order_items.cost_price, frozen at sale time by the migration
 * 016 trigger, so this stays accurate even after product costs change.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import {
  productPnl,
  summarisePnl,
  type ProductPnlRow,
  type PnlSummary,
} from "@/lib/pnl";
import type { Order } from "@/types";

export type PnlRange = "today" | "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<PnlRange, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: 3650,
};

function sinceIso(range: PnlRange): string {
  const days = RANGE_DAYS[range];
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  return new Date(ms).toISOString();
}

export function usePnl(range: PnlRange = "30d") {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    if (isDemoMode()) {
      // Demo sandbox: cost each demo order line with the same synthetic cost
      // the Pricing page uses, so the P&L reflects real margins end-to-end.
      const [{ getAllDemoOrders }, { demoOrders }, { demoLineCost }] =
        await Promise.all([
          import("@/lib/store/demo-orders"),
          import("@/lib/hooks/use-admin"),
          import("@/lib/demo-costs"),
        ]);
      const runtime = getAllDemoOrders();
      const combined = [
        ...runtime,
        ...demoOrders.filter((d) => !runtime.find((r) => r.id === d.id)),
      ];
      const costed = combined.map((o) => ({
        ...o,
        items: (o.items ?? []).map((it) => ({
          ...it,
          cost_price:
            it.cost_price && it.cost_price > 0
              ? it.cost_price
              : demoLineCost(it.product_id, it.price),
        })),
      }));
      setOrders(costed);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const since = sinceIso(range);

    // Before migration 016 is applied, order_items.cost_price doesn't exist and
    // PostgREST 400s the select. Detect that once and fall back to a select
    // without cost_price so P&L still shows revenue (COGS reads as 0) instead
    // of a hard error. Re-runs full once migration lands.
    const withCost =
      "id, status, total, delivery_fee, discount, placed_at, coupon_code, payment_method, items:order_items(id, product_id, product_name, quantity, price, cost_price)";
    const withoutCost =
      "id, status, total, delivery_fee, discount, placed_at, coupon_code, payment_method, items:order_items(id, product_id, product_name, quantity, price)";
    let cols = withCost;

    // Page through so ranges wider than 1000 orders don't silently truncate
    // the P&L (same gotcha as useAllProducts).
    const pageSize = 1000;
    const all: Order[] = [];
    let from = 0;
    for (;;) {
      let query = supabase
        .from("orders")
        .select(cols)
        .order("placed_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (range !== "all") query = query.gte("placed_at", since);
      const { data, error } = await query;
      if (error) {
        // Missing column → retry this page with the no-cost projection.
        if (cols === withCost && /cost_price/i.test(error.message || "")) {
          cols = withoutCost;
          continue;
        }
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as unknown as Order[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setOrders(all);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const summary: PnlSummary = useMemo(() => summarisePnl(orders), [orders]);
  const byProduct: ProductPnlRow[] = useMemo(() => productPnl(orders), [orders]);

  return { orders, summary, byProduct, loading, refetch: fetchOrders };
}
