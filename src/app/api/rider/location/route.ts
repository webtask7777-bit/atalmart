import { NextResponse } from "next/server";
import { requireRider } from "@/lib/server/rider-auth";

/**
 * POST /api/rider/location — broadcast the rider's current GPS position.
 * Body: { lat: number, lng: number }
 *
 * Writes to riders.lat/lng + last_seen_at. The customer order-tracking map
 * reads order.rider.lat/lng, so this is what makes live tracking move.
 * Called on a short interval by the rider app while online.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { ctx, response } = await requireRider(req);
  if (response) return response;

  let body: { lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }

  const { error } = await ctx!.supabase
    .from("riders")
    .update({ lat, lng, last_seen_at: new Date().toISOString() })
    .eq("id", ctx!.riderId);

  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
