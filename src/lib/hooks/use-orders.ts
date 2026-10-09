"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import { demoOrders, demoRiders } from "@/lib/hooks/use-admin";
import {
  addDemoOrder,
  getDemoOrder,
  getAllDemoOrders,
} from "@/lib/store/demo-orders";
import { adjustStockBulk } from "@/lib/store/demo-products";
import { getLiveStoreStatus, STORE_STATUS_COPY } from "@/lib/store/settings";
import { sendWhatsApp } from "@/lib/whatsapp";
import {
  useAcquisitionStore,
  useCampaignAnalyticsStore,
} from "@/lib/store/acquisition";
import { sellableName } from "@/lib/product-name";
import type { Order, CartItem } from "@/types";

interface CreateOrderInput {
  items: CartItem[];
  address_line: string;
  phone: string;
  payment_method: "cod" | "online" | "upi";
  total: number;
  delivery_fee: number;
  discount?: number;
  coupon_code?: string;
  /** Wallet credit the customer chose to apply. The server re-caps this to the
   *  real balance; passed through so the server total matches what was charged. */
  walletApplied?: number;
  /** Delivery pincode — feeds coupon pincode rules in server pricing. */
  pincode?: string;
  /** Delivery pin, when the saved address carries one. Beats the pincode
   *  on the server: a pin outside every sector is refused even if the typed
   *  pincode is serviceable. */
  lat?: number | null;
  lng?: number | null;
  /** Razorpay proof for online orders. Required (server-side) when
   *  payment_method === "online" and the amount owed is > 0. */
  payment?: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };
  /** UTR / transaction reference the customer submits after paying the store's
   *  UPI ID directly. Required (server-side) when payment_method === "upi". */
  upi_utr?: string;
}

export function useOrders(options?: { limit?: number }) {
  const limit = options?.limit;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);

    if (isDemoMode()) {
      // Combine pre-baked admin fixtures with customer-created runtime orders
      const runtime = getAllDemoOrders();
      const combined = [...runtime, ...demoOrders];
      const withRider = combined.map((o) => ({
        ...o,
        rider: o.rider_id
          ? demoRiders.find((r) => r.id === o.rider_id) || undefined
          : undefined,
      }));
      setOrders(withRider);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("orders")
      // riders_public (migration 026): safe rider columns, only for riders on
      // the caller's own orders. Customers cannot read `riders` directly.
      .select("*, items:order_items(*), rider:riders_public(*)")
      .eq("user_id", user.id)
      .order("placed_at", { ascending: false });
    if (limit) query = query.limit(limit);
    const { data } = await query;

    setOrders((data as Order[]) || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, refetch: fetchOrders };
}

