import { NextResponse } from "next/server";
import { requireRider } from "@/lib/server/rider-auth";
import {
  resolveBonusRule,
  resolveRiderPayout,
  summarizeRiderEarnings,
} from "@/lib/rider-earnings";

/**
 * GET /api/rider/stats — delivery + earnings summary for the rider.
 *
 * Earnings = deliveries × `settings.rider_payout_per_delivery` (024) plus one
 * daily bonus when `rider_bonus_target` deliveries are done in an IST day
 * (025). The admin sets all three under Settings → Delivery. Not the
 * customer's delivery fee — that is ₹0 on free-delivery orders. Missing
 * columns degrade to the default payout / no bonus.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { ctx, response } = await requireRider(req);
  if (response) return response;

  const [{ data, error }, settingsRes] = await Promise.all([
    ctx!.supabase
      .from("orders")
      .select("delivered_at")
      .eq("rider_id", ctx!.riderId)
      .eq("status", "delivered"),
    ctx!.supabase
      .from("settings")
      .select("rider_payout_per_delivery, rider_bonus_target, rider_bonus_amount")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  if (error) {
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }

  const cfg = (settingsRes.data ?? {}) as {
    rider_payout_per_delivery?: unknown;
    rider_bonus_target?: unknown;
    rider_bonus_amount?: unknown;
  };
  const payout = resolveRiderPayout(cfg.rider_payout_per_delivery);
  const bonus = resolveBonusRule(cfg.rider_bonus_target, cfg.rider_bonus_amount);

  return NextResponse.json(summarizeRiderEarnings(data ?? [], payout, bonus));
}
