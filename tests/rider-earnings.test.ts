import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeRiderEarnings,
  resolveRiderPayout,
  resolveBonusRule,
  istDayStartUtc,
  DEFAULT_RIDER_PAYOUT,
  NO_BONUS,
} from "@/lib/rider-earnings";

test("rider earns the fixed payout per delivery, not the customer's delivery fee", () => {
  // 10 Oct 2026 10:00 IST = 04:30 UTC
  const now = new Date("2026-10-10T04:30:00Z");
  const rows = [
    { delivered_at: "2026-10-10T03:00:00Z" }, // today IST (08:30)
    { delivered_at: "2026-10-09T19:00:00Z" }, // today IST (00:30) — after IST midnight
    { delivered_at: "2026-10-09T18:00:00Z" }, // yesterday IST (23:30)
    { delivered_at: null }, // delivered row without a stamp: counts all-time only
  ];
  const s = summarizeRiderEarnings(rows, 20, NO_BONUS, now);
  assert.equal(s.payoutPerDelivery, 20);
  assert.deepEqual(s.today, { deliveries: 2, earnings: 40, bonusEarned: false });
  assert.deepEqual(s.allTime, { deliveries: 4, earnings: 80, bonusDays: 0 });
});

test("IST midnight boundary", () => {
  // 00:00 IST on 10 Oct = 18:30 UTC on 9 Oct
  assert.equal(
    istDayStartUtc(new Date("2026-10-10T04:30:00Z")),
    Date.parse("2026-10-09T18:30:00Z"),
  );
});

test("payout setting: junk or missing falls back to the default, 0 is honoured", () => {
  assert.equal(resolveRiderPayout(undefined), DEFAULT_RIDER_PAYOUT);
  assert.equal(resolveRiderPayout("abc"), DEFAULT_RIDER_PAYOUT);
  assert.equal(resolveRiderPayout(-5), DEFAULT_RIDER_PAYOUT);
  assert.equal(resolveRiderPayout("15.00"), 15);
  assert.equal(resolveRiderPayout(0), 0);
});

test("fixed-salary mode: payout 0 → earnings 0, counts still tracked", () => {
  const s = summarizeRiderEarnings(
    [{ delivered_at: "2026-10-10T03:00:00Z" }],
    0,
    NO_BONUS,
    new Date("2026-10-10T04:30:00Z"),
  );
  assert.equal(s.payoutPerDelivery, 0);
  assert.deepEqual(s.today, { deliveries: 1, earnings: 0, bonusEarned: false });
});

test("daily bonus: paid once per IST day the target is met, today and historically", () => {
  const now = new Date("2026-10-10T12:00:00Z"); // 10 Oct 17:30 IST
  const day = (d: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ delivered_at: `${d}T0${i}:00:00Z` }));
  const rows = [
    ...day("2026-10-10", 3), // today: 3 ≥ target 3 → bonus
    ...day("2026-10-09", 2), // yesterday: 2 < 3 → no bonus
    ...day("2026-10-08", 5), // 5 ≥ 3 → bonus (still one bonus, not two)
  ];
  const bonus = resolveBonusRule(3, 100);
  const s = summarizeRiderEarnings(rows, 0, bonus, now);
  assert.deepEqual(s.bonus, { target: 3, amount: 100 });
  assert.deepEqual(s.today, { deliveries: 3, earnings: 100, bonusEarned: true });
  assert.deepEqual(s.allTime, { deliveries: 10, earnings: 200, bonusDays: 2 });

  // With a per-delivery payout too, both add up.
  const both = summarizeRiderEarnings(rows, 10, bonus, now);
  assert.equal(both.today.earnings, 130);
  assert.equal(both.allTime.earnings, 300);
});

test("bonus rule: 0 / junk disables it; target is whole deliveries", () => {
  assert.deepEqual(resolveBonusRule(0, 100), NO_BONUS);
  assert.deepEqual(resolveBonusRule(15, 0), NO_BONUS);
  assert.deepEqual(resolveBonusRule("x", 100), NO_BONUS);
  assert.deepEqual(resolveBonusRule("15.9", "100"), { target: 15, amount: 100 });
});
