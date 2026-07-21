import { NextResponse } from "next/server";
import { requireRider } from "@/lib/server/rider-auth";

/**
 * GET /api/rider/me — current rider profile (used to restore a session on app
 * reload and to keep the online/offline toggle in sync).
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { ctx, response } = await requireRider(req);
  if (response) return response;

  const { data, error } = await ctx!.supabase
    .from("riders")
    .select("id, name, phone, vehicle_number, status, active")
    .eq("id", ctx!.riderId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Rider not found" }, { status: 404 });
  }
  if (!data.active) {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  return NextResponse.json({ rider: data });
}
