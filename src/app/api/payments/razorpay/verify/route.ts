import { NextRequest, NextResponse } from "next/server";
import { resolveRazorpayCreds } from "@/lib/server/secrets";
import { verifyPaymentSignature } from "@/lib/server/razorpay";
import { rateLimitWithPrune, clientKey } from "@/lib/server/rate-limit";
import { isDemoMode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface VerifyBody {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Verifies the signature handed back by Razorpay Checkout.js after a payment.
 * This is the gate the client MUST pass before we write the order row: a valid
 * signature proves the payment_id genuinely belongs to our order_id and was
 * signed with our key secret (which never left the server).
 *
 * Returns { verified: true } only on a constant-time exact match.
 */
export async function POST(req: NextRequest) {
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json(
      {
        error:
          "razorpay_order_id, razorpay_payment_id and razorpay_signature are required",
      },
      { status: 400 },
    );
  }

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

  const limit = rateLimitWithPrune(
    clientKey(req, sessionUserId, "rzp-verify"),
    60,
    10 * 60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts — wait ${limit.retryAfterSec}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const creds = resolveRazorpayCreds();
  if (!creds.keySecret.value) {
    return NextResponse.json(
      { error: "Online payment is not configured", verified: false },
      { status: 503 },
    );
  }

  const verified = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    keySecret: creds.keySecret.value,
  });

  if (!verified) {
    return NextResponse.json(
      { error: "Payment signature verification failed", verified: false },
      { status: 400 },
    );
  }

  return NextResponse.json({ verified: true, paymentId: razorpay_payment_id });
}
