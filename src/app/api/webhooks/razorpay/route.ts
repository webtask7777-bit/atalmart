import { NextRequest, NextResponse } from "next/server";
import { resolveRazorpayCreds } from "@/lib/server/secrets";
import { verifyWebhookSignature } from "@/lib/server/razorpay";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { isMissingSchema, logSchemaSkip } from "@/lib/server/launch-gate";

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
 * This receiver used to verify the signature and then only console.log the
 * event. Nothing was stored, so a replayed delivery was indistinguishable from
 * a first one, and a payment captured after the customer's browser closed was
 * never reconciled against an order. Now every verified event is persisted by
 * its provider event id — the unique constraint IS the deduplication — and the
 * payment state on the order is transitioned from the stored event.
 *
 * Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL:    https://<your-domain>/api/webhooks/razorpay
 *   Events: payment.captured, payment.failed, refund.processed, refund.failed
 *   Secret: same value as RAZORPAY_WEBHOOK_SECRET
 */

interface PaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  status?: string;
  method?: string;
  error_description?: string;
}

interface RefundEntity {
  id?: string;
  payment_id?: string;
  amount?: number;
  status?: string;
}

interface RazorpayEvent {
  event?: string;
  payload?: {
    payment?: { entity?: PaymentEntity };
    refund?: { entity?: RefundEntity };
  };
}

