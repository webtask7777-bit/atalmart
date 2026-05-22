export const APP_NAME = "Atalmart";
export const APP_TAGLINE = "Atal Nagar ki Atal Delivery";

export const DELIVERY_FEE = 25;
export const FREE_DELIVERY_ABOVE = 299;

export const STORE_LOCATION = {
  lat: 21.1610,
  lng: 81.7869,
  address: "Sector 21, Atal Nagar, Naya Raipur",
};

/** Friendly area label for each serviceable pincode (used in confirmation UI). */
export const PINCODE_AREA_LABELS: Record<string, string> = {
  "492101": "Sector 21–29, Atal Nagar",
  "492014": "Sector 17, Atal Nagar",
  "492015": "Naya Raipur Township",
  "492018": "Capital Complex, Naya Raipur",
  "492030": "Mantralaya, Naya Raipur",
};

/** Parse a comma-separated pincode string from settings into a Set. */
export function parseServiceablePincodes(csv: string): Set<string> {
  return new Set(
    csv
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{6}$/.test(s)),
  );
}

/** Returns true if the given pincode is serviceable per the settings list. */
export function isServiceablePincode(
  pincode: string,
  serviceablePincodesCsv: string,
): boolean {
  const cleaned = pincode.trim();
  if (!/^\d{6}$/.test(cleaned)) return false;
  return parseServiceablePincodes(serviceablePincodesCsv).has(cleaned);
}

// Promo codes
export type Coupon = {
  code: string;
  description: string;
  type: "flat" | "percent";
  value: number;
  minOrder: number;
  maxDiscount?: number;

  // Smart flags (all optional — default = unrestricted)
  firstOrderOnly?: boolean; // only customers with 0 previous orders
  maxUsesPerUser?: number; // total times a single user can apply (default unlimited)
  totalUsageLimit?: number; // global cap across all customers (campaign budget cap)
  totalUsageCount?: number; // current global usage — updated when applied
  campaignSource?: string; // links coupon to a campaign for ROI tracking
  validForPincodes?: string; // comma-separated; empty = all serviceable
  expiresAt?: string; // ISO date; expired = invalid
};

export const COUPONS: Coupon[] = [
  {
    code: "ATAL50",
    description: "₹50 off on first order",
    type: "flat",
    value: 50,
    minOrder: 199,
    firstOrderOnly: true,
  },
  {
    code: "NAYA10",
    description: "10% off (max ₹100)",
    type: "percent",
    value: 10,
    minOrder: 299,
    maxDiscount: 100,
  },
  {
    code: "GROCERY100",
    description: "₹100 off on ₹699+",
    type: "flat",
    value: 100,
    minOrder: 699,
  },
];

export function calculateCouponDiscount(coupon: Coupon | null, subtotal: number): number {
  if (!coupon || subtotal < coupon.minOrder) return 0;
  const raw = coupon.type === "flat" ? coupon.value : Math.round((subtotal * coupon.value) / 100);
  return coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
}

/**
 * Full validation that checks smart flags. Returns either {valid: true} or
 * {valid: false, reason: "human-readable message"} for inline display.
 */
export interface CouponValidationContext {
  subtotal: number;
  userOrderCount: number; // previous orders by this user
  userCouponUsage?: number; // times this user has used THIS coupon
  pincode?: string;
}

export function validateCoupon(
  coupon: Coupon,
  ctx: CouponValidationContext,
): { valid: true } | { valid: false; reason: string } {
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: "This coupon has expired" };
  }
  if (ctx.subtotal < coupon.minOrder) {
    return {
      valid: false,
      reason: `Min order ₹${coupon.minOrder} required (you have ₹${ctx.subtotal})`,
    };
  }
  if (coupon.firstOrderOnly && ctx.userOrderCount > 0) {
    return { valid: false, reason: "Valid only on first order" };
  }
  if (
    coupon.maxUsesPerUser &&
    ctx.userCouponUsage &&
    ctx.userCouponUsage >= coupon.maxUsesPerUser
  ) {
    return {
      valid: false,
      reason: `You've already used this coupon ${coupon.maxUsesPerUser} time(s)`,
    };
  }
  if (
    coupon.totalUsageLimit &&
    (coupon.totalUsageCount || 0) >= coupon.totalUsageLimit
  ) {
    return { valid: false, reason: "This coupon is fully redeemed" };
  }
  if (coupon.validForPincodes && ctx.pincode) {
    const allowed = parseServiceablePincodes(coupon.validForPincodes);
    if (!allowed.has(ctx.pincode)) {
      return { valid: false, reason: "Not valid in your area" };
    }
  }
  return { valid: true };
}

