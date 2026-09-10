import { NextRequest, NextResponse } from "next/server";
import { priceOrder, type PricingDeps } from "@/lib/server/order-pricing";
import { isDemoMode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { rateLimitWithPrune, clientKey } from "@/lib/server/rate-limit";
import { checkStoreOpen, resolveDeliveryZone } from "@/lib/server/launch-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side order pricing endpoint.
 *
 * Client calls this from /checkout to get the authoritative total before
 * placing an order. The server recomputes everything from canonical sources
 * — product prices, coupon rules, wallet balance — so the client cannot
 * tamper with line items or totals.
 *
 * Returns { ok: false, error } when a coupon is invalid, stock is short,
 * etc. — surface these directly to the user.
 *
 * In demo mode, the deps read from in-memory + localStorage proxies (the
 * client passes them via the request body since the server can't see
 * browser-only state). In production, all reads go through Supabase.
 */

interface PriceRequestBody {
  lines: {
    product_id: string;
    quantity: number;
    variant_id?: string | null;
  }[];
  couponCode?: string;
  walletApplied?: number;
  pincode?: string;
  /** Delivery pin, when the customer dropped one. Beats the pincode. */
  lat?: number | null;
  lng?: number | null;
  /**
   * Demo-only fields — the server can't read the customer's localStorage,
   * so the client mirrors relevant state here. Ignored in production where
   * Supabase is the source of truth.
   */
  demoSnapshot?: {
    products: Record<
      string,
      { name: string; price: number; stock: number; active: boolean }
    >;
    coupons: Record<string, import("@/lib/constants").Coupon>;
    userOrderCount: number;
    userCouponUsage: number;
    walletBalance: number;
    deliveryRules: { fee: number; freeAbove: number };
  };
}

export async function POST(req: NextRequest) {
  let body: PriceRequestBody;
  try {
    body = (await req.json()) as PriceRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let userId = "demo-user";
  let deps: PricingDeps;
  // Pricing exposes product + stock + coupon lookups. Without a limit, an
  // attacker can probe every (product_id, coupon_code) tuple. 60 req/min
  // per user (or IP in demo) leaves room for legitimate retypes.
  // userId is set below once we know whether we're in demo mode + auth.

  if (isDemoMode()) {
    const snap = body.demoSnapshot;
    if (!snap) {
      return NextResponse.json(
        { error: "demoSnapshot required in demo mode" },
        { status: 400 },
      );
    }
    deps = {
      getProduct: async (id) => {
        const p = snap.products[id];
        if (!p) return null;
        // Coerce browser-supplied numbers to whole rupees to satisfy the
        // priceOrder assertRupees invariant. Otherwise a malformed
        // demoSnapshot (legacy product with ₹49.99) would crash the route.
        return {
          id,
          name: p.name,
          price: Math.round(p.price),
          stock: Math.max(0, Math.floor(p.stock)),
          active: p.active,
        };
      },
      getCoupon: async (code) => snap.coupons[code.toUpperCase()] || null,
      getUserOrderCount: async () => Math.max(0, Math.floor(snap.userOrderCount)),
      getUserCouponUsage: async () => Math.max(0, Math.floor(snap.userCouponUsage)),
      getWalletBalance: async () => Math.max(0, Math.round(snap.walletBalance)),
      getDeliveryRules: async () => ({
        fee: Math.max(0, Math.round(snap.deliveryRules.fee)),
        freeAbove: Math.max(0, Math.round(snap.deliveryRules.freeAbove)),
      }),
    };
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    userId = user.id;

    deps = {
      getProduct: async (id) => {
        const { data } = await supabase
          .from("products")
          .select("id, name, price, stock, active")
          .eq("id", id)
          .single();
        if (!data) return null;
        // DB column is numeric(10,2) — coerce to whole rupees so the
        // priceOrder assertRupees invariant holds. Legacy rows with
        // fractional prices (₹49.99) would otherwise crash the endpoint.
        const row = data as { id: string; name: string; price: number; stock: number; active: boolean };
        return {
          id: row.id,
          name: row.name,
          price: Math.round(row.price),
          stock: Math.max(0, Math.floor(row.stock)),
          active: row.active,
        };
      },
      getVariant: async (variantId) => {
        const { data } = await supabase
          .from("product_variants")
          .select("id, product_id, unit, price, stock")
          .eq("id", variantId)
          .single();
        if (!data) return null;
        const row = data as { id: string; product_id: string; unit: string; price: number; stock: number };
        return {
          id: row.id,
          product_id: row.product_id,
          unit: row.unit,
          price: Math.round(row.price),
          stock: Math.max(0, Math.floor(row.stock)),
        };
      },
      getCoupon: async (code) => {
        const { data } = await supabase
          .from("coupons")
          .select("*")
          .eq("code", code.toUpperCase())
          .maybeSingle();
        if (!data) return null;
        // DB columns are snake_case; the Coupon type is camelCase. A raw
        // `data as Coupon` cast leaves minOrder/maxDiscount/etc undefined,
        // which silently breaks validateCoupon + calculateCouponDiscount.
        // Keep this mapper in sync with rowToCoupon in src/lib/store/coupon.ts.
        const r = data as Record<string, unknown>;
        return {
          code: r.code as string,
          description: (r.description as string) ?? "",
          type: r.type as "flat" | "percent",
          value: Number(r.value),
          minOrder: Number(r.min_order),
          maxDiscount: r.max_discount == null ? undefined : Number(r.max_discount),
          firstOrderOnly: r.first_order_only === true,
          maxUsesPerUser:
            r.max_uses_per_user == null ? undefined : Number(r.max_uses_per_user),
          totalUsageLimit:
            r.total_usage_limit == null ? undefined : Number(r.total_usage_limit),
          totalUsageCount:
            r.total_usage_count == null ? undefined : Number(r.total_usage_count),
          campaignSource: (r.campaign_source as string) ?? undefined,
          validForPincodes: (r.valid_for_pincodes as string) ?? undefined,
          expiresAt: (r.expires_at as string) ?? undefined,
        } as import("@/lib/constants").Coupon;
      },
      getUserOrderCount: async (uid) => {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid);
        return count || 0;
      },
      getUserCouponUsage: async (uid, code) => {
        // Migration 003 promoted coupon_code to a first-class column. The
        // prior regex-on-notes lookup returned 0 for every post-migration
        // order, silently bypassing maxUsesPerUser limits.
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("coupon_code", code.toUpperCase());
        return count || 0;
      },
      getWalletBalance: async (uid) => {
        const { data } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", uid)
          .maybeSingle();
        return (data as { balance: number } | null)?.balance || 0;
      },
      getDeliveryRules: async () => {
        // Settings live in a singleton row; fall back to defaults
        const { data } = await supabase
          .from("settings")
          .select("delivery_fee, free_delivery_above")
          .eq("id", 1)
          .maybeSingle();
        const row = data as
          | { delivery_fee: number; free_delivery_above: number }
          | null;
        return {
          fee: row?.delivery_fee ?? 25,
          freeAbove: row?.free_delivery_above ?? 299,
        };
      },
    };

    // ── Launch gate: no quote while the store is paused or pre-launch ──
    // The "Opening Soon" board is presentation; this is the enforcement.
    const closed = await checkStoreOpen(supabase);
    if (closed) {
      return NextResponse.json(
        { ok: false, error: closed.error, code: closed.code, store_status: closed.storeStatus },
        { status: closed.status },
      );
    }

    // ── Service-area gate ──
    // Quoting an address we cannot deliver to is how a customer ends up at a
    // payment screen for an order that must then be cancelled. Refuse early.
    // A quote without any address yet is fine — placement re-checks and is
    // the hard gate.
    if (body.pincode || body.lat != null) {
      const zone = await resolveDeliveryZone(supabase, {
        pincode: body.pincode,
        lat: body.lat,
        lng: body.lng,
      });
      if (!zone.ok) {
        return NextResponse.json(
          { ok: false, error: zone.block.error, code: zone.block.code },
          { status: zone.block.status },
        );
      }
    }
  }

  // Rate-limit per authenticated user (or per IP in demo). 60 requests per
  // minute covers a customer retyping a coupon a few times; abuse traffic
  // probing product IDs / coupon codes hits the cap fast.
  const limit = rateLimitWithPrune(
    clientKey(req, isDemoMode() ? null : userId, "price"),
    60,
    60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many pricing requests — wait ${limit.retryAfterSec}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let result;
  try {
    result = await priceOrder(
      {
        lines: body.lines,
        couponCode: body.couponCode,
        walletApplied: body.walletApplied,
        pincode: body.pincode,
      },
      userId,
      deps,
    );
  } catch (err) {
    // assertRupees (or any deps failure) — log and return a user-friendly
    // error instead of leaking the assertion message + stack to the client.
    if (process.env.NODE_ENV !== "production") {
      console.error("[price] priceOrder threw", err);
    }
    return NextResponse.json(
      { error: "Pricing failed — please refresh and try again" },
      { status: 500 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
