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
import { UPI_UTR_RE, normalizeUtr } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import {
  checkStoreOpen,
  resolveDeliveryZone,
  isMissingSchema,
  logSchemaSkip,
  type ResolvedZone,
} from "@/lib/server/launch-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Naya Raipur store coordinates. Used ONLY as a last-resort fallback when the
// customer's delivery point cannot be resolved at all — every order used to be
// stamped with these, which made orders.lat/lng useless for routing.
const STORE_LAT = 21.161;
const STORE_LNG = 81.787;

interface PlaceBody {
  lines: { product_id: string; quantity: number; variant_id?: string | null }[];
  couponCode?: string;
  walletApplied?: number;
  pincode?: string;
  /** Delivery pin when the customer dropped one. Authoritative over pincode. */
  lat?: number | null;
  lng?: number | null;
  address_line: string;
  phone: string;
  payment_method: "cod" | "online" | "upi";
  notes?: string | null;
  /** Required when payment_method === "online" and the amount owed is > 0. */
  payment?: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };
  /** Required when payment_method === "upi" and the amount owed is > 0. The
   *  customer pays the store VPA directly and submits the bank UTR; admin
   *  verifies it manually before dispatch (no gateway involved). */
  upi_utr?: string;
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
  if (
    body.payment_method !== "cod" &&
    body.payment_method !== "online" &&
    body.payment_method !== "upi"
  ) {
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

  // ── Launch gate ──
  // The store-status board and the disabled checkout button are presentation.
  // This is the rule: a paused or pre-launch store accepts no orders, however
  // the request arrives.
  const closed = await checkStoreOpen(supabase);
  if (closed) {
    return NextResponse.json(
      { error: closed.error, code: closed.code, store_status: closed.storeStatus },
      { status: closed.status },
    );
  }

  // ── Service-area gate ──
  // Until now the customer pincode was carried into pricing but never checked,
  // and the order was stamped with the store's own coordinates. Resolve the
  // real zone here and refuse anything outside it.
  const zoneResult = await resolveDeliveryZone(supabase, {
    pincode: body.pincode,
    lat: body.lat,
    lng: body.lng,
  });
  if (!zoneResult.ok) {
    return NextResponse.json(
      { error: zoneResult.block.error, code: zoneResult.block.code },
      { status: zoneResult.block.status },
    );
  }
  const zone: ResolvedZone = zoneResult.zone;

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

  // ── Direct-UPI: require a plausible UTR (verified manually by admin) ──
  let upiUtr: string | null = null;
  if (body.payment_method === "upi" && pricing.total > 0) {
    const raw = normalizeUtr(body.upi_utr ?? "");
    // Bank UTRs are typically 12 digits (IMPS/UPI); some banks issue
    // 10–22 char alphanumeric refs. Loose shape check only — real
    // verification happens against the bank statement.
    if (!UPI_UTR_RE.test(raw)) {
      return NextResponse.json(
        { error: "Valid UPI UTR / transaction reference required (10–22 characters)" },
        { status: 400 },
      );
    }
    upiUtr = raw;
  }

  const admin = createAdminClient();

  // ── Admin payment switches (Site Settings) are enforced here, not just in
  //    the checkout UI. Direct-UPI is allowed only while at least one method
  //    is on — turning everything off means "no orders right now".
  {
    const { data: flags } = await admin
      .from("settings")
      .select("cod_enabled, online_payment_enabled")
      .eq("id", 1)
      .maybeSingle();
    const codOn = flags?.cod_enabled !== false;
    const onlineOn = flags?.online_payment_enabled !== false;
    const blocked =
      (body.payment_method === "cod" && !codOn) ||
      (body.payment_method === "online" && !onlineOn) ||
      (body.payment_method === "upi" && !codOn && !onlineOn);
    if (blocked) {
      return NextResponse.json(
        { error: "Ye payment method abhi available nahi hai — thodi der baad try karein" },
        { status: 403 },
      );
    }
  }

  // ── A manual UPI reference may be used exactly once ──
  // The UTR is the only evidence a direct-UPI order was paid. Without this
  // check the same screenshot pays for an unlimited number of orders, and the
  // admin only finds out when reconciling the bank statement.
  if (upiUtr) {
    try {
      const { data: usedUtr, error: utrErr } = await admin
        .from("payments")
        .select("order_id")
        .eq("provider", "upi_manual")
        .eq("provider_payment_id", upiUtr)
        .maybeSingle();
      if (utrErr && !isMissingSchema(utrErr)) throw utrErr;
      if (usedUtr) {
        return NextResponse.json(
          { error: "Ye UPI reference pehle se use ho chuka hai. Sahi UTR daalein." },
          { status: 409 },
        );
      }
    } catch (err) {
      if (isMissingSchema(err)) logSchemaSkip("place/utr-check", err);
      else throw err;
    }
  }

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
      // The delivery point, not the store. Falls back to the store only when
      // neither a pin nor a mapped sector centroid is available.
      p_lat: zone.lat ?? STORE_LAT,
      p_lng: zone.lng ?? STORE_LNG,
      p_phone: body.phone,
      p_payment_method: body.payment_method,
      p_coupon_code: pricing.couponCode,
      p_notes: upiUtr
        ? `UPI UTR: ${upiUtr} (pending verification)${body.notes ? ` | ${body.notes}` : ""}`
        : body.notes ?? null,
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

  // ── Post-write bookkeeping ──
  // None of this may throw: the order exists and the customer has already been
  // charged. A missing migration degrades to a logged skip, never a 500.
  const totalPaise = Math.round(pricing.total * 100);
  const paidNow = pricing.total <= 0 || body.payment_method === "online";

  // Bind the payment id (unique column → blocks reuse / double-spend) and
  // record the payment state, which until now was inferred from the payment
  // method and therefore could not distinguish paid from merely placed.
  {
    const patch: Record<string, unknown> = {};
    if (body.payment_method === "online" && body.payment?.razorpay_payment_id) {
      patch.razorpay_payment_id = body.payment.razorpay_payment_id;
    }
    try {
      const { error } = await admin.from("orders").update(patch).eq("id", orderId);
      if (error) throw error;
    } catch (err) {
      logSchemaSkip("place/bind-payment", err);
    }

    // payment_status lives behind migration 023; try it separately so a
    // pre-migration deploy still binds the payment id above.
    try {
      const statePatch: Record<string, unknown> = {
        payment_status: paidNow ? "paid" : body.payment_method === "upi" ? "pending" : "unpaid",
      };
      if (paidNow) statePatch.paid_at = new Date().toISOString();
      if (body.payment?.razorpay_order_id) {
        statePatch.razorpay_order_id = body.payment.razorpay_order_id;
      }
      const { error } = await admin.from("orders").update(statePatch).eq("id", orderId);
      if (error) throw error;
    } catch (err) {
      if (isMissingSchema(err)) logSchemaSkip("place/payment-status", err);
      else console.error("[place] payment_status update failed", err);
    }
  }

  // Zone columns (migration 022). Recorded even when unresolved, so the
  // operator can see which orders were accepted without a mapped sector.
  try {
    const { error } = await admin
      .from("orders")
      .update({
        zone_id: zone.zoneId,
        zone_name: zone.zoneName,
        delivery_pincode: zone.pincode,
        zone_source: zone.source,
      })
      .eq("id", orderId);
    if (error) throw error;
  } catch (err) {
    if (isMissingSchema(err)) logSchemaSkip("place/zone", err);
    else console.error("[place] zone update failed", err);
  }

  // A payment row per gateway payment. order_id is set here; the webhook may
  // have already written this row from the other direction, so upsert.
  if (body.payment_method === "online" && body.payment?.razorpay_payment_id) {
    try {
      const { error } = await admin.from("payments").upsert(
        {
          order_id: orderId,
          provider: "razorpay",
          provider_payment_id: body.payment.razorpay_payment_id,
          provider_order_id: body.payment.razorpay_order_id ?? null,
          amount_paise: totalPaise,
          status: "captured",
          captured_at: new Date().toISOString(),
        },
        { onConflict: "provider,provider_payment_id" },
      );
      if (error) throw error;
    } catch (err) {
      if (isMissingSchema(err)) logSchemaSkip("place/payment-row", err);
      else console.error("[place] payment row failed", err);
    }
  }

  // Manual UPI: the UTR is the payment record, pending admin verification.
  if (upiUtr) {
    try {
      const { error } = await admin.from("payments").insert({
        order_id: orderId,
        provider: "upi_manual",
        provider_payment_id: upiUtr,
        amount_paise: totalPaise,
        status: "created",
        method: "upi",
      });
      if (error) throw error;
    } catch (err) {
      if (isMissingSchema(err)) logSchemaSkip("place/upi-row", err);
      else console.error("[place] upi payment row failed", err);
    }
  }

  // Cash: what the rider is expected to collect. Collection and remittance are
  // filled in later — delivered no longer implies the money came back.
  if (body.payment_method === "cod" && pricing.total > 0) {
    try {
      const { error } = await admin
        .from("cod_collections")
        .upsert({ order_id: orderId, expected_paise: totalPaise }, { onConflict: "order_id" });
      if (error) throw error;
    } catch (err) {
      if (isMissingSchema(err)) logSchemaSkip("place/cod-row", err);
      else console.error("[place] cod row failed", err);
    }
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
