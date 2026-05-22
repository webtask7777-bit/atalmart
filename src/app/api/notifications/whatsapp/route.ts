import { NextRequest, NextResponse } from "next/server";
import { resolveWhatsAppCreds } from "@/lib/server/secrets";
import { rateLimitWithPrune, clientKey } from "@/lib/server/rate-limit";
import { isDemoMode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface WhatsAppRequest {
  to: string; // recipient phone (with country code, e.g. "+919876543210")
  template: string; // template name registered in Meta console
  params: string[]; // body parameters in order
  /**
   * @deprecated The server reads WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID
   * from env. In dev mode, falls back to these settings if env is missing.
   * Production ignores this entirely — credentials never leave the server.
   */
  settings?: {
    enabled: boolean;
    accessToken: string;
    phoneNumberId: string;
  };
}

/**
 * Sends a WhatsApp Business Cloud API template message via Meta Graph API.
 * When settings.enabled is false or credentials missing, runs in demo mode:
 * logs to server console and returns { demo: true }.
 */
export async function POST(req: NextRequest) {
  let body: WhatsAppRequest;
  try {
    body = (await req.json()) as WhatsAppRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { to, template, params, settings } = body;

  if (!to || !template) {
    return NextResponse.json(
      { error: "to and template are required" },
      { status: 400 },
    );
  }

  // Auth: when not in demo mode, require an authenticated session. Customers
  // get their own order notifications routed through this path; admins also.
  // Anyone unauthenticated is rejected.
  let sessionUserId: string | null = null;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    sessionUserId = user.id;
  }

  // Rate-limit: 60 sends / hour per user (or per IP in demo mode). Genuine
  // order traffic stays well under this; abusers get blocked.
  const limit = rateLimitWithPrune(
    clientKey(req, sessionUserId, "whatsapp"),
    60,
    60 * 60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded — wait ${limit.retryAfterSec}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  // Normalize phone: strip +, spaces, dashes — Meta API wants digits only
  const normalizedTo = to.replace(/[\s+\-()]/g, "");

  // Resolve credentials: env first (production), request body only as dev
  // fallback. The `settings.enabled` toggle in the body is a UX-only flag —
  // the actual "can we send" decision is "do we have both creds resolved?"
  const creds = resolveWhatsAppCreds({
    accessToken: settings?.enabled ? settings.accessToken : "",
    phoneNumberId: settings?.enabled ? settings.phoneNumberId : "",
  });

  // Demo mode — log redacted summary and return
  if (!creds.accessToken.value || !creds.phoneNumberId.value) {
    // Redact phone (keep first 2 + last 2 digits): 9876543210 → 98******10
    const redactedTo =
      normalizedTo.length >= 6
        ? normalizedTo.slice(0, 2) +
          "*".repeat(normalizedTo.length - 4) +
          normalizedTo.slice(-2)
        : "***";
    console.log(`[WhatsApp demo] To: ${redactedTo} | Template: ${template}`);
    return NextResponse.json({ demo: true, to: normalizedTo, template, params });
  }

  // Real send via Meta Graph API
  try {
    const url = `https://graph.facebook.com/v21.0/${creds.phoneNumberId.value}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: normalizedTo,
      type: "template",
      template: {
        name: template,
        language: { code: "en" },
        components: params.length
          ? [
              {
                type: "body",
                parameters: params.map((value) => ({ type: "text", text: value })),
              },
            ]
          : [],
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${creds.accessToken.value}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      const errMessage =
        (data as { error?: { message?: string } }).error?.message ||
        `Meta API HTTP ${res.status}`;
      return NextResponse.json({ error: errMessage }, { status: res.status });
    }

    return NextResponse.json({ success: true, response: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
