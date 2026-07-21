import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { signRiderToken } from "@/lib/server/rider-session";

/**
 * POST /api/rider/login
 * Body: { phone: string (10 digit), code: string }
 *
 * Validates phone + access code against the riders table (service role,
 * bypasses RLS) and issues a signed session token. Returns 401 on mismatch,
 * 403 if the rider is deactivated.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = String(body.phone ?? "").replace(/\D/g, "").slice(-10);
  const code = String(body.code ?? "").trim();
  if (phone.length !== 10 || !code) {
    return NextResponse.json(
      { error: "Phone (10 digit) aur access code zaroori hai" },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const { data: rider, error } = await supabase
    .from("riders")
    .select("id, name, phone, vehicle_number, status, active, access_code")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
  if (!rider || rider.access_code !== code) {
    return NextResponse.json(
      { error: "Phone ya access code galat hai" },
      { status: 401 },
    );
  }
  if (!rider.active) {
    return NextResponse.json(
      { error: "Aapka account abhi inactive hai. Admin se baat karein." },
      { status: 403 },
    );
  }

  const token = signRiderToken(rider.id);
  return NextResponse.json({
    token,
    rider: {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      vehicle_number: rider.vehicle_number,
      status: rider.status,
    },
  });
}
