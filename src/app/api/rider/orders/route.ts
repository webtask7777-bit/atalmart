import { NextResponse } from "next/server";
import { requireRider } from "@/lib/server/rider-auth";

/**
 * GET /api/rider/orders — orders assigned to this rider that are still in
 * flight (confirmed → out_for_delivery). Delivered/cancelled are excluded;
 * those feed /api/rider/stats instead.
 *
 * Returns customer-facing delivery info: address, phone, drop lat/lng, total,
 * payment method, line items.
 */
export const runtime = "nodejs";

const ACTIVE_STATUSES = ["confirmed", "picking", "picked", "out_for_delivery"];

export async function GET(req: Request) {
  const { ctx, response } = await requireRider(req);
  if (response) return response;

  const { data, error } = await ctx!.supabase
    .from("orders")
    .select(
      "id, status, total, delivery_fee, address_line, lat, lng, phone, payment_method, placed_at, items:order_items(product_name, quantity), customer:profiles(name)",
    )
    .eq("rider_id", ctx!.riderId)
    .in("status", ACTIVE_STATUSES)
    .order("placed_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load orders", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ orders: data ?? [] });
}
