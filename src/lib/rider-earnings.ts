/**
 * Rider earnings — one rule, used by the rider app (/api/rider/stats) and the
 * admin riders page.
 *
 * Two configurable parts, both from `settings` (migrations 024 + 025):
 *   • `rider_payout_per_delivery` — fixed ₹ per completed delivery.
 *     0 = the rider is on a fixed salary (the app then shows counts only).
 *   • `rider_bonus_target` / `rider_bonus_amount` — ONE daily bonus: finish
 *     `target` deliveries in an IST day, earn `amount`. target 0 = no bonus.
 *
 * Deliberately NOT the customer's delivery fee: that is ₹0 on free-delivery
 * orders, and the rider still rode.
 */

export const DEFAULT_RIDER_PAYOUT = 20;

export const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** Start of "today" in IST, as a UTC epoch (ms). The store runs in one TZ. */
export function istDayStartUtc(now: Date = new Date()): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const midnightIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return midnightIst - IST_OFFSET_MS;
}

/** IST calendar day key (YYYY-MM-DD) for grouping deliveries into days. */
export function istDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Coerce a settings value to a usable payout; falls back on junk/missing. */
export function resolveRiderPayout(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RIDER_PAYOUT;
}

export interface BonusRule {
  /** Deliveries per IST day needed to earn the bonus. 0 = disabled. */
  target: number;
  /** ₹ earned once per day when the target is met. */
  amount: number;
}

/** Coerce settings values to a bonus rule; anything odd disables the bonus. */
export function resolveBonusRule(target: unknown, amount: unknown): BonusRule {
  const t = Math.floor(Number(target));
  const a = Number(amount);
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(a) || a <= 0) {
    return { target: 0, amount: 0 };
  }
  return { target: t, amount: a };
}

export const NO_BONUS: BonusRule = { target: 0, amount: 0 };

export interface DeliveredRow {
  delivered_at: string | null;
}

export interface RiderEarnings {
  /** The configured per-delivery payout. 0 = rider is on a fixed salary. */
  payoutPerDelivery: number;
  /** The configured daily bonus; target 0 = none. */
  bonus: BonusRule;
  today: {
    deliveries: number;
    /** payout × deliveries + today's bonus if earned */
    earnings: number;
    bonusEarned: boolean;
  };
  allTime: {
    deliveries: number;
    /** payout × deliveries + bonus × bonusDays */
    earnings: number;
    /** IST days on which the target was met */
    bonusDays: number;
  };
}

/** Count delivered rows into today / all-time deliveries, bonus days and ₹. */
export function summarizeRiderEarnings(
  rows: DeliveredRow[],
  payoutPerDelivery: number,
  bonus: BonusRule = NO_BONUS,
  now: Date = new Date(),
): RiderEarnings {
  const dayStart = istDayStartUtc(now);
  const todayKey = istDayKey(now.toISOString());
  const perDay = new Map<string, number>();
  let todayCount = 0;

  for (const r of rows) {
    if (!r.delivered_at) continue;
    const t = new Date(r.delivered_at).getTime();
    if (t >= dayStart) todayCount += 1;
    const k = istDayKey(r.delivered_at);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  const active = bonus.target > 0 && bonus.amount > 0;
  let bonusDays = 0;
  if (active) {
    for (const n of perDay.values()) if (n >= bonus.target) bonusDays += 1;
  }
  const todayBonus = active && (perDay.get(todayKey) ?? 0) >= bonus.target;

  return {
    payoutPerDelivery,
    bonus: active ? bonus : NO_BONUS,
    today: {
      deliveries: todayCount,
      earnings: Math.round(todayCount * payoutPerDelivery + (todayBonus ? bonus.amount : 0)),
      bonusEarned: todayBonus,
    },
    allTime: {
      deliveries: rows.length,
      earnings: Math.round(rows.length * payoutPerDelivery + bonusDays * bonus.amount),
      bonusDays,
    },
  };
}
