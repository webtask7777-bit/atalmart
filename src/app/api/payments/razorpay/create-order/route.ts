import { NextRequest, NextResponse } from "next/server";
import { resolveRazorpayCreds } from "@/lib/server/secrets";
import { createRazorpayOrder } from "@/lib/server/razorpay";
import { rateLimitWithPrune, clientKey } from "@/lib/server/rate-limit";
import { isDemoMode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface CreateOrderBody {
  /** Order amount in RUPEES (integer or 2-dp). Converted to paise server-side. */
  amount: number;
  /** Opaque client reference for reconciliation (e.g. a cart hash). */
  receipt?: string;
  /** Optional customer phone — stored in Razorpay notes for reconciliation. */
  phone?: string;
}

/**
 * Creates a Razorpay Order so the browser can open Checkout.js. The amount is
 * NOT trusted from the client for anything billing-critical here — it only
 * sizes the Razorpay order; the canonical price is recomputed in
 * /api/orders/price and re-checked again before the order row is written.
 *
 * Returns 503 (not 500) when keys are missing so the client can cleanly fall
 * back to COD instead of treating it as a server fault.
 */
export async function POST(req: NextRequest) {
  let body: CreateOrderBody;
  try {
    body = (await req.json()) as CreateOrderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number (rupees)" },
      { status: 400 },
    );
  }

  // Auth: outside demo mode, require a logged-in session — same posture as the
  // WhatsApp route. Online payments are only initiated by real customers.
  let sessionUserId: string | null = null;
  if (!isDemoMode()) {
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
    sessionUserId = user.id;
  }

  // Rate-limit: 30 order-creates / 10 min per user (or IP in demo). A normal
  // checkout retries a handful of times; this blocks scripted abuse.
  const limit = rateLimitWithPrune(
    clientKey(req, sessionUserId, "rzp-create"),
    30,
    10 * 60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts — wait ${limit.retryAfterSec}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const creds = resolveRazorpayCreds();
  if (!creds.keyId.value || !creds.keySecret.value) {
    return NextResponse.json(
      {
        error: "Online payment is not configured. Please use Cash on Delivery.",
        configured: false,
      },
      { status: 503 },
    );
  }

  // Round to whole paise — float rupees (e.g. 199.1) must not leak fractional
  // paise into Razorpay.
  const amountPaise = Math.round(amount * 100);

  try {
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: (body.receipt || `atal_${Date.now()}`).slice(0, 40),
      keyId: creds.keyId.value,
      keySecret: creds.keySecret.value,
      notes: body.phone ? { phone: body.phone } : undefined,
    });

    // keyId is public and required by Checkout.js — safe to return.
    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: creds.keyId.value,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Could not create payment order", detail: message },
      { status: 502 },
    );
  }
}
