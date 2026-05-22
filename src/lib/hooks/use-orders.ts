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
import { sendWhatsApp } from "@/lib/whatsapp";
import {
  useAcquisitionStore,
  useCampaignAnalyticsStore,
} from "@/lib/store/acquisition";
import type { Order, CartItem } from "@/types";

interface CreateOrderInput {
  items: CartItem[];
  address_line: string;
  phone: string;
  payment_method: "cod" | "online";
  total: number;
  delivery_fee: number;
  discount?: number;
  coupon_code?: string;
}

export function useOrders() {
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

    const { data } = await supabase
      .from("orders")
      .select("*, items:order_items(*), rider:riders(*)")
      .eq("user_id", user.id)
      .order("placed_at", { ascending: false });

    setOrders((data as Order[]) || []);
    setLoading(false);
  }, []);

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
      .select("*, items:order_items(*, product:products(*)), rider:riders(*)")
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
      notes: null,
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
          ? `${it.product.name} (${it.variant.unit})`
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

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not logged in" };

  // Atomic placement: place_order_atomic decrements stock + inserts orders +
  // order_items inside a single transaction. If ANY product is short, the
  // entire txn rolls back with INSUFFICIENT_STOCK:<product_id>. This is what
  // prevents two simultaneous checkouts from overselling the same last item.
  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    "place_order_atomic",
    {
      p_user_id: user.id,
      p_items: input.items.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        // Variant overrides product price when set
        price: item.variant?.price ?? item.product.price,
        variant_id: item.variant?.id ?? null,
        variant_unit: item.variant?.unit ?? null,
      })),
      p_total: input.total,
      p_delivery_fee: input.delivery_fee,
      p_discount: input.discount || 0,
      p_address_line: input.address_line,
      p_lat: 21.161,
      p_lng: 81.787,
      p_phone: input.phone,
      p_payment_method: input.payment_method,
      p_coupon_code: input.coupon_code || null,
      p_notes: null,
    },
  );

  if (rpcErr) {
    // Surface a friendly oversell message; pass through other errors verbatim
    const msg = rpcErr.message || "";
    if (msg.includes("INSUFFICIENT_STOCK")) {
      const productId = msg.split("INSUFFICIENT_STOCK:")[1]?.trim() || "an item";
      return {
        data: null,
        error: `Sorry — ${productId} just sold out. Please refresh your cart.`,
      };
    }
    return { data: null, error: msg || "Failed to place order" };
  }

  const orderId = (rpcRows as { order_id: string }[] | null)?.[0]?.order_id;
  if (!orderId) {
    return { data: null, error: "Order placement returned no ID" };
  }

  // Fetch the freshly-created order with items + profile for return value
  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("*, items:order_items(*), profile:profiles(*)")
    .eq("id", orderId)
    .single();

  if (fetchErr || !order) {
    return { data: null, error: fetchErr?.message || "Order created but not retrievable" };
  }

  return { data: order as Order, error: null };
}
