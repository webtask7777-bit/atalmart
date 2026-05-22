import type { Order } from "@/types";

export type CustomerInsight = {
  user_id: string;
  name: string;
  phone: string;
  email: string;
  // Counts
  orderCount: number;
  cancelledCount: number;
  deliveredCount: number;
  inFlightCount: number;
  // Money
  lifetimeValue: number;
  totalSaved: number;
  avgOrderValue: number;
  // Time
  firstOrderAt: string;
  lastOrderAt: string;
  daysSinceLastOrder: number;
  customerSinceDays: number;
  // Preferences
  favProductName: string | null;
  favProductQty: number;
  preferredPayment: "cod" | "online" | "unknown";
  couponsUsed: string[];
  // Geo
  lastAddress: string;
  lastLat: number | null;
  lastLng: number | null;
  // Segment derived
  segment: "new" | "regular" | "loyal" | "vip" | "lapsed";
  // Orders bundled (sorted newest first) for detail view
  orders: Order[];
};

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve order metadata. Prefers first-class columns; falls back to regex on
 * `notes` for legacy orders placed before migration 003.
 */
const readMeta = (order: Order) => {
  const notes = order.notes || "";
  const phone =
    order.phone ||
    notes.match(/Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)/)?.[1]?.trim() ||
    "";
  const paymentMatch = (
    order.payment_method ||
    notes.match(/Payment:\s*(\w+)/)?.[1] ||
    ""
  ).toLowerCase();
  const payment: "cod" | "online" | "unknown" =
    paymentMatch === "cod" || paymentMatch === "online" ? paymentMatch : "unknown";
  const coupon =
    order.coupon_code ||
    notes.match(/Coupon:\s*([A-Z0-9]+)/)?.[1] ||
    null;
  return { phone, payment, coupon };
};

export function buildCustomerInsights(orders: Order[]): CustomerInsight[] {
  // Group orders by user_id
  const grouped = new Map<string, Order[]>();
  for (const o of orders) {
    const key = o.user_id || "anon";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(o);
  }

  const out: CustomerInsight[] = [];

  for (const [userId, userOrders] of grouped) {
    const sorted = [...userOrders].sort(
      (a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime(),
    );
    const oldest = sorted[sorted.length - 1];
    const latest = sorted[0];

    let phone = "";
    let email = "";
    const paymentCounts: Record<string, number> = {};
    const couponSet = new Set<string>();
    let lifetimeValue = 0;
    let totalSaved = 0;
    let cancelledCount = 0;
    let deliveredCount = 0;
    const productCounts = new Map<string, { name: string; qty: number }>();

    for (const o of sorted) {
      lifetimeValue += o.total;
      totalSaved += o.discount || 0;
      if (o.status === "cancelled") cancelledCount++;
      else if (o.status === "delivered") deliveredCount++;

      const meta = readMeta(o);
      if (meta.phone && !phone) phone = meta.phone;
      if (meta.payment !== "unknown") {
        paymentCounts[meta.payment] = (paymentCounts[meta.payment] || 0) + 1;
      }
      if (meta.coupon) couponSet.add(meta.coupon);

      // MRP savings — order line items if available
      for (const it of o.items || []) {
        const cur = productCounts.get(it.product_id) || { name: it.product_name, qty: 0 };
        cur.qty += it.quantity;
        productCounts.set(it.product_id, cur);
      }
    }

    const preferredPayment: CustomerInsight["preferredPayment"] =
      (Object.entries(paymentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as
        | "cod"
        | "online"
        | undefined) || "unknown";

    const inFlightCount = userOrders.length - cancelledCount - deliveredCount;

    let favName: string | null = null;
    let favQty = 0;
    for (const p of productCounts.values()) {
      if (p.qty > favQty) {
        favName = p.name;
        favQty = p.qty;
      }
    }

    const daysSinceLastOrder = Math.floor(
      (Date.now() - new Date(latest.placed_at).getTime()) / ONE_DAY,
    );
    const customerSinceDays = Math.floor(
      (Date.now() - new Date(oldest.placed_at).getTime()) / ONE_DAY,
    );

    let segment: CustomerInsight["segment"];
    if (daysSinceLastOrder >= 45) segment = "lapsed";
    else if (lifetimeValue >= 1000) segment = "vip";
    else if (userOrders.length >= 3) segment = "loyal";
    else if (userOrders.length >= 2) segment = "regular";
    else segment = "new";

    // Prefer profile.name (real customer record) → recipient parsed from address
    // line (e.g. "Ravi Sharma, A-204…") → graceful fallback
    const addrParts = (latest.address_line || "").split(",").map((s) => s.trim());
    const recipientFromAddress =
      addrParts[0] && /^[A-Za-z][A-Za-z .'-]+$/.test(addrParts[0]) ? addrParts[0] : "";

    out.push({
      user_id: userId,
      name:
        latest.profile?.name ||
        recipientFromAddress ||
        `Customer #${userId.slice(0, 6)}`,
      phone,
      email: latest.profile?.phone ? `${latest.profile.phone}@atalmart.demo` : "",
      orderCount: userOrders.length,
      cancelledCount,
      deliveredCount,
      inFlightCount,
      lifetimeValue,
      totalSaved,
      avgOrderValue: Math.round(lifetimeValue / userOrders.length),
      firstOrderAt: oldest.placed_at,
      lastOrderAt: latest.placed_at,
      daysSinceLastOrder,
      customerSinceDays,
      favProductName: favName,
      favProductQty: favQty,
      preferredPayment,
      couponsUsed: Array.from(couponSet),
      lastAddress: latest.address_line || "",
      lastLat: latest.lat ?? null,
      lastLng: latest.lng ?? null,
      segment,
      orders: sorted,
    });
  }

  return out.sort((a, b) => b.lifetimeValue - a.lifetimeValue);
}

export const SEGMENT_LABELS: Record<CustomerInsight["segment"], string> = {
  new: "New",
  regular: "Regular",
  loyal: "Loyal",
  vip: "VIP",
  lapsed: "Lapsed",
};

export const SEGMENT_STYLES: Record<CustomerInsight["segment"], string> = {
  new: "bg-gray-100 text-gray-600",
  regular: "bg-blue-50 text-blue-600",
  loyal: "bg-green-light text-indian-green",
  vip: "bg-saffron-light text-saffron",
  lapsed: "bg-red-50 text-red-500",
};
