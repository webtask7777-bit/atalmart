import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { rateLimitWithPrune, clientKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MSG91_VERIFY_URL =
  "https://control.msg91.com/api/v5/widget/verifyAccessToken";

/**
 * Completes an MSG91-widget phone login.
 *
 * Flow: the browser verifies the OTP with MSG91's widget and posts us the
 * resulting access token. We re-verify that token against MSG91 (server-side,
 * with the secret auth key) so a forged token can't mint a session. On success
 * we find-or-create the Supabase user for that phone and hand back a real
 * Supabase session (access + refresh token) for the client to adopt.
 *
 * Supabase never sends the SMS here — MSG91 does — so no Supabase phone/SMS
 * provider config is required. Under the hood the user is a normal
 * email+password account (synthetic email + a server-derived password the
 * client never sees); MSG91 possession-of-phone is what gates access.
 */

/** Deterministic, never-exposed password for a phone's shadow account. */
function derivedPassword(phone: string): string {
  const secret =
    process.env.MSG91_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  return createHmac("sha256", secret)
    .update(`atalmart:otp:${phone}`)
    .digest("base64")
    .slice(0, 40);
}

function syntheticEmail(phone: string): string {
  return `${phone}@phone.atalmart.com`;
}

export async function POST(req: NextRequest) {
  let body: { accessToken?: string; phone?: string };
  try {
    body = (await req.json()) as { accessToken?: string; phone?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accessToken = (body.accessToken || "").trim();
  const phone = (body.phone || "").replace(/\D/g, "").slice(-10);
  if (!accessToken || phone.length !== 10) {
    return NextResponse.json(
      { error: "accessToken and 10-digit phone required" },
      { status: 400 },
    );
  }

  // Rate-limit: 20 verifications / 10 min per IP — generous for a real login,
  // blocks scripted session-minting attempts.
  const limit = rateLimitWithPrune(
    clientKey(req, null, "msg91-verify"),
    20,
    10 * 60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts — wait ${limit.retryAfterSec}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const authkey = process.env.MSG91_AUTH_KEY;
  if (!authkey) {
    return NextResponse.json(
      { error: "Phone login is not configured yet." },
      { status: 503 },
    );
  }

  // 1) Re-verify the widget access token with MSG91.
  let verified: { type?: string; message?: string } | null = null;
  try {
    const res = await fetch(MSG91_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey, "access-token": accessToken }),
    });
    verified = (await res.json()) as { type?: string; message?: string };
  } catch {
    return NextResponse.json(
      { error: "Could not reach the SMS service. Please try again." },
      { status: 502 },
    );
  }
  if (!verified || verified.type !== "success") {
    return NextResponse.json(
      { error: "OTP verification failed. Please request a new code." },
      { status: 401 },
    );
  }
  // Guard against a token minted for a different number.
  const verifiedDigits = String(verified.message || "").replace(/\D/g, "");
  if (verifiedDigits && !verifiedDigits.endsWith(phone)) {
    return NextResponse.json({ error: "Phone number mismatch" }, { status: 401 });
  }

  // 2) Find-or-create the Supabase user for this phone.
  const admin = createAdminClient();
  const password = derivedPassword(phone);
  let email: string;

  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (prof?.id) {
    const { data: got } = await admin.auth.admin.getUserById(prof.id);
    const existingEmail = got.user?.email;
    email = existingEmail || syntheticEmail(phone);
    await admin.auth.admin.updateUserById(prof.id, {
      password,
      ...(existingEmail ? {} : { email, email_confirm: true }),
    });
  } else {
    email = syntheticEmail(phone);
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      phone: `91${phone}`,
      phone_confirm: true,
      user_metadata: { signup_via: "msg91" },
    });
    if (cErr || !created.user) {
      return NextResponse.json(
        { error: "Could not create your account. Please try again." },
        { status: 500 },
      );
    }
    // The handle_new_user trigger seeds profiles.phone from auth.users.phone
    // ("91XXXXXXXXXX"); normalise it to the 10-digit form the app uses.
    await admin.from("profiles").update({ phone }).eq("id", created.user.id);
  }

  // 3) Mint a real Supabase session via the shadow password.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (sErr || !signIn.session) {
    return NextResponse.json(
      { error: "Could not start your session. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
  });
}
