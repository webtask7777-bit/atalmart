/**
 * Server-only Razorpay helpers. NEVER import from client code — this module
 * uses the key SECRET and webhook SECRET, which must never reach a browser.
 *
 * We talk to Razorpay over plain `fetch` + Node `crypto` instead of pulling in
 * the `razorpay` npm SDK: order creation is a single authenticated POST and
 * signature verification is one HMAC, so a dependency would add weight without
 * benefit and keeps cold-starts lean on serverless.
 *
 * Reference: https://razorpay.com/docs/payments/server-integration/nodejs/
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";

export interface RazorpayOrder {
  id: string; // order_xxx — passed to Checkout.js on the client
  amount: number; // in paise
  currency: string;
  receipt: string | null;
  status: string;
}

/**
 * Create a Razorpay Order. `amountPaise` MUST be an integer number of paise
 * (₹199.00 → 19900). Throws on any non-2xx so the route can map it to a 502.
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  keyId: string;
  keySecret: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const { amountPaise, receipt, keyId, keySecret, notes } = params;

  if (!Number.isInteger(amountPaise) || amountPaise < 100) {
    // Razorpay minimum is ₹1.00 = 100 paise.
    throw new Error("amountPaise must be an integer of at least 100 (₹1)");
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: notes ?? {},
      // Auto-capture so we don't have to issue a separate capture call.
      payment_capture: 1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Razorpay order create failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  return (await res.json()) as RazorpayOrder;
}

/** Constant-time string compare that won't throw on length mismatch. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify the signature returned by Checkout.js after a successful payment.
 * The expected signature is HMAC-SHA256(`${order_id}|${payment_id}`, keySecret).
 * Returns true only on an exact, constant-time match.
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const { orderId, paymentId, signature, keySecret } = params;
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqualHex(expected, signature);
}

/**
 * Verify a Razorpay webhook. The signature lives in the `x-razorpay-signature`
 * header and is HMAC-SHA256 of the RAW request body using the webhook secret.
 * You MUST pass the raw, unparsed body string — re-serialized JSON will not
 * match.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  const { rawBody, signature, webhookSecret } = params;
  if (!rawBody || !signature || !webhookSecret) return false;
  const expected = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  return safeEqualHex(expected, signature);
}
