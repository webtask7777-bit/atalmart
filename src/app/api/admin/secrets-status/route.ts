import { NextResponse } from "next/server";
import { requireRole } from "@/lib/supabase/auth-guard";
import {
  resolveAnthropicKey,
  resolveWhatsAppCreds,
  resolveRazorpayCreds,
  isLive,
} from "@/lib/server/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only endpoint that tells the admin Settings UI which secrets are
 * configured via env (the production-safe path) vs only in localStorage.
 *
 * NEVER returns the actual secret value — only the source.
 */
export async function GET() {
  const guard = await requireRole("admin");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const anthropic = resolveAnthropicKey();
  const wa = resolveWhatsAppCreds();
  const rz = resolveRazorpayCreds();

  return NextResponse.json({
    anthropic: {
      live: isLive(anthropic),
      configured: !!anthropic.value,
    },
    whatsapp: {
      live: isLive(wa.accessToken) && isLive(wa.phoneNumberId),
      configured: !!wa.accessToken.value && !!wa.phoneNumberId.value,
    },
    razorpay: {
      live: isLive(rz.keyId) && isLive(rz.keySecret),
      configured: !!rz.keyId.value && !!rz.keySecret.value,
      hasWebhook: !!rz.webhookSecret.value,
    },
  });
}
