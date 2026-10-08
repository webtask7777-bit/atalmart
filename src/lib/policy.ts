/**
 * Returns / complaints policy — single configuration.
 *
 * Product rows carry a free-text `return_policy` (seed data). Three Devbhog
 * rows say "2 ghante", 991 say 24 hours, and the FAQ, refund page and
 * isWithinReturnWindow() all enforce 24 hours — so the PDP showed a deadline
 * the app never applied. Every surface now renders from this file; the
 * product column is no longer displayed.
 *
 * To give a category a different reporting window, add it to
 * CATEGORY_EXCEPTIONS (one line) — nothing else needs to change. The merchant
 * has NOT yet confirmed whether fresh dairy should be 2 h; see
 * docs/launch-polish-2026-10-08.md.
 */

export interface ReturnPolicy {
  /** Hours after delivery within which a problem must be reported. */
  reportWindowHours: number;
  /** Category-specific guidance shown with the window. */
  note: string | null;
  /** What qualifies. */
  eligible: readonly string[];
  /** What does not. */
  notEligible: readonly string[];
  /** Refund timing copy — a separate concept from the reporting window. */
  refundTimeline: string;
  /** Cancellation rule — separate from returns. */
  cancellation: string;
}

export const DEFAULT_REPORT_WINDOW_HOURS = 24;

const BASE_POLICY: Omit<ReturnPolicy, "note"> = {
  reportWindowHours: DEFAULT_REPORT_WINDOW_HOURS,
  eligible: [
    "Item damaged on arrival",
    "Wrong item delivered",
    "Quality not as expected",
    "Expired or near-expiry product",
    "Item missing from order",
    "Quantity mismatch",
  ],
  notEligible: [
    "Opened personal-care products",
    "Paan corner (tobacco) items",
    "Items whose packaging has been opened (unless damaged or incorrect)",
  ],
  refundTimeline:
    "Approved return par full refund ya replacement. Online/UPI refund 3–5 business days mein source account mein; COD return ka refund aapke bataye UPI/bank account mein 3–5 business days mein.",
  cancellation:
    "“Out for Delivery” se pehle free cancellation. Rider pickup ke baad ₹15 tak cancellation fee lag sakta hai.",
};

/** Categories treated as fresh: same window, plus a "report promptly with a
 *  photo" note. Set `reportWindowHours` here only once the merchant confirms
 *  a different window for that category. */
export const CATEGORY_EXCEPTIONS: Record<
  string,
  { reportWindowHours?: number; note: string }
> = {
  Dairy: {
    note: "Fresh item — pack leak, khatta ya expired mile to delivery ke turant baad photo ke saath report karein. Khula pack return nahi hota.",
  },
  "Fruits & Vegetables": {
    note: "Fresh item — kharab ya galat sabzi/fruit mile to delivery ke turant baad photo ke saath report karein.",
  },
  "Chicken, Meat & Fish": {
    note: "Fresh item — delivery ke turant baad check karein aur problem ho to photo ke saath report karein.",
  },
};

export function effectiveReturnPolicy(categoryName?: string | null): ReturnPolicy {
  const exception = categoryName ? CATEGORY_EXCEPTIONS[categoryName] : undefined;
  return {
    ...BASE_POLICY,
    reportWindowHours: exception?.reportWindowHours ?? BASE_POLICY.reportWindowHours,
    note: exception?.note ?? null,
  };
}

/** "24 ghante" / "2 ghante" */
export function formatReportWindow(hours: number): string {
  return `${hours} ghante`;
}

export function isWithinReportWindow(
  deliveredAt: string | null | undefined,
  categoryName?: string | null,
  now: number = Date.now(),
): boolean {
  if (!deliveredAt) return false;
  const elapsedHours = (now - new Date(deliveredAt).getTime()) / 3_600_000;
  return elapsedHours <= effectiveReturnPolicy(categoryName).reportWindowHours;
}
