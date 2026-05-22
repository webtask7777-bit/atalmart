/**
 * Money helpers for Atalmart.
 *
 * **Convention**: all money values in this codebase are **whole integer rupees**
 * (paise stored implicitly as 0). Indian grocery prices round to ₹1 anyway, and
 * keeping everything as integers eliminates an entire class of floating-point
 * drift bugs in coupon/wallet/refund arithmetic.
 *
 * The DB schema uses `numeric(10,2)` which is exact decimal — Postgres won't
 * introduce drift on its own. The risk is purely on the JavaScript side, where
 * `0.1 + 0.2 !== 0.3`. By forcing every server-side math operation through
 * integer rupees, we sidestep that entirely.
 *
 * If you ever need fractional pricing (e.g. ₹49.50 sale prices), the migration
 * is: store everything as integer paise (×100) in the DB and at the API layer,
 * and only divide by 100 at the display boundary. Do NOT introduce decimal
 * rupees — that's the worst of both worlds.
 */

/** Branded type so we get a type error if someone passes a float as money. */
export type Rupees = number & { readonly __rupees: unique symbol };

/**
 * Assert a value is a non-negative whole rupee number. Throws at runtime if
 * the caller violates the convention — used as a defensive check at server
 * boundaries (API routes, DB writes) to catch drift before it gets stored.
 */
export function assertRupees(value: number, label: string): Rupees {
  if (!Number.isFinite(value)) {
    throw new Error(`[money] ${label} is not a finite number: ${value}`);
  }
  if (value < 0) {
    throw new Error(`[money] ${label} is negative: ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(
      `[money] ${label} must be a whole rupee integer, got ${value}. ` +
        `Round at the calculation site, not here.`,
    );
  }
  return value as Rupees;
}

/** Coerce — accepts any numeric and rounds to nearest whole rupee. */
export function toRupees(value: number): Rupees {
  return Math.max(0, Math.round(value)) as Rupees;
}

/** Format an integer rupee value for display: 1234 → "₹1,234". */
export function formatRupees(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

/** Format with paise (for invoice line items where rupees feel terse). */
export function formatRupeesDetailed(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}.00`;
}
