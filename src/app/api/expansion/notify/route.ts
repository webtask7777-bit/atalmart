import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

/**
 * POST /api/expansion/notify
 *
 * Body: { pincode: string, contact: string }
 *   - pincode: 6 digits (a NON-serviceable one — the gate only shows this
 *     form on "not yet here")
 *   - contact: 10-digit Indian phone OR an email address
 * Returns:
 *   200 { ok: true }         stored (or already stored — same response)
 *   400 { error }            bad input
 *   503 { error }            service role not configured
 *
 * Public route, service-role write. Row goes to public.expansion_requests
 * (migration 021). We never echo the contact back.
 */
export const runtime = "nodejs";

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Parsed =
  | { ok: true; pincode: string; contact: string; contactType: "phone" | "email" }
  | { ok: false; error: string };

function parseBody(input: unknown): Parsed {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid body" };
  const o = input as Record<string, unknown>;
  const pincode = String(o.pincode ?? "").replace(/\D/g, "");
  if (pincode.length !== 6) return { ok: false, error: "Valid 6-digit pincode required" };

  const raw = String(o.contact ?? "").trim();
  if (!raw) return { ok: false, error: "Phone number ya email daalein" };

  // Phone: strip spaces/dashes and an optional +91 / 0 prefix.
  const digits = raw.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  if (PHONE_RE.test(digits)) {
    return { ok: true, pincode, contact: digits, contactType: "phone" };
  }
  const email = raw.toLowerCase();
  if (email.length <= 120 && EMAIL_RE.test(email)) {
    return { ok: true, pincode, contact: email, contactType: "email" };
  }
  return { ok: false, error: "10-digit phone number ya sahi email daalein" };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Notify service not configured" },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("expansion_requests").upsert(
    {
      pincode: parsed.pincode,
      contact: parsed.contact,
      contact_type: parsed.contactType,
      source: "pincode_gate",
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "pincode,contact", ignoreDuplicates: true },
  );

  if (error) {
    return NextResponse.json(
      { error: "Save failed", detail: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
