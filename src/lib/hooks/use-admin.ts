"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import { adjustStockBulk } from "@/lib/store/demo-products";
import { useWalletStore } from "@/lib/store/wallet";
import { sendWhatsApp, templateForStatus } from "@/lib/whatsapp";
import type { Order, Rider, OrderStatus, ReturnItem } from "@/types";

/**
 * Credit a refund to wallet. Used by both cancellation (prepaid orders only)
 * and approved returns.
 *
 * For cancellations: refunds the full order.total (prepaid only).
 * For returns: refunds only the selected items' total (return_info.refund_amount),
 * falling back to order.total for legacy returns without items[].
 */
function creditRefundToWallet(
  order: Order,
  reason: "return" | "cancel",
): void {
  if (!order || order.total <= 0) return;
  // For COD orders, no money was paid yet — nothing to refund on cancel.
  // Prefer the first-class payment_method column (migration 003); fall back
  // to the legacy regex on `notes` for orders placed before migration.
  // Without this fix, post-migration orders had `notes = null`, the regex
  // returned false, isPrepaid was true, and every cancelled COD order
  // incorrectly credited the wallet for the full total.
  const paymentMethod = (
    order.payment_method ||
    order.notes?.match(/Payment:\s*(\w+)/)?.[1] ||
    ""
  ).toLowerCase();
  // Only money we actually captured (Razorpay) is auto-refunded. Direct-UPI
  // orders carry an UNVERIFIED UTR — the admin refunds those manually after
  // checking the bank statement, otherwise a fake UTR would mint wallet credit.
  const isPrepaid = paymentMethod === "online";
  if (reason === "cancel" && !isPrepaid) return;

  let amount = order.total;
  let suffix = `(${reason})`;
  if (reason === "return") {
    const refundAmount = order.return_info?.refund_amount;
    const itemCount = order.return_info?.items?.length || 0;
    if (refundAmount && refundAmount > 0) {
      amount = refundAmount;
      suffix = `(return · ${itemCount} item${itemCount === 1 ? "" : "s"})`;
    }
  }

  try {
    useWalletStore.getState().credit({
      type: reason === "return" ? "refund_return" : "refund_cancel",
      amount,
      description: `Refund for #${order.id.slice(-8).toUpperCase()} ${suffix}`,
      orderId: order.id,
    });
  } catch (err) {
    // SSR: store not hydrated. In dev, log so we notice if it fails post-hydration too.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      console.warn("[wallet] refund credit failed", err);
    }
  }
}

// Pre-baked profiles for the 3 demo orders. In real Supabase these come from `profiles` table.
const demoProfiles: Record<string, { id: string; name: string; phone: string; role: "customer"; avatar_url: null; created_at: string }> = {
  u1: { id: "u1", name: "Ravi Sharma", phone: "9876543210", role: "customer", avatar_url: null, created_at: "2025-11-15T10:00:00Z" },
  u2: { id: "u2", name: "Priya Verma", phone: "9876543211", role: "customer", avatar_url: null, created_at: "2026-01-08T14:30:00Z" },
  u3: { id: "u3", name: "Amit Yadav", phone: "9876543212", role: "customer", avatar_url: null, created_at: "2026-04-20T09:15:00Z" },
};