export function useOrder(id: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  // Latest-only guard so a stale Supabase round-trip from a previous id
  // can't overwrite the current id's order.
  const reqIdRef = useRef(0);

  const fetchOrder = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);

    if (isDemoMode()) {
      // Look first in customer-created orders, then in admin fixtures
      const found = getDemoOrder(id) || demoOrders.find((o) => o.id === id) || null;
      if (myReqId !== reqIdRef.current) return;
      if (found) {
        const rider = found.rider_id
          ? demoRiders.find((r) => r.id === found.rider_id) || null
          : null;
        setOrder({ ...found, rider: rider || undefined });
      } else {
        setOrder(null);
      }
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("orders")
      .select("*, items:order_items(*, product:products(*)), rider:riders_public(*)")
      .eq("id", id)
      .single();

    if (myReqId !== reqIdRef.current) return;
    setOrder((data as Order) || null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (isDemoMode() || !id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        (payload) => {
          setOrder((prev) => prev ? { ...prev, ...payload.new } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  return { order, loading, refetch: fetchOrder };
}

export async function createOrder(input: CreateOrderInput): Promise<{ data: Order | null; error: string | null }> {
  // Store-availability gate (rush handling / pre-launch). Authoritative DB
  // read so a "pause orders" flip stops checkouts even on tabs opened before
  // the toggle. See settings.storeStatus + StoreStatusBoard.
  const store = await getLiveStoreStatus();
  if (store.status !== "open") {
    return {
      data: null,
      error: store.message.trim() || STORE_STATUS_COPY[store.status].body,
    };
  }

  if (isDemoMode()) {
    const ts = Date.now();
    const orderId = `demo-${ts}`;
    // Stable user_id per phone so repeat orders from same phone aggregate as ONE customer
    const userId = `demo-${input.phone}`;
    // Parse recipient name from the prepended address_line (everything before first comma)
    const recipient = input.address_line.split(",")[0]?.trim() || "Demo Customer";
    const demoOrder: Order = {
      id: orderId,
      user_id: userId,
      status: "placed",
      total: input.total,
      delivery_fee: input.delivery_fee,
      discount: input.discount || 0,
      address_line: input.address_line,
      lat: 21.161,
      lng: 81.787,
      rider_id: null,
      phone: input.phone,
      payment_method: input.payment_method,
      coupon_code: input.coupon_code || null,
      notes: input.upi_utr ? `UPI UTR: ${input.upi_utr} (pending verification)` : null,
      placed_at: new Date().toISOString(),
      delivered_at: null,
      profile: {
        id: userId,
        name: recipient,
        phone: input.phone,
        role: "customer",
        avatar_url: null,
        created_at: new Date().toISOString(),
      },
      items: input.items.map((it, i) => ({
        id: `item-${ts}-${i}`,
        order_id: orderId,
        product_id: it.product.id,
        product_name: it.variant
          ? sellableName(it.product.name, it.variant.unit)
          : it.product.name,
        quantity: it.quantity,
        price: it.variant?.price ?? it.product.price,
        variant_id: it.variant?.id ?? null,
        variant_unit: it.variant?.unit ?? null,
      })),
    };
    // Decrement stock BEFORE persisting the order so an oversell aborts
    // cleanly instead of leaving a phantom order with no inventory deducted.
    // Production parity: the Supabase RPC `place_order_atomic` runs the
    // stock decrement + order insert in a single transaction; this is the
    // closest demo-mode approximation.
    const stockResult = adjustStockBulk(
      input.items.map((it) => ({
        product_id: it.product.id,
        quantity: it.quantity,
      })),
      "decrement",
    );
    if (stockResult.warnings.length > 0) {
      // Roll back any partial decrement and surface a useful error.
      adjustStockBulk(
        input.items.map((it) => ({
          product_id: it.product.id,
          quantity: it.quantity,
        })),
        "restore",
      );
      return {
        data: null,
        error: `Stock changed — please refresh your cart. (${stockResult.warnings[0]})`,
      };
    }
    addDemoOrder(demoOrder);

    // Record acquisition attribution + campaign analytics
    try {
      const acq = useAcquisitionStore.getState();
      if (acq.current?.source) {
        const isFirstOrder = !acq.current.firstOrderId;
        acq.recordOrder(orderId);
        useCampaignAnalyticsStore.getState().recordOrder(
          acq.current.source,
          input.total,
        );
        if (isFirstOrder) {
          useCampaignAnalyticsStore.getState().recordSignup(acq.current.source);
        }

        // If this order originated from a referral code, record signup +
        // credit the referrer if order meets the minimum
        if (acq.current.referrerCode) {
          const { useReferralStore } = await import("@/lib/store/referrals");
          const refStore = useReferralStore.getState();
          refStore.recordSignup({
            referrerCode: acq.current.referrerCode,
            refereePhone: input.phone,
          });
          refStore.recordOrder({
            refereePhone: input.phone,
            orderId,
            orderTotal: input.total,
          });
        }
      }
    } catch {
      // ignore — store may not be hydrated during SSR
    }

    // Track coupon usage (per-user + global)
    if (input.coupon_code) {
      try {
        const { useCouponStore, useCouponCatalog } = await import(
          "@/lib/store/coupon"
        );
        useCouponStore.getState().recordUsage(input.coupon_code);
        useCouponCatalog.getState().incrementGlobalUsage(input.coupon_code);
      } catch {
        // ignore
      }
    }

    // Fire-and-forget WhatsApp confirmation
    sendWhatsApp(input.phone, "order_placed", [
      orderId.slice(-8).toUpperCase(),
      String(input.total),
    ]);

    return { data: demoOrder, error: null };
  }

  // Live placement goes through the server route /api/orders/place. The server
  // RE-PRICES the cart from canonical data (ignoring client totals/prices),
  // verifies the Razorpay payment, and writes via the service role. NEVER call
  // place_order_atomic from the client — it would trust client-supplied
  // user_id / total / prices (buy-for-₹1 / place-as-someone-else). The RPC is
  // locked to service_role by migration 012.
  let res: Response;
  try {
    res = await fetch("/api/orders/place", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: input.items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          variant_id: item.variant?.id ?? null,
        })),
        couponCode: input.coupon_code,
        walletApplied: input.walletApplied,
        pincode: input.pincode,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        address_line: input.address_line,
        phone: input.phone,
        payment_method: input.payment_method,
        payment: input.payment,
        upi_utr: input.upi_utr,
      }),
    });
  } catch {
    return { data: null, error: "Network error — please try again" };
  }

  const payload = (await res.json().catch(() => ({}))) as {
    order?: Order;
    error?: string;
  };
  if (!res.ok || !payload.order) {
    return { data: null, error: payload.error || "Failed to place order" };
  }

  return { data: payload.order, error: null };
}
