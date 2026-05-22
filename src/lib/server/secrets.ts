/**
 * Server-only secret resolution. NEVER import from client code.
 *
 * Each helper prefers `process.env` (the secure path); only falls back to
 * a request-body value when running in dev/demo mode. In production, the
 * env var is required — request-body credentials are ignored entirely.
 *
 * Why this matters: customer browsers were posting `apiKey` in chat/WhatsApp
 * requests. Any customer could open devtools, grab the key, and run up the
 * bill. Env vars stay server-side and never touch a browser.
 */

const IS_PROD = process.env.NODE_ENV === "production";

interface ResolvedSecret {
  /** The actual secret value, or empty string if not configured. */
  value: string;
  /** Where the secret came from — useful for debugging without leaking. */
  source: "env" | "request-body" | "missing";
}

/** Pick the env value if set; else fall back to request body (dev only). */
function resolve(envName: string, bodyValue?: string): ResolvedSecret {
  const envValue = process.env[envName];
  if (envValue && envValue.trim().length > 0) {
    return { value: envValue, source: "env" };
  }
  if (!IS_PROD && bodyValue && bodyValue.trim().length > 0) {
    return { value: bodyValue, source: "request-body" };
  }
  return { value: "", source: "missing" };
}

// ─── Anthropic (chat) ───────────────────────────────────────────────
export function resolveAnthropicKey(bodyValue?: string): ResolvedSecret {
  return resolve("ANTHROPIC_API_KEY", bodyValue);
}

// ─── WhatsApp Business (Meta Cloud API) ────────────────────────────
export interface WhatsAppCreds {
  accessToken: ResolvedSecret;
  phoneNumberId: ResolvedSecret;
}

export function resolveWhatsAppCreds(body?: {
  accessToken?: string;
  phoneNumberId?: string;
}): WhatsAppCreds {
  return {
    accessToken: resolve("WHATSAPP_ACCESS_TOKEN", body?.accessToken),
    phoneNumberId: resolve("WHATSAPP_PHONE_NUMBER_ID", body?.phoneNumberId),
  };
}

// ─── Razorpay ──────────────────────────────────────────────────────
export interface RazorpayCreds {
  keyId: ResolvedSecret; // public — safe to expose to browser at checkout
  keySecret: ResolvedSecret; // server-only — signs order_create
  webhookSecret: ResolvedSecret; // server-only — verifies webhook events
}

export function resolveRazorpayCreds(): RazorpayCreds {
  return {
    keyId: resolve("RAZORPAY_KEY_ID"),
    keySecret: resolve("RAZORPAY_KEY_SECRET"),
    webhookSecret: resolve("RAZORPAY_WEBHOOK_SECRET"),
  };
}

/** Returns true if the secret is "live" (env-sourced) — production-safe. */
export function isLive(s: ResolvedSecret): boolean {
  return s.source === "env";
}
