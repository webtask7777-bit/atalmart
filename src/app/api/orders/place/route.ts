import { NextRequest, NextResponse } from "next/server";
import { priceOrder } from "@/lib/server/order-pricing";
import { buildSupabasePricingDeps } from "@/lib/server/pricing-deps";
import { resolveRazorpayCreds } from "@/lib/server/secrets";
import {
  verifyPaymentSignature,
  fetchRazorpayPayment,
} from "@/lib/server/razorpay";
import { rateLimitWithPrune, clientKey } from "@/lib/server/rate-limit";
import { isDemoMode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fixed Naya Raipur store coordinates — same constants the client previously
// hardcoded into the RPC call. Address geocoding is out of scope here.
const STORE_LAT = 21.161;
const STORE_LNG = 81.787;

interface PlaceBody {
  lines: { product_id: string; quantity: number; variant_id?: string | null }[];
  couponCode?: string;
  walletApplied?: number;
  pincode?: string;
  address_line: string;
  phone: string;
  payment_method: "cod" | "online";
  notes?: string | null;
  /** Required when payment_method === "online" and the amount owed is > 0. */
  payment?: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };
}

/**
 * THE single server-side order writer. Replaces the old client-side
 * `supabase.rpc("place_order_atomic", …)` call, which trusted client-supplied
 * totals/prices/user_id and could be invoked directly by any authenticated user
 * (buy-for-₹1 / place-as-someone-else / free orders).
 *
 * Here the server: authenticates the user, RE-PRICES the cart from canonical DB
 * data (ignoring any client totals), verifies the Razorpay payment was actually
 * captured for that exact amount, then writes the order with the service-role
 * client. Once `place_order_atomic` is locked to service_role (migration 012),
 * this is the ONLY path that can create an order.
 */
export async function POST(req: NextRequest) {
  // Demo mode never reaches the DB — orders live in the browser store there.
  if (isDemoMode()) {
    return NextResponse.json(
      { error: "Order placement is not available in demo mode" },
      { status: 400 },
    );
  }

  let body: PlaceBody;
  try {
    body = (await req.json()) as PlaceBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.lines?.length) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }
  if (!body.address_line || !body.phone) {
    return NextResponse.json(
      { error: "Address and phone are required" },
      { status: 400 },
    );
  }
  if (body.payment_method !== "cod" && body.payment_method !== "online") {
    return NextResponse.json(
      { error: "Invalid payment method" },
      { status: 400 },
    );
  }

  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // ── Rate limit: 20 placements / 10 min per user ──
  const limit = rateLimitWithPrune(
    clientKey(req, user.id, "order-place"),
    20,
    10 * 60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts — wait ${limit.retryAfterSec}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  // ── Authoritative re-price (ignores any client totals) ──
  let pricing;
  try {
    pricing = await priceOrder(
      {
        lines: body.lines,
        couponCode: body.couponCode,
        walletApplied: body.walletApplied,
        pincode: body.pincode,
      },
      user.id,
      buildSupabasePricingDeps(supabase),
    );
  } catch {
    return NextResponse.json(
      { error: "Pricing failed — please refresh and try again" },
      { status: 500 },
    );
  }
  if (!pricing.ok) {
    return NextResponse.json({ error: pricing.error }, { status: pricing.status });
  }

  // ── Online payment: prove a CAPTURED payment for the exact amount owed ──
  if (body.payment_method === "online" && pricing.total > 0) {
    const p = body.payment;
    if (!p?.razorpay_order_id || !p.razorpay_payment_id || !p.razorpay_signature) {
      return NextResponse.json(
        { error: "Payment proof required for online orders" },
        { status: 400 },
      );
    }
    const creds = resolveRazorpayCreds();
    if (!creds.keyId.value || !creds.keySecret.value) {
      return NextResponse.json(
        { error: "Online payment is not configured" },
        { status: 503 },
      );
    }
    const sigOk = verifyPaymentSignature({
      orderId: p.razorpay_order_id,
      paymentId: p.razorpay_payment_id,
      signature: p.razorpay_signature,
      keySecret: creds.keySecret.value,
    });
    if (!sigOk) {
      return NextResponse.json(
        { error: "Payment signature verification failed" },
        { status: 400 },
      );
    }
    let payment;
    try {
      payment = await fetchRazorpayPayment({
        paymentId: p.razorpay_payment_id,
        keyId: creds.keyId.value,
        keySecret: creds.keySecret.value,
      });
    } catch {
      return NextResponse.json(
        { error: "Could not verify payment with gateway" },
        { status: 502 },
      );
    }
    const expectedPaise = Math.round(pricing.total * 100);
    if (
      payment.status !== "captured" ||
      payment.order_id !== p.razorpay_order_id ||
      payment.amount !== expectedPaise
    ) {
      return NextResponse.json(
        { error: "Payment does not match the amount owed" },
        { status: 400 },
      );
    }
  }

  const admin = createAdminClient();

  // ── Idempotency: never write two orders for one captured payment ──
  if (body.payment_method === "online" && body.payment?.razorpay_payment_id) {
    const { data: existing } = await admin
      .from("orders")
      .select("id")
      .eq("razorpay_payment_id", body.payment.razorpay_payment_id)
      .maybeSingle();
    if (existing) {
      const { data: order } = await admin
        .from("orders")
        .select("*, items:order_items(*), profile:profiles(*)")
        .eq("id", (existing as { id: string }).id)
        .single();
      return NextResponse.json({ order });
    }
  }

  // ── Write the order with SERVER values via service role ──
  const { data: rpcRows, error: rpcErr } = await admin.rpc(
    "place_order_atomic",
    {
      p_user_id: user.id,
      p_items: pricing.lines.map((l) => ({
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        price: l.unit_price,
        variant_id: l.variant_id ?? null,
        variant_unit: l.variant_unit ?? null,
      })),
      p_total: pricing.total,
      p_delivery_fee: pricing.deliveryFee,
      p_discount: pricing.couponDiscount,
      p_address_line: body.address_line,
      p_lat: STORE_LAT,
      p_lng: STORE_LNG,
      p_phone: body.phone,
      p_payment_method: body.payment_method,
      p_coupon_code: pricing.couponCode,
      p_notes: body.notes ?? null,
    },
  );

  if (rpcErr) {
    const msg = rpcErr.message || "";
    if (msg.includes("INSUFFICIENT_STOCK")) {
      const productId = msg.split("INSUFFICIENT_STOCK:")[1]?.trim() || "an item";
      return NextResponse.json(
        { error: `Sorry — ${productId} just sold out. Please refresh your cart.` },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: msg || "Failed to place order" },
      { status: 500 },
    );
  }

  const orderId = (rpcRows as { order_id: string }[] | null)?.[0]?.order_id;
  if (!orderId) {
    return NextResponse.json(
      { error: "Order placement returned no ID" },
      { status: 500 },
    );
  }

  // Bind the payment id (unique column → blocks reuse / double-spend).
  if (body.payment_method === "online" && body.payment?.razorpay_payment_id) {
    await admin
      .from("orders")
      .update({ razorpay_payment_id: body.payment.razorpay_payment_id })
      .eq("id", orderId);
  }

  const { data: order, error: fetchErr } = await admin
    .from("orders")
    .select("*, items:order_items(*), profile:profiles(*)")
    .eq("id", orderId)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json(
      { error: fetchErr?.message || "Order created but not retrievable" },
      { status: 500 },
    );
  }

  return NextResponse.json({ order });
}