export const demoOrders: Order[] = [
  {
    id: "demo-1",
    user_id: "u1",
    status: "placed",
    total: 342,
    delivery_fee: 0,
    discount: 0,
    address_line: "Ravi Sharma, A-204 Royal Heights, Sector 29, Atal Nagar — 492101",
    lat: 21.162,
    lng: 81.789,
    rider_id: null,
    phone: "9876543210",
    payment_method: "cod",
    coupon_code: null,
    notes: null,
    placed_at: new Date().toISOString(),
    delivered_at: null,
    profile: demoProfiles.u1,
    items: [
      { id: "i1-1", order_id: "demo-1", product_id: "p19", product_name: "Amul Taaza Milk", quantity: 2, price: 28 },
      { id: "i1-2", order_id: "demo-1", product_id: "p23", product_name: "Bread (White)", quantity: 1, price: 40 },
      { id: "i1-3", order_id: "demo-1", product_id: "p31", product_name: "Aashirvaad Atta", quantity: 1, price: 240 },
    ],
  },
  {
    id: "demo-2",
    user_id: "u2",
    status: "out_for_delivery",
    total: 189,
    delivery_fee: 25,
    discount: 0,
    address_line: "Priya Verma, Flat 502 Green Park, Sector 21, Atal Nagar — 492101",
    lat: 21.161,
    lng: 81.787,
    rider_id: "r1",
    phone: "9876543211",
    payment_method: "online",
    coupon_code: null,
    notes: null,
    placed_at: new Date(Date.now() - 600000).toISOString(),
    delivered_at: null,
    profile: demoProfiles.u2,
    items: [
      { id: "i2-1", order_id: "demo-2", product_id: "p98", product_name: "Maggi 2-Minute Noodles", quantity: 4, price: 14 },
      { id: "i2-2", order_id: "demo-2", product_id: "p67", product_name: "Lays Classic Salted", quantity: 3, price: 20 },
      { id: "i2-3", order_id: "demo-2", product_id: "p80", product_name: "Cadbury Dairy Milk", quantity: 1, price: 40 },
    ],
  },
  {
    id: "demo-3",
    user_id: "u3",
    status: "picking",
    total: 520,
    delivery_fee: 0,
    discount: 50,
    address_line: "Amit Yadav, House 12B, Sector 17, Atal Nagar — 492014",
    lat: 21.158,
    lng: 81.785,
    rider_id: null,
    phone: "9876543212",
    payment_method: "cod",
    coupon_code: "ATAL50",
    notes: null,
    placed_at: new Date(Date.now() - 300000).toISOString(),
    delivered_at: null,
    profile: demoProfiles.u3,
    items: [
      { id: "i3-1", order_id: "demo-3", product_id: "p31", product_name: "Aashirvaad Atta", quantity: 2, price: 240 },
      { id: "i3-2", order_id: "demo-3", product_id: "p48", product_name: "Amul Ghee", quantity: 1, price: 290 },
    ],
  },
];

export const demoRiders: Rider[] = [
  { id: "r1", name: "Rahul Kumar", phone: "9876543210", vehicle_number: "CG-04 AB 1234", status: "available", lat: 21.161, lng: 81.787, active: true },
  { id: "r2", name: "Deepak Sahu", phone: "9876543211", vehicle_number: "CG-04 CD 5678", status: "busy", lat: 21.162, lng: 81.788, active: true },
  { id: "r3", name: "Vikram Yadav", phone: "9876543212", vehicle_number: "CG-04 EF 9012", status: "available", lat: null, lng: null, active: true },
  { id: "r4", name: "Sunil Patel", phone: "9876543213", vehicle_number: "CG-04 GH 3456", status: "offline", lat: null, lng: null, active: true },
];

export function useAdminOrders(statusFilter?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);

    if (isDemoMode()) {
      const { getAllDemoOrders } = await import("@/lib/store/demo-orders");
      const runtime = getAllDemoOrders();
      const combined = [
        ...runtime,
        ...demoOrders.filter((d) => !runtime.find((r) => r.id === d.id)),
      ];
      const filtered = statusFilter
        ? combined.filter((o) => o.status === statusFilter)
        : combined;
      // Hydrate rider snapshot for demo orders that reference rider_id
      const withRider = filtered.map((o) => ({
        ...o,
        rider:
          o.rider ||
          (o.rider_id
            ? demoRiders.find((r) => r.id === o.rider_id) || undefined
            : undefined),
      }));
      setOrders(withRider);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let query = supabase
      .from("orders")
      .select("*, items:order_items(*), rider:riders(*), profile:profiles(*)")
      .order("placed_at", { ascending: false })
      .limit(50);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    setOrders((data as Order[]) || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (isDemoMode()) return;
    const supabase = createClient();
    const channel = supabase
      .channel("admin-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => { fetchOrders(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders]);

  return { orders, loading, refetch: fetchOrders };
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  if (isDemoMode()) {
    try {
      const { updateDemoOrder, getDemoOrder } = await import(
        "@/lib/store/demo-orders"
      );
      // Snapshot pre-update for stock restoration + notification recipient
      const before =
        getDemoOrder(orderId) ||
        demoOrders.find((o) => o.id === orderId) ||
        null;

      const patch: Record<string, unknown> = { status };
      if (status === "delivered") patch.delivered_at = new Date().toISOString();
      updateDemoOrder(orderId, patch);

      // Restore stock if order is cancelled (or return approved)
      if (
        before &&
        (status === "cancelled" || status === "return_approved") &&
        before.status !== "cancelled" &&
        before.status !== "return_approved"
      ) {
        const itemsForRestore = (before.items || []).map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
        }));
        if (itemsForRestore.length > 0) {
          adjustStockBulk(itemsForRestore, "restore");
        }
        // Credit refund to wallet (only prepaid orders for cancel)
        if (status === "cancelled") {
          creditRefundToWallet(before, "cancel");
        }
      }

      // Fire WhatsApp notification for this status change
      const tpl = templateForStatus(status);
      if (tpl && before) {
        const phone =
          before.phone ||
          before.profile?.phone ||
          before.notes?.match(/Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)/)?.[1]?.trim() ||
          "";
        sendWhatsApp(phone, tpl.template, [
          orderId.slice(-8).toUpperCase(),
          String(before.total),
        ]);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        console.warn("[order-status] WhatsApp notify failed", err);
      }
    }
    return { error: null };
  }
  const supabase = createClient();
  const updates: Record<string, unknown> = { status };
  if (status === "delivered") updates.delivered_at = new Date().toISOString();

  // If we're cancelling an order (or approving a full return that wasn't an
  // itemized return), restore stock atomically. The RPC accepts an items
  // array and increments products.stock in a single statement.
  if (status === "cancelled" || status === "return_approved") {
    const { data: before } = await supabase
      .from("orders")
      .select("status, items:order_items(product_id, quantity)")
      .eq("id", orderId)
      .single();
    const beforeRow = before as
      | { status: string; items: { product_id: string; quantity: number }[] }
      | null;
    if (
      beforeRow &&
      beforeRow.status !== "cancelled" &&
      beforeRow.status !== "return_approved"
    ) {
      const { error: restoreErr } = await supabase.rpc("restore_stock_atomic", {
        p_items: beforeRow.items,
      });
      if (restoreErr) {
        return { data: null, error: `Stock restore failed: ${restoreErr.message}` };
      }
    }
  }

  return supabase.from("orders").update(updates).eq("id", orderId);
}

