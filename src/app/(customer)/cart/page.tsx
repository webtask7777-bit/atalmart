"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { useCouponStore } from "@/lib/store/coupon";
import { Button } from "@/components/ui/button";
import { CouponInput } from "@/components/customer/coupon-input";
import { calculateCouponDiscount } from "@/lib/constants";
import { useSettings } from "@/lib/store/settings";
import { resolveLines, summarizeLines, computeQuote } from "@/lib/cart-line";
import { useStoreAvailability } from "@/lib/hooks/use-availability";

export default function CartPage() {
  const { items, updateQuantity, removeItem, clearCart } = useCartStore();
  const couponApplied = useCouponStore((s) => s.applied);
  const { deliveryFee, freeDeliveryAbove, minOrderAmount } = useSettings();
  const availability = useStoreAvailability();

  // One resolved view of every line (selected pack, price, MRP, label) —
  // the same resolver the checkout, cart bar and order writer use.
  const lines = useMemo(() => resolveLines(items), [items]);
  const summary = useMemo(() => summarizeLines(lines), [lines]);
  const couponDiscount = calculateCouponDiscount(couponApplied, summary.subtotal);
  const quote = computeQuote({
    subtotal: summary.subtotal,
    couponDiscount,
    deliveryFee,
    freeDeliveryAbove,
    minOrderAmount,
  });
  // Merchandise savings (selected-pack MRP − price) and the coupon are the
  // customer's real savings; a waived delivery fee is shown on its own line.
  const totalSavings = summary.merchandiseSavings + quote.couponDiscount;
  const belowMinimum = quote.minOrderGap > 0;

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">🛒</div>
        {/* h1, not h2 — the empty state is the whole page (crawlers land here
            with no cart), so it must carry the page heading. */}
        <h1 className="text-xl font-bold text-brown mb-2">Cart is Empty</h1>
        <p className="text-gray-500 mb-6">
          Add some items to get started with your order
        </p>
        <Link href="/">
          <Button>Start Shopping</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32 md:pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Continue shopping"
            className="p-2 rounded-full hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} className="text-brown" />
          </Link>
          <h1 className="text-xl font-bold text-brown">Your Cart</h1>
        </div>
        <button
          onClick={() => {
            clearCart();
            useCouponStore.getState().clear();
          }}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Clear All
        </button>
      </div>

      {availability.blocked && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900"
        >
          <span className="font-bold">{availability.title}.</span> {availability.body}
        </p>
      )}

      {/* Items */}
      <ul className="space-y-3 mb-6" aria-label="Cart items">
        {lines.map((line) => {
          const limitReached = line.quantity >= line.stock;
          const qtyLabel = `${line.displayName} quantity`;
          return (
            <li
              key={line.key}
              className="flex items-center gap-4 bg-white rounded-2xl p-4 border border-gray-100"
            >
              <div className="w-14 h-14 bg-gray-50 rounded-xl overflow-hidden shrink-0 relative">
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-contain p-1"
                  />
                ) : (
                  <span className="flex items-center justify-center text-2xl h-full" aria-hidden="true">
                    📦
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-brown line-clamp-2 leading-snug">
                  <Link href={`/product/${line.productId}`} className="hover:underline">
                    {line.familyName}
                  </Link>
                </h3>
                <p className="text-xs text-gray-500">
                  {line.packLabel}
                  <span className="text-gray-400"> · ₹{line.unitPrice} each</span>
                </p>
                <p className="text-sm font-bold text-brown mt-0.5">
                  ₹{line.lineTotal}
                  {line.lineMrp > line.lineTotal && (
                    <span className="text-xs text-gray-500 line-through ml-2 font-normal">
                      ₹{line.lineMrp}
                    </span>
                  )}
                </p>
                {!line.available && (
                  <p className="text-[11px] font-semibold text-red-600 mt-0.5">
                    Abhi stock mein nahi — checkout se pehle hata dein
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1 bg-indian-green rounded-lg overflow-hidden"
                  role="group"
                  aria-label={qtyLabel}
                >
                  <button
                    type="button"
                    onClick={() =>
                      line.quantity === 1
                        ? removeItem(line.productId, line.variantId)
                        : updateQuantity(line.productId, line.quantity - 1, line.variantId)
                    }
                    aria-label={`Decrease ${qtyLabel}`}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center text-white hover:bg-green-700 transition-colors"
                  >
                    <Minus size={14} strokeWidth={3} aria-hidden="true" />
                  </button>
                  <span
                    className="text-sm font-bold text-white min-w-[20px] text-center"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      !limitReached &&
                      updateQuantity(line.productId, line.quantity + 1, line.variantId)
                    }
                    disabled={limitReached}
                    aria-label={`Increase ${qtyLabel}`}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <Plus size={14} strokeWidth={3} aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(line.productId, line.variantId)}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors"
                  aria-label={`Remove ${line.displayName} from cart`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Coupon */}
      <div className="mb-6">
        <CouponInput />
      </div>

      {/* Bill */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
        <h3 className="font-bold text-brown mb-3">Bill Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Item Total ({summary.itemCount} item{summary.itemCount === 1 ? "" : "s"})</span>
            <span>
              {summary.mrpTotal > summary.subtotal && (
                <span className="text-gray-400 line-through mr-2">₹{summary.mrpTotal}</span>
              )}
              ₹{quote.subtotal}
            </span>
          </div>
          {summary.merchandiseSavings > 0 && (
            <div className="flex justify-between text-indian-green">
              <span>MRP savings</span>
              <span>− ₹{summary.merchandiseSavings}</span>
            </div>
          )}
          {quote.couponDiscount > 0 && couponApplied && (
            <div className="flex justify-between text-indian-green">
              <span>Coupon ({couponApplied.code})</span>
              <span>− ₹{quote.couponDiscount}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Delivery Fee</span>
            {quote.deliveryFee === 0 ? (
              <span className="text-indian-green font-medium">
                {quote.deliveryWaived > 0 && (
                  <span className="text-gray-400 line-through mr-1 font-normal">₹{quote.deliveryWaived}</span>
                )}
                FREE
              </span>
            ) : (
              <span>₹{quote.deliveryFee}</span>
            )}
          </div>
          {quote.freeDeliveryGap > 0 && (
            <p className="text-xs text-saffron-deep">
              ₹{quote.freeDeliveryGap} ka saamaan aur add karein — delivery free (₹{freeDeliveryAbove}+ par)
            </p>
          )}
          <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-brown text-base">
            <span>Grand Total</span>
            <span>₹{quote.total}</span>
          </div>
          {totalSavings > 0 && (
            <div className="mt-2 -mx-2 px-3 py-1.5 bg-green-light rounded-lg text-center text-xs font-bold text-indian-green">
              🎉 You saved ₹{totalSavings} on this order
            </div>
          )}
        </div>
      </div>

      {belowMinimum && (
        <p role="status" className="mb-3 text-center text-xs font-semibold text-amber-700">
          Minimum order ₹{minOrderAmount} hai — ₹{quote.minOrderGap} ka saamaan aur add karein
        </p>
      )}

      {/* Checkout */}
      {belowMinimum ? (
        <Button size="lg" className="w-full" disabled>
          <ShoppingBag size={18} />
          Add ₹{quote.minOrderGap} more to checkout
        </Button>
      ) : (
        <Link href="/checkout" className="block">
          <Button size="lg" className="w-full">
            <ShoppingBag size={18} />
            Proceed to Checkout — ₹{quote.total}
          </Button>
        </Link>
      )}
    </div>
  );
}
