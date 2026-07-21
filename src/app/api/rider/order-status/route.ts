import { NextResponse } from "next/server";
import { requireRider } from "@/lib/server/rider-auth";

/**
 * POST /api/rider/order-status — advance an assigned order along the delivery
 * leg. Body: { orderId: string, status: "picked" | "out_for_delivery" | "delivered" }
 *
 * Guards:
 *  - order must belong to THIS rider (rider_id match)
 *  - only forward transitions the rider controls are allowed
 *  - on "delivered" we stamp delivered_at and, if the rider has no other active
 *    orders, flip their status busy → available
 */
export const runtime = "nodejs";

const RIDER_ALLOWED = new Set(["picked", "out_for_delivery", "delivered"]);
const ACTIVE_STATUSES = ["confirmed", "picking", "picked", "out_for_delivery"];

export async function POST(req: Request) {
  const { ctx, response } = await requireRider(req);
  if (response) return response;

  let body: { orderId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { orderId } = body;
  const status = body.status ?? "";
  if (!orderId || !RIDER_ALLOWED.has(status)) {
    return NextResponse.json(
      { error: "orderId aur valid status zaroori hai" },
      { status: 400 },
    );
  }

  // Verify ownership.
  const { data: order, error: fetchErr } = await ctx!.supabase
    .from("orders")
    .select("id, rider_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!order || order.rider_id !== ctx!.riderId) {
    return NextResponse.json(
      { error: "Yeh order aapko assign nahi hai" },
      { status: 403 },
    );
  }
  if (order.status === "delivered" || order.status === "cancelled") {
    return NextResponse.json(
      { error: "Order already closed" },
      { status: 409 },
    );
  }

  const patch: Record<string, unknown> = { status };
  if (status === "delivered") patch.delivered_at = new Date().toISOString();

  const { error: updErr } = await ctx!.supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId);
  if (updErr) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Keep rider availability honest.
  if (status === "delivered") {
    const { count } = await ctx!.supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("rider_id", ctx!.riderId)
      .in("status", ACTIVE_STATUSES);
    if ((count ?? 0) === 0) {
      await ctx!.supabase
        .from("riders")
        .update({ status: "available" })
        .eq("id", ctx!.riderId)
        .eq("status", "busy");
    }
  } else {
    // Picking up / en route → mark busy.
    await ctx!.supabase
      .from("riders")
      .update({ status: "busy" })
      .eq("id", ctx!.riderId)
      .eq("status", "available");
  }

  return NextResponse.json({ ok: true, status });
}
