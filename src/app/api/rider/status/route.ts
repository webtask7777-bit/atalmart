import { NextResponse } from "next/server";
import { requireRider } from "@/lib/server/rider-auth";

/**
 * POST /api/rider/status — toggle online/offline.
 * Body: { status: "available" | "offline" }
 *
 * "busy" is set automatically by the system when a rider has an active order;
 * the rider only flips between available and offline.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { ctx, response } = await requireRider(req);
  if (response) return response;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = body.status;
  if (status !== "available" && status !== "offline") {
    return NextResponse.json(
      { error: "status must be 'available' or 'offline'" },
      { status: 400 },
    );
  }

  const { error } = await ctx!.supabase
    .from("riders")
    .update({ status, last_seen_at: new Date().toISOString() })
    .eq("id", ctx!.riderId);

  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status });
}
