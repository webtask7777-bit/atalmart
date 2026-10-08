/**
 * Server-side order pricing — the single source of truth for what a customer
 * actually owes. The client checkout UI shows a preview, but the server
 * recomputes everything from canonical product prices + coupon rules +
 * wallet balance before persisting the order.
 *
 * Why this matters: previously, the browser sent `total` directly to the DB
 * insert. A user could POST `total: 1` for a ₹5000 cart and the server would
 * accept it. Now the server ignores the client's totals entirely.
 */

import { calculateCouponDiscount, validateCoupon, type Coupon } from "@/lib/constants";
import { assertRupees, toRupees } from "@/lib/money";
import { sellableName } from "@/lib/product-name";

export interface CartLine {
  product_id: string;
  quantity: number;
  /** Optional pack-size variant. When set, deps.getVariant is consulted
   *  for price + stock instead of the parent product. */
  variant_id?: string | null;
}

export interface PricedLine {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  variant_id?: string | null;
  variant_unit?: string | null;
}

export interface PricingInput {
  lines: CartLine[];
  couponCode?: string;
  walletApplied?: number;
  pincode?: string;
}

export interface PricingResult {
  ok: true;
  lines: PricedLine[];
  subtotal: number;
  couponCode: string | null;
  couponDiscount: number;
  deliveryFee: number;
  walletApplied: number;
  total: number;
}

export interface PricingError {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
}

/** What the server needs from outside: products + coupons + wallet + history. */
export interface PricingDeps {
  /** Look up product by ID. Returns null when missing. */
  getProduct: (id: string) => Promise<{
    id: string;
    name: string;
    price: number;
    stock: number;
    active: boolean;
  } | null>;
  /** Look up a product variant by ID. Returns null when missing. Optional —
   *  routes that don't expose variants can omit this; pricing falls back to
   *  the parent product. */
  getVariant?: (variantId: string) => Promise<{
    id: string;
    product_id: string;
    unit: string;
    price: number;
    stock: number;
  } | null>;
  /** Look up coupon by code. */
  getCoupon: (code: string) => Promise<Coupon | null>;
  /** How many orders has this user placed? (for firstOrderOnly check) */
  getUserOrderCount: (userId: string) => Promise<number>;
  /** Times THIS user has used THIS coupon. */
  getUserCouponUsage: (userId: string, code: string) => Promise<number>;
  /** Current wallet balance for this user. */
  getWalletBalance: (userId: string) => Promise<number>;
  /** Delivery fee + free-above rules from settings. `minOrder` is the
   *  merchandise minimum (0 / undefined = none). */
  getDeliveryRules: () => Promise<{ fee: number; freeAbove: number; minOrder?: number }>;
}