// Cancellation reasons
export const CANCEL_REASONS = [
  "Ordered by mistake",
  "Found cheaper elsewhere",
  "Delivery taking too long",
  "Wrong item selected",
  "Don't need anymore",
  "Other",
];

// Return reasons (typical Indian QC categories)
export const RETURN_REASONS = [
  "Item damaged on arrival",
  "Wrong item delivered",
  "Quality not as expected",
  "Expired or near-expiry product",
  "Item missing from order",
  "Quantity mismatch",
  "Other",
];

/** Window (hours) during which customer can request a return after delivery. */
export const RETURN_WINDOW_HOURS = 24;

export function isWithinReturnWindow(
  deliveredAt: string | null | undefined,
): boolean {
  if (!deliveredAt) return false;
  const elapsedHours = (Date.now() - new Date(deliveredAt).getTime()) / 3_600_000;
  return elapsedHours <= RETURN_WINDOW_HOURS;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  placed: "Order Placed",
  confirmed: "Confirmed",
  picking: "Picking Items",
  picked: "Ready for Delivery",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return Requested",
  return_approved: "Return Approved",
  return_rejected: "Return Rejected",
  refunded: "Refunded",
};

export const ORDER_STATUS_LABELS_HI: Record<string, string> = {
  placed: "ऑर्डर हो गया",
  confirmed: "कन्फर्म हो गया",
  picking: "सामान पैक हो रहा है",
  picked: "डिलीवरी के लिए तैयार",
  out_for_delivery: "रास्ते में है",
  delivered: "डिलीवर हो गया",
  cancelled: "कैंसिल हो गया",
  return_requested: "रिटर्न रिक्वेस्ट",
  return_approved: "रिटर्न मंज़ूर",
  return_rejected: "रिटर्न नामंज़ूर",
  refunded: "रिफंड हो गया",
};

export const CATEGORIES_SEED = [
  { name: "Paan Corner", name_hi: "पान कॉर्नर", icon: "🥥" },
  { name: "Dairy, Bread & Eggs", name_hi: "डेयरी, ब्रेड और अंडा", icon: "🥛" },
  { name: "Fruits & Vegetables", name_hi: "फल और सब्जी", icon: "🥬" },
  { name: "Cold Drinks & Juices", name_hi: "कोल्ड ड्रिंक्स और जूस", icon: "🥤" },
  { name: "Snacks & Munchies", name_hi: "स्नैक्स", icon: "🍿" },
  { name: "Breakfast & Instant Food", name_hi: "ब्रेकफास्ट और इंस्टेंट फूड", icon: "🍜" },
  { name: "Sweet Tooth", name_hi: "मीठा", icon: "🍫" },
  { name: "Bakery & Biscuits", name_hi: "बेकरी और बिस्किट", icon: "🍪" },
  { name: "Tea, Coffee & Health Drink", name_hi: "चाय, कॉफी और हेल्थ ड्रिंक", icon: "☕" },
  { name: "Atta, Rice & Dal", name_hi: "आटा, चावल और दाल", icon: "🌾" },
  { name: "Masala, Oil & More", name_hi: "मसाले, तेल और बहुत कुछ", icon: "🌶️" },
  { name: "Sauces & Spreads", name_hi: "सॉस और स्प्रेड", icon: "🍯" },
  { name: "Chicken, Meat & Fish", name_hi: "चिकन, मांस और मछली", icon: "🍗" },
  { name: "Organic & Healthy Living", name_hi: "ऑर्गेनिक", icon: "🥗" },
  { name: "Baby Care", name_hi: "बेबी केयर", icon: "🍼" },
  { name: "Pharma & Wellness", name_hi: "दवाई और स्वास्थ्य", icon: "💊" },
  { name: "Cleaning Essentials", name_hi: "सफाई", icon: "🧹" },
  { name: "Home & Office", name_hi: "घर और ऑफिस", icon: "🪔" },
  { name: "Personal Care", name_hi: "पर्सनल केयर", icon: "🧴" },
  { name: "Pet Care", name_hi: "पेट केयर", icon: "🐶" },
];