/** Ack shape. Always 200 on a verified event so Razorpay stops retrying. */
const ack = (extra: Record<string, unknown> = {}) =>
  NextResponse.json({ received: true, ...extra });

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

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  const eventType = event.event ?? "unknown";

  // Razorpay sends a stable per-event id in this header. Fall back to a
  // composite key so an older account without the header still dedupes on
  // something meaningful rather than on nothing.
  const eventId =
    req.headers.get("x-razorpay-event-id") ||
    [eventType, refund?.id, payment?.id].filter(Boolean).join(":");

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // Service role not configured — acknowledge so Razorpay stops retrying,
    // but say loudly that this event was not recorded.
    console.error("[razorpay] service role missing; event NOT recorded", eventId);
    return ack({ recorded: false });
  }

  // ── Deduplicate: the unique constraint decides, not a read-then-write ──
  try {
    const { error } = await admin.from("payment_events").insert({
      provider: "razorpay",
      provider_event_id: eventId,
      event_type: eventType,
      payload: event as unknown as Record<string, unknown>,
    });
    if (error) {
      // 23505 = unique violation → we have already handled this delivery.
      if ((error as { code?: string }).code === "23505") {
        return ack({ duplicate: true });
      }
      if (isMissingSchema(error)) {
        logSchemaSkip("razorpay-webhook/event-log", error);
      } else {
        throw error;
      }
    }
  } catch (err) {
    console.error("[razorpay] could not record event", eventId, err);
    // Fall through: recording the money movement matters more than the log.
  }

  let handled = false;
  let note: string | null = null;

  try {
    switch (eventType) {
      case "payment.captured": {
        if (!payment?.id) break;
        // Upsert the payment. order_id stays null when /api/orders/place never
        // ran — that orphan row is exactly the "customer paid, no order" case
        // the operator has to refund, and it was previously invisible.
        const { data: existing } = await admin
          .from("payments")
          .select("id, order_id")
          .eq("provider", "razorpay")
          .eq("provider_payment_id", payment.id)
          .maybeSingle();

        const row = {
          provider: "razorpay",
          provider_payment_id: payment.id,
          provider_order_id: payment.order_id ?? null,
          amount_paise: Number(payment.amount ?? 0),
          status: "captured",
          method: payment.method ?? null,
          captured_at: new Date().toISOString(),
          order_id: (existing as { order_id?: string } | null)?.order_id ?? null,
        };
        const { error: upErr } = await admin
          .from("payments")
          .upsert(row, { onConflict: "provider,provider_payment_id" });
        if (upErr) throw upErr;

        // Transition the order if one is already bound to this payment.
        const { data: order } = await admin
          .from("orders")
          .select("id, payment_status")
          .eq("razorpay_payment_id", payment.id)
          .maybeSingle();
        const o = order as { id: string; payment_status?: string } | null;
        if (o) {
          if (o.payment_status !== "paid") {
            const { error: ordErr } = await admin
              .from("orders")
              .update({ payment_status: "paid", paid_at: new Date().toISOString() })
              .eq("id", o.id);
            if (ordErr) throw ordErr;
          }
          // Backfill the link on the payment row.
          await admin
            .from("payments")
            .update({ order_id: o.id })
            .eq("provider", "razorpay")
            .eq("provider_payment_id", payment.id);
        } else {
          note = "captured payment with no order bound yet";
        }
        handled = true;
        break;
      }

      case "payment.failed": {
        if (!payment?.id) break;
        const { error: upErr } = await admin.from("payments").upsert(
          {
            provider: "razorpay",
            provider_payment_id: payment.id,
            provider_order_id: payment.order_id ?? null,
            amount_paise: Number(payment.amount ?? 0),
            status: "failed",
            method: payment.method ?? null,
          },
          { onConflict: "provider,provider_payment_id" },
        );
        if (upErr) throw upErr;

        // Only mark the order failed if it is not already paid — a later
        // retry on the same order must not be overwritten by an earlier
        // failure arriving out of order.
        const { data: order } = await admin
          .from("orders")
          .select("id, payment_status")
          .eq("razorpay_payment_id", payment.id)
          .maybeSingle();
        const o = order as { id: string; payment_status?: string } | null;
        if (o && o.payment_status !== "paid") {
          await admin
            .from("orders")
            .update({ payment_status: "failed" })
            .eq("id", o.id);
        }
        handled = true;
        break;
      }

      case "refund.processed":
      case "refund.created":
      case "refund.failed": {
        if (!refund?.id) break;
        const succeeded = eventType === "refund.processed";
        const { data: pay } = await admin
          .from("payments")
          .select("id, order_id, amount_paise")
          .eq("provider", "razorpay")
          .eq("provider_payment_id", refund.payment_id ?? "")
          .maybeSingle();
        const pr = pay as
          | { id: string; order_id: string | null; amount_paise: number }
          | null;

        const { error: refErr } = await admin.from("refunds").upsert(
          {
            provider: "razorpay",
            provider_refund_id: refund.id,
            payment_id: pr?.id ?? null,
            order_id: pr?.order_id ?? null,
            amount_paise: Number(refund.amount ?? 0),
            status: succeeded ? "succeeded" : eventType === "refund.failed" ? "failed" : "pending",
            settled_at: succeeded ? new Date().toISOString() : null,
          },
          { onConflict: "provider,provider_refund_id" },
        );
        if (refErr) throw refErr;

        if (succeeded && pr?.order_id) {
          const full = Number(refund.amount ?? 0) >= Number(pr.amount_paise ?? 0);
          await admin
            .from("orders")
            .update({ payment_status: full ? "refunded" : "partially_refunded" })
            .eq("id", pr.order_id);
        }
        handled = true;
        break;
      }

      default:
        // Acknowledge unrecognized events so Razorpay stops retrying them.
        note = "unhandled event type";
        break;
    }

    await admin
      .from("payment_events")
      .update({ processed_at: new Date().toISOString(), processing_error: note })
      .eq("provider", "razorpay")
      .eq("provider_event_id", eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingSchema(err)) {
      logSchemaSkip("razorpay-webhook/handle", err);
    } else {
      console.error("[razorpay] handling failed", eventType, message);
      await admin
        .from("payment_events")
        .update({ processing_error: message.slice(0, 500) })
        .eq("provider", "razorpay")
        .eq("provider_event_id", eventId)
        .then(() => undefined, () => undefined);
    }
  }

  return ack({ handled });
}
