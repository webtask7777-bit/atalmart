"use client";

/**
 * Client-side Razorpay Checkout helper.
 *
 * Orchestrates the browser half of the payment flow:
 *   1. ask our server to create a Razorpay order  (POST /create-order)
 *   2. load Checkout.js and open the payment modal
 *   3. on success, send the signed handshake back for server verification
 *      (POST /verify) — only a verified payment resolves the promise.
 *
 * The promise:
 *   • resolves with { paymentId } once the payment is captured AND verified
 *   • rejects with a RazorpayError whose `reason` is one of:
 *       "not_configured" | "cancelled" | "verify_failed" | "error"
 * so the caller can branch (e.g. offer COD when not configured).
 */

interface RazorpayHandlerResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; contact?: string; email?: string };
  theme?: { color?: string };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (resp: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export type RazorpayFailureReason =
  | "not_configured"
  | "cancelled"
  | "verify_failed"
  | "error";

export class RazorpayError extends Error {
  reason: RazorpayFailureReason;
  constructor(reason: RazorpayFailureReason, message: string) {
    super(message);
    this.name = "RazorpayError";
    this.reason = reason;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Inject Checkout.js once; resolves when window.Razorpay is available. */
function loadCheckoutScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new RazorpayError("error", "Not in a browser"));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new RazorpayError("error", "Failed to load Razorpay")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new RazorpayError("error", "Failed to load Razorpay Checkout"));
    document.body.appendChild(script);
  });
}

export interface PayWithRazorpayParams {
  /** Amount in RUPEES (the server reconfirms the canonical price separately). */
  amount: number;
  /** Customer-facing brand name shown in the modal. */
  businessName: string;
  customerName?: string;
  phone?: string;
  /** Opaque reference for reconciliation. */
  receipt?: string;
  themeColor?: string;
}

export interface RazorpayPayResult {
  paymentId: string;
  /** Full proof — forwarded to /api/orders/place so the server re-verifies the
   *  signature + captured amount before writing the order. */
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export async function payWithRazorpay(
  params: PayWithRazorpayParams,
): Promise<RazorpayPayResult> {
  // 1. Create the order on our server.
  const createRes = await fetch("/api/payments/razorpay/create-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      amount: params.amount,
      receipt: params.receipt,
      phone: params.phone,
    }),
  });

  const createData = (await createRes.json().catch(() => ({}))) as {
    orderId?: string;
    amount?: number;
    currency?: string;
    keyId?: string;
    configured?: boolean;
    error?: string;
  };

  if (createRes.status === 503) {
    throw new RazorpayError(
      "not_configured",
      createData.error || "Online payment is not configured",
    );
  }
  if (!createRes.ok || !createData.orderId || !createData.keyId) {
    throw new RazorpayError(
      "error",
      createData.error || "Could not start payment",
    );
  }

  // 2. Load Checkout.js.
  await loadCheckoutScript();
  if (!window.Razorpay) {
    throw new RazorpayError("error", "Razorpay Checkout unavailable");
  }

  // 3. Open the modal and wait for the result.
  return new Promise<RazorpayPayResult>((resolve, reject) => {
    let settled = false;

    const rzp = new window.Razorpay!({
      key: createData.keyId!,
      amount: createData.amount!,
      currency: createData.currency || "INR",
      name: params.businessName,
      description: "Order payment",
      order_id: createData.orderId!,
      prefill: { name: params.customerName, contact: params.phone },
      theme: { color: params.themeColor || "#FF6B00" },
      handler: async (response) => {
        try {
          const verifyRes = await fetch("/api/payments/razorpay/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(response),
          });
          const verifyData = (await verifyRes.json().catch(() => ({}))) as {
            verified?: boolean;
            paymentId?: string;
            error?: string;
          };
          if (verifyRes.ok && verifyData.verified) {
            settled = true;
            resolve({
              paymentId: verifyData.paymentId || response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
          } else {
            settled = true;
            reject(
              new RazorpayError(
                "verify_failed",
                verifyData.error || "Payment could not be verified",
              ),
            );
          }
        } catch {
          settled = true;
          reject(
            new RazorpayError("verify_failed", "Payment verification failed"),
          );
        }
      },
      modal: {
        ondismiss: () => {
          if (!settled) {
            reject(new RazorpayError("cancelled", "Payment cancelled"));
          }
        },
      },
    });

    rzp.open();
  });
}
