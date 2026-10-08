/**
 * Production PricingDeps for `priceOrder` — reads canonical product, variant,
 * coupon, wallet and settings data from Supabase. Shared by:
 *   • /api/orders/price   (checkout preview / authoritative quote)
 *   • /api/orders/place   (server-side order placement — the only writer)
 *
 * Keeping this in one place means the two routes can never disagree on what a
 * customer owes. The coupon row→Coupon mapper here MUST stay in sync with
 * rowToCoupon in src/lib/store/coupon.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingDeps } from "@/lib/server/order-pricing";
import type { Coupon } from "@/lib/constants";

export function buildSupabasePricingDeps(
  supabase: SupabaseClient,
): PricingDeps {
  return {
    getProduct: async (id) => {
      const { data } = await supabase
        .from("products")
        .select("id, name, price, stock, active")
        .eq("id", id)
        .single();
      if (!data) return null;
      const row = data as {
        id: string;
        name: string;
        price: number;
        stock: number;
        active: boolean;
      };
      // DB column is numeric(10,2) — coerce to whole rupees so the priceOrder
      // assertRupees invariant holds for legacy fractional rows (₹49.99).
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
      const row = data as {
        id: string;
        product_id: string;
        unit: string;
        price: number;
        stock: number;
      };
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
      } as Coupon;
    },
    getUserOrderCount: async (uid) => {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid);
      return count || 0;
    },
    getUserCouponUsage: async (uid, code) => {
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
      const { data } = await supabase
        .from("settings")
        .select("delivery_fee, free_delivery_above, min_order_amount")
        .eq("id", 1)
        .maybeSingle();
      const row = data as
        | { delivery_fee: number; free_delivery_above: number; min_order_amount?: number | null }
        | null;
      return {
        fee: row?.delivery_fee ?? 25,
        freeAbove: row?.free_delivery_above ?? 299,
        minOrder: row?.min_order_amount ?? 0,
      };
    },
  };
}