export async function priceOrder(
  input: PricingInput,
  userId: string,
  deps: PricingDeps,
): Promise<PricingResult | PricingError> {
  if (!input.lines || input.lines.length === 0) {
    return { ok: false, status: 400, error: "Cart is empty" };
  }

  // ── Resolve each line at canonical price + check stock ──
  const lines: PricedLine[] = [];
  let subtotal = 0;
  for (const cartLine of input.lines) {
    if (!cartLine.product_id || cartLine.quantity <= 0) {
      return {
        ok: false,
        status: 400,
        error: `Invalid line item`,
      };
    }
    const product = await deps.getProduct(cartLine.product_id);
    if (!product) {
      return {
        ok: false,
        status: 404,
        error: `Product ${cartLine.product_id} not found`,
      };
    }
    if (!product.active) {
      return {
        ok: false,
        status: 409,
        error: `${product.name} is no longer available`,
      };
    }

    // If the cart line specifies a variant, source price/stock from the variant
    // instead of the parent product. Validates that the variant belongs to the
    // claimed product so a malicious client can't swap a variant_id from a
    // different (cheaper) product to its own line.
    let effectivePrice = product.price;
    let effectiveStock = product.stock;
    let effectiveName = product.name;
    let variantUnit: string | null = null;
    if (cartLine.variant_id) {
      if (!deps.getVariant) {
        return {
          ok: false,
          status: 400,
          error: `Variants not supported in this environment`,
        };
      }
      const variant = await deps.getVariant(cartLine.variant_id);
      if (!variant) {
        return {
          ok: false,
          status: 404,
          error: `Variant ${cartLine.variant_id} not found`,
        };
      }
      if (variant.product_id !== product.id) {
        return {
          ok: false,
          status: 400,
          error: `Variant ${cartLine.variant_id} does not belong to product ${product.id}`,
        };
      }
      effectivePrice = variant.price;
      effectiveStock = variant.stock;
      // Size-free family + selected pack: the catalogue name may already end
      // in a (different) size — "Amul Taaza Milk (500 ml)" + 1 L variant must
      // become "Amul Taaza Milk (1 L)", not "… (500 ml) (1 L)".
      effectiveName = sellableName(product.name, variant.unit);
      variantUnit = variant.unit;
    }

    if (effectiveStock < cartLine.quantity) {
      return {
        ok: false,
        status: 409,
        error: `${effectiveName}: only ${effectiveStock} in stock (you asked for ${cartLine.quantity})`,
      };
    }
    // Defensive integer-rupee check
    const unitPrice = assertRupees(effectivePrice, `${effectiveName} price`);
    const lineTotal = assertRupees(
      unitPrice * cartLine.quantity,
      `${effectiveName} line total`,
    );
    lines.push({
      product_id: product.id,
      product_name: effectiveName,
      unit_price: unitPrice,
      quantity: cartLine.quantity,
      variant_id: cartLine.variant_id ?? null,
      variant_unit: variantUnit,
      line_total: lineTotal,
    });
    subtotal += lineTotal;
  }

  // ── Delivery / minimum-order rules (settings singleton) ──
  // toRupees() guards against any decimal drift from settings rows.
  const rules = await deps.getDeliveryRules();
  const { fee: rawFee, freeAbove } = rules;

  // ── Minimum order: merchandise subtotal only, before coupons ──
  // The FAQ has advertised a ₹49 minimum since launch prep but nothing
  // enforced it. Delivery fees never count towards it. (Basis to confirm
  // with the merchant: before vs after coupon — see the launch-polish doc.)
  const minOrder = toRupees(rules.minOrder ?? 0);
  if (minOrder > 0 && subtotal < minOrder) {
    return {
      ok: false,
      status: 400,
      error: `Minimum order ₹${minOrder} hai — ₹${minOrder - subtotal} ka saamaan aur add karein`,
    };
  }

  // ── Apply coupon (if any) via server-side validateCoupon ──
  let couponDiscount = 0;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const coupon = await deps.getCoupon(input.couponCode);
    if (!coupon) {
      return {
        ok: false,
        status: 400,
        error: `Coupon ${input.couponCode} not found`,
      };
    }
    const userOrderCount = await deps.getUserOrderCount(userId);
    const userCouponUsage = await deps.getUserCouponUsage(
      userId,
      input.couponCode,
    );
    const check = validateCoupon(coupon, {
      subtotal,
      userOrderCount,
      userCouponUsage,
      pincode: input.pincode,
    });
    if (!check.valid) {
      return {
        ok: false,
        status: 400,
        error: `Coupon ${coupon.code}: ${check.reason}`,
      };
    }
    couponDiscount = calculateCouponDiscount(coupon, subtotal);
    couponCode = coupon.code;
  }

  // ── Delivery fee (free-delivery threshold is inclusive, after coupon) ──
  const subtotalAfterCoupon = Math.max(0, subtotal - couponDiscount);
  const deliveryFee = subtotalAfterCoupon >= freeAbove ? 0 : toRupees(rawFee);
  const beforeWallet = subtotalAfterCoupon + deliveryFee;

  // ── Wallet apply (capped at balance AND at order total) ──
  let walletApplied = 0;
  if (input.walletApplied && input.walletApplied > 0) {
    const balance = await deps.getWalletBalance(userId);
    walletApplied = Math.min(
      balance,
      toRupees(input.walletApplied),
      beforeWallet,
    );
  }

  const total = Math.max(0, beforeWallet - walletApplied);

  // Final invariant: every money field returned must be an integer rupee.
  // If any of these throw, we have a math bug in this function and the
  // client should NOT be allowed to act on the pricing.
  return {
    ok: true,
    lines,
    subtotal: assertRupees(subtotal, "subtotal"),
    couponCode,
    couponDiscount: assertRupees(couponDiscount, "couponDiscount"),
    deliveryFee: assertRupees(deliveryFee, "deliveryFee"),
    walletApplied: assertRupees(walletApplied, "walletApplied"),
    total: assertRupees(total, "total"),
  };
}