/**
 * Customer-initiated return request. Customer picks WHICH items to return
 * (and how many of each). The refund amount is the sum of returned items'
 * (qty × unit price). Fires WhatsApp acknowledgement.
 */
export async function requestReturn(
  orderId: string,
  reason: string,
  items: ReturnItem[],
  notes?: string,
) {
  const refundAmount = items.reduce(
    (sum, it) => sum + it.quantity * it.unit_price,
    0,
  );

  if (isDemoMode()) {
    try {
      const { updateDemoOrder, getDemoOrder } = await import(
        "@/lib/store/demo-orders"
      );
      const before =
        getDemoOrder(orderId) ||
        demoOrders.find((o) => o.id === orderId) ||
        null;

      const returnInfo = {
        requested_at: new Date().toISOString(),
        reason,
        notes: notes || "",
        items,
        refund_amount: refundAmount,
        approved_at: null,
        rejected_at: null,
        refunded_at: null,
      };
      updateDemoOrder(orderId, {
        status: "return_requested",
        return_info: returnInfo,
      });

      if (before) {
        const phone =
          before.phone ||
          before.profile?.phone ||
          before.notes?.match(/Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)/)?.[1]?.trim() ||
          "";
        sendWhatsApp(phone, "return_requested", [
          orderId.slice(-8).toUpperCase(),
          `${reason} — ₹${refundAmount} refund pending`,
        ]);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        console.warn("[return-request] WhatsApp notify failed", err);
      }
    }
    return { error: null };
  }
  const supabase = createClient();
  return supabase
    .from("orders")
    .update({
      status: "return_requested",
      return_info: {
        requested_at: new Date().toISOString(),
        reason,
        notes,
        items,
        refund_amount: refundAmount,
      },
    })
    .eq("id", orderId);
}

