import { NextResponse } from "next/server";
import { requireRider } from "@/lib/server/rider-auth";

/**
 * GET /api/rider/stats — delivery + earnings summary for the rider.
 *
 * Earnings model (v1): the rider earns the order's delivery_fee per completed
 * delivery. "Today" is since local midnight IST (the store operates in one
 * timezone). Returns today + all-time counts and rupee totals.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { ctx, response } = await requireRider(req);
  if (response) return response;

  const { data, error } = await ctx!.supabase
    .from("orders")
    .select("delivery_fee, delivered_at")
    .eq("rider_id", ctx!.riderId)
    .eq("status", "delivered");
  if (error) {
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }

  const rows = data ?? [];

  // IST midnight as a UTC instant: IST = UTC+5:30.
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 3600 * 1000;
  const ist = new Date(istMs);
  const istMidnight = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
  );
  const todayStartUtc = istMidnight - 5.5 * 3600 * 1000;

  let todayCount = 0;
  let todayEarnings = 0;
  let totalEarnings = 0;
  for (const r of rows) {
    const fee = Number(r.delivery_fee) || 0;
    totalEarnings += fee;
    if (r.delivered_at && new Date(r.delivered_at).getTime() >= todayStartUtc) {
      todayCount += 1;
      todayEarnings += fee;
    }
  }

  return NextResponse.json({
    today: { deliveries: todayCount, earnings: Math.round(todayEarnings) },
    allTime: {
      deliveries: rows.length,
      earnings: Math.round(totalEarnings),
    },
  });
}
