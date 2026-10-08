import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveReturnPolicy, isWithinReportWindow, CATEGORY_EXCEPTIONS, DEFAULT_REPORT_WINDOW_HOURS } from "@/lib/policy";

test("one window everywhere unless a category exception sets another", () => {
  assert.equal(effectiveReturnPolicy("Dairy").reportWindowHours, DEFAULT_REPORT_WINDOW_HOURS);
  assert.equal(effectiveReturnPolicy("Snacks & Munchies").reportWindowHours, DEFAULT_REPORT_WINDOW_HOURS);
  assert.equal(effectiveReturnPolicy(null).note, null);
  assert.match(effectiveReturnPolicy("Dairy").note ?? "", /photo/);
});

test("reporting window, refund timeline and cancellation are distinct fields", () => {
  const p = effectiveReturnPolicy("Dairy");
  assert.match(p.refundTimeline, /3–5 business days/);
  assert.match(p.cancellation, /Out for Delivery/);
  assert.ok(p.eligible.length >= 5 && p.notEligible.length >= 3);
});

test("isWithinReportWindow honours a category exception", () => {
  const delivered = new Date("2026-10-08T10:00:00Z").toISOString();
  const at = (h: number) => Date.UTC(2026, 9, 8, 10 + h);
  assert.equal(isWithinReportWindow(delivered, "Dairy", at(23)), true);
  assert.equal(isWithinReportWindow(delivered, "Dairy", at(25)), false);
  assert.equal(isWithinReportWindow(null, "Dairy"), false);
  const prev = CATEGORY_EXCEPTIONS.Dairy;
  CATEGORY_EXCEPTIONS.Dairy = { ...prev, reportWindowHours: 2 };
  try {
    assert.equal(isWithinReportWindow(delivered, "Dairy", at(3)), false);
    assert.equal(isWithinReportWindow(delivered, "Snacks & Munchies", at(3)), true);
  } finally {
    CATEGORY_EXCEPTIONS.Dairy = prev;
  }
});
