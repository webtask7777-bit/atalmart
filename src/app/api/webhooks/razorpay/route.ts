import { NextRequest, NextResponse } from "next/server";
import { resolveRazorpayCreds } from "@/lib/server/secrets";
import { verifyWebhookSignature } from "@/lib/server/razorpay";

export const runtime = "nodejs";
// Webhooks are inherently dynamic and must never be cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook receiver. Razorpay POSTs payment lifecycle events here and
 * signs the RAW body with the webhook secret (set in the Razorpay dashboard).
 *
 * Critical: we must read `req.text()` and verify the signature against THAT
 * exact string. Parsing to JSON first and re-stringifying would change byte
 * order/whitespace and break the HMAC.
 *
 * Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL:    https://<your-domain>/api/webhooks/razorpay
 *   Events: payment.captured, payment.failed
 *   Secret: same value as RAZORPAY_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  const creds = resolveRazorpayCreds();
  if (!creds.webhookSecret.value) {
    // Misconfigured — refuse rather than silently accept unsigned events.
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("x-razorpay-signature") || "";
  const rawBody = await req.text();

  const valid = verifyWebhookSignature({
    rawBody,
    signature,
    webhookSecret: creds.webhookSecret.value,
  });

  if (!valid) {
    // 400, not 401 — Razorpay treats non-2xx as a delivery failure and retries.
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          amount?: number;
          status?: string;
          error_description?: string;
        };
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payment = event.payload?.payment?.entity;

  switch (event.event) {
    case "payment.captured": {
      // Source of truth that money actually moved. Reconcile against the order
      // referenced by payment.order_id. (Persisting to Supabase requires a
      // payment_id column / payments table — see migration note in the PR.)
      console.log(
        "[razorpay] payment.captured",
        JSON.stringify({
          order_id: payment?.order_id,
          payment_id: payment?.id,
          amount_paise: payment?.amount,
        }),
      );
      break;
    }
    case "payment.failed": {
      console.warn(
        "[razorpay] payment.failed",
        JSON.stringify({
          order_id: payment?.order_id,
          payment_id: payment?.id,
          reason: payment?.error_description,
        }),
      );
      break;
    }
    default:
      // Acknowledge unrecognized events so Razorpay stops retrying them.
      break;
  }

  // Always 200 on a verified event so Razorpay marks delivery successful.
  return NextResponse.json({ received: true });
}
