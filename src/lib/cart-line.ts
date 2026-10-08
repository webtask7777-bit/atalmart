/**
 * One normalized view of a sellable cart line.
 *
 * Before this module every surface resolved "what did the customer pick"
 * on its own: the cart used variant price but product MRP for savings, the
 * checkout summary used product name + product price (ignoring the variant
 * entirely) while its subtotal used the variant — so a 1 L ₹59 line showed
 * as "Amul Taaza Milk (500 ml) ₹28" above a ₹59 subtotal. PDP, card, cart,
 * cart bar, checkout and the demo order writer now all go through
 * resolveLine(), and totals through summarizeLines() / computeQuote().
 *
 * Money is integer rupees (see src/lib/money.ts); each unit value is rounded
 * once at resolution so no floating arithmetic reaches a total.
 */

import type { CartItem, Product, ProductVariant } from "@/types";
import { familyName, sellableName } from "@/lib/product-name";

export interface ResolvedLine {
  /** Cart identity — product id, plus variant id when a pack was chosen. */
  key: string;
  productId: string;
  variantId: string | null;
  /** Size-free name ("Amul Taaza Milk"). */
  familyName: string;
  /** Selected pack ("1 L"). Product unit when the line has no variant. */
  packLabel: string;
  /** "Amul Taaza Milk (1 L)" — the label every surface renders. */
  displayName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  unitMrp: number;
  stock: number;
  lineTotal: number;
  lineMrp: number;
  /** quantity × max(0, MRP − price) for the selected pack only. */
  lineSavings: number;
  /** False when the catalogue no longer sells this line (inactive / 0 stock). */
  available: boolean;
}

export function cartKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}::${variantId}` : productId;
}

/** The pack a card represents when a product has variants: the one flagged
 *  default, else the lowest sort_order. Null for single-pack products. */
export function defaultVariant(product: Pick<Product, "variants">): ProductVariant | null {
  const vs = product.variants ?? [];
  if (vs.length === 0) return null;
  return vs.find((v) => v.is_default) ?? [...vs].sort((a, b) => a.sort_order - b.sort_order)[0];
}

const rupees = (n: number | null | undefined): number => Math.max(0, Math.round(Number(n) || 0));

export function resolveLine(item: CartItem): ResolvedLine {
  const { product, variant, quantity } = item;
  const unitPrice = rupees(variant ? variant.price : product.price);
  const unitMrp = Math.max(unitPrice, rupees(variant ? variant.mrp : product.mrp));
  const stock = Math.max(0, Math.floor(Number(variant ? variant.stock : product.stock) || 0));
  const qty = Math.max(0, Math.floor(quantity));
  const packLabel = (variant ? variant.unit : product.unit) ?? "";
  // A product without variants keeps its catalogue name verbatim: the
  // bracketed size in "Amul Taaza Milk (1 L)" IS the pack for that row.
  const displayName = variant ? sellableName(product.name, packLabel) : product.name;
  return {
    key: cartKey(product.id, variant?.id),
    productId: product.id,
    variantId: variant?.id ?? null,
    familyName: familyName(product.name),
    packLabel,
    displayName,
    imageUrl: variant?.image_url ?? product.image_url ?? null,
    quantity: qty,
    unitPrice,
    unitMrp,
    stock,
    lineTotal: unitPrice * qty,
    lineMrp: unitMrp * qty,
    lineSavings: Math.max(0, unitMrp - unitPrice) * qty,
    available: product.active !== false && stock > 0,
  };
}

export function resolveLines(items: CartItem[]): ResolvedLine[] {
  return items.map(resolveLine);
}

export interface LineSummary {
  subtotal: number;
  mrpTotal: number;
  merchandiseSavings: number;
  itemCount: number;
}

export function summarizeLines(lines: ResolvedLine[]): LineSummary {
  let subtotal = 0;
  let mrpTotal = 0;
  let merchandiseSavings = 0;
  let itemCount = 0;
  for (const l of lines) {
    subtotal += l.lineTotal;
    mrpTotal += l.lineMrp;
    merchandiseSavings += l.lineSavings;
    itemCount += l.quantity;
  }
  return { subtotal, mrpTotal, merchandiseSavings, itemCount };
}

export interface QuoteInput {
  subtotal: number;
  /** Already computed from the coupon rules (calculateCouponDiscount). */
  couponDiscount: number;
  deliveryFee: number;
  /** Inclusive threshold: an eligible subtotal equal to this ships free. */
  freeDeliveryAbove: number;
  /** Merchandise minimum (settings.minOrderAmount). 0 = none. */
  minOrderAmount?: number;
  walletBalance?: number;
  useWallet?: boolean;
}

export interface Quote {
  subtotal: number;
  couponDiscount: number;
  subtotalAfterCoupon: number;
  deliveryFee: number;
  /** The fee waived by the free-delivery rule (0 when the fee applies). */
  deliveryWaived: number;
  /** Eligible merchandise still needed for free delivery (0 when unlocked). */
  freeDeliveryGap: number;
  walletApplied: number;
  total: number;
  /** Merchandise still needed to reach the minimum order (0 when met). */
  minOrderGap: number;
}

/**
 * Client-side mirror of the server's priceOrder() arithmetic. The server is
 * the authority at quote and order time; this only keeps the preview honest.
 *
 * Basis (confirm with the merchant — see docs/launch-polish-2026-10-08.md):
 *   • Free delivery: subtotal AFTER coupon ≥ freeDeliveryAbove (inclusive).
 *   • Minimum order: merchandise subtotal BEFORE coupon; delivery never counts.
 */
export function computeQuote(input: QuoteInput): Quote {
  const subtotal = rupees(input.subtotal);
  const couponDiscount = Math.min(subtotal, rupees(input.couponDiscount));
  const subtotalAfterCoupon = subtotal - couponDiscount;
  const fee = rupees(input.deliveryFee);
  const freeAbove = rupees(input.freeDeliveryAbove);
  const deliveryFee = subtotal > 0 && subtotalAfterCoupon >= freeAbove ? 0 : fee;
  const beforeWallet = subtotalAfterCoupon + deliveryFee;
  const walletApplied =
    input.useWallet && (input.walletBalance ?? 0) > 0
      ? Math.min(rupees(input.walletBalance), beforeWallet)
      : 0;
  const minOrder = rupees(input.minOrderAmount);
  return {
    subtotal,
    couponDiscount,
    subtotalAfterCoupon,
    deliveryFee,
    deliveryWaived: fee - deliveryFee,
    freeDeliveryGap: deliveryFee === 0 ? 0 : Math.max(0, freeAbove - subtotalAfterCoupon),
    walletApplied,
    total: Math.max(0, beforeWallet - walletApplied),
    minOrderGap: Math.max(0, minOrder - subtotal),
  };
}