/** Admin decision on a pending return: approve (issues refund) or reject. */
export async function resolveReturn(
  orderId: string,
  decision: "approve" | "reject",
  rejectionReason?: string,
) {
  if (isDemoMode()) {
    try {
      const { updateDemoOrder, getDemoOrder } = await import(
        "@/lib/store/demo-orders"
      );
      const before =
        getDemoOrder(orderId) ||
        demoOrders.find((o) => o.id === orderId) ||
        null;

      const now = new Date().toISOString();
      const existingInfo = before?.return_info || {
        requested_at: now,
        reason: "Unknown",
      };

      if (decision === "approve") {
        updateDemoOrder(orderId, {
          status: "return_approved",
          return_info: {
            ...existingInfo,
            approved_at: now,
            refunded_at: now, // demo: instant refund
          },
        });
        // Restore stock — only the items that were actually returned.
        // Falls back to all items for legacy returns without items[].
        const returnedItems =
          before?.return_info?.items && before.return_info.items.length > 0
            ? before.return_info.items.map((it) => ({
                product_id: it.product_id,
                quantity: it.quantity,
              }))
            : (before?.items || []).map((it) => ({
                product_id: it.product_id,
                quantity: it.quantity,
              }));
        if (returnedItems.length > 0) {
          adjustStockBulk(returnedItems, "restore");
        }
        // Credit refund to wallet (uses return_info.refund_amount if present)
        if (before) {
          creditRefundToWallet(before, "return");
        }
        if (before) {
          const phone =
            before.phone ||
            before.profile?.phone ||
            before.notes
              ?.match(/Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)/)?.[1]
              ?.trim() ||
            "";
          const refundAmount =
            before.return_info?.refund_amount || before.total;
          sendWhatsApp(phone, "return_approved", [
            orderId.slice(-8).toUpperCase(),
            String(refundAmount),
          ]);
        }
      } else {
        updateDemoOrder(orderId, {
          status: "return_rejected",
          return_info: {
            ...existingInfo,
            rejected_at: now,
            rejection_reason: rejectionReason || "Not specified",
          },
        });
        if (before) {
          const phone =
            before.phone ||
            before.profile?.phone ||
            before.notes
              ?.match(/Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)/)?.[1]
              ?.trim() ||
            "";
          sendWhatsApp(phone, "return_rejected", [
            orderId.slice(-8).toUpperCase(),
            rejectionReason || "Please contact support",
          ]);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        console.warn("[return-decide] post-decision side effects failed", err);
      }
    }
    return { error: null };
  }
  const supabase = createClient();
  const patch: Record<string, unknown> = {
    status: decision === "approve" ? "return_approved" : "return_rejected",
  };
  return supabase.from("orders").update(patch).eq("id", orderId);
}

export async function assignRider(orderId: string, riderId: string) {
  if (isDemoMode()) return { error: null };
  const supabase = createClient();
  await supabase.from("riders").update({ status: "busy" }).eq("id", riderId);
  return supabase.from("orders").update({ rider_id: riderId }).eq("id", orderId);
}

export function useAdminRiders() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRiders = useCallback(async () => {
    setLoading(true);

    if (isDemoMode()) {
      setRiders(demoRiders);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("riders")
      .select("*")
      .eq("active", true)
      .order("name");
    setRiders((data as Rider[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRiders();
  }, [fetchRiders]);

  useEffect(() => {
    if (isDemoMode()) return;
    const supabase = createClient();
    const channel = supabase
      .channel("admin-riders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "riders" },
        () => { fetchRiders(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRiders]);

  return { riders, loading, refetch: fetchRiders };
}

/** Random 6-digit rider login code. */
function generateAccessCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createRider(rider: Omit<Rider, "id">) {
  // Always give a new rider a login code so they can use the rider app.
  const withCode = {
    ...rider,
    access_code: rider.access_code || generateAccessCode(),
  };
  if (isDemoMode())
    return { data: { ...withCode, id: `demo-${Date.now()}` }, error: null };
  const supabase = createClient();
  return supabase.from("riders").insert(withCode).select().single();
}

export async function updateRider(id: string, updates: Partial<Rider>) {
  if (isDemoMode()) return { data: updates, error: null };
  const supabase = createClient();
  return supabase.from("riders").update(updates).eq("id", id).select().single();
}

export async function deleteRider(id: string) {
  if (isDemoMode()) return { error: null };
  const supabase = createClient();
  return supabase.from("riders").update({ active: false }).eq("id", id);
}

export function useAdminStats() {
  const [stats, setStats] = useState({
    ordersToday: 0,
    revenueToday: 0,
    activeRiders: 0,
    pendingOrders: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (isDemoMode()) {
        setStats({ ordersToday: 14, revenueToday: 4280, activeRiders: 3, pendingOrders: 5 });
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [ordersRes, ridersRes, pendingRes] = await Promise.all([
        supabase
          .from("orders")
          .select("total")
          .gte("placed_at", today.toISOString()),
        supabase
          .from("riders")
          .select("id")
          .eq("active", true)
          .in("status", ["available", "busy"]),
        supabase
          .from("orders")
          .select("id")
          .in("status", ["placed", "confirmed", "picking", "picked", "out_for_delivery"]),
      ]);

      const orders = ordersRes.data || [];
      setStats({
        ordersToday: orders.length,
        revenueToday: orders.reduce((sum, o) => sum + (o.total || 0), 0),
        activeRiders: ridersRes.data?.length || 0,
        pendingOrders: pendingRes.data?.length || 0,
      });
      setLoading(false);
    }
    fetch();
  }, []);

  return { stats, loading };
}
