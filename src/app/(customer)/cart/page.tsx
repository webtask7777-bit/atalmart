"use client";

import Link from "next/link";
import Image from "next/image";
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { useCouponStore } from "@/lib/store/coupon";
import { Button } from "@/components/ui/button";
import { CouponInput } from "@/components/customer/coupon-input";
import { calculateCouponDiscount } from "@/lib/constants";
import { useSettings } from "@/lib/store/settings";

export default function CartPage() {
  const { items, updateQuantity, removeItem, clearCart, getTotal } = useCartStore();
  const couponApplied = useCouponStore((s) => s.applied);
  const { deliveryFee: DELIVERY_FEE, freeDeliveryAbove: FREE_DELIVERY_ABOVE } = useSettings();

  const subtotal = getTotal();
  const couponDiscount = calculateCouponDiscount(couponApplied, subtotal);
  const subtotalAfterCoupon = Math.max(0, subtotal - couponDiscount);
  const deliveryFee = subtotalAfterCoupon >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const total = subtotalAfterCoupon + deliveryFee;
  const mrpSavings = items.reduce(
    (sum, i) => sum + (i.product.mrp - i.product.price) * i.quantity,
    0,
  );
  const totalSavings = mrpSavings + couponDiscount + (DELIVERY_FEE - deliveryFee);

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

      {/* Items */}
      <div className="space-y-3 mb-6">
        {items.map(({ product, quantity, variant }) => {
          const unitPrice = variant?.price ?? product.price;
          const unitMrp = variant?.mrp ?? product.mrp;
          const stock = variant?.stock ?? product.stock;
          const unitLabel = variant?.unit ?? product.unit;
          const variantId = variant?.id ?? null;
          const limitReached = quantity >= stock;
          return (
            <div
              key={`${product.id}::${variantId ?? "default"}`}
              className="flex items-center gap-4 bg-white rounded-2xl p-4 border border-gray-100"
            >
              <div className="w-14 h-14 bg-gray-50 rounded-xl overflow-hidden shrink-0 relative">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    sizes="56px"
                    className="object-contain p-1"
                  />
                ) : (
                  <span className="flex items-center justify-center text-2xl h-full">
                    📦
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-brown truncate">
                  {product.name}
                  {variant && <span className="text-saffron font-semibold"> · {variant.unit}</span>}
                </h3>
                {!variant && <p className="text-xs text-gray-500">{unitLabel}</p>}
                <p className="text-sm font-bold text-brown mt-0.5">
                  ₹{unitPrice * quantity}
                  {unitMrp > unitPrice && (
                    <span className="text-xs text-gray-400 line-through ml-2 font-normal">
                      ₹{unitMrp * quantity}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-indian-green rounded-lg overflow-hidden">
                  <button
                    onClick={() =>
                      quantity === 1
                        ? removeItem(product.id, variantId)
                        : updateQuantity(product.id, quantity - 1, variantId)
                    }
                    className="p-1.5 text-white hover:bg-green-700 transition-colors"
                  >
                    <Minus size={14} strokeWidth={3} />
                  </button>
                  <span className="text-sm font-bold text-white min-w-[20px] text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() =>
                      !limitReached && updateQuantity(product.id, quantity + 1, variantId)
                    }
                    disabled={limitReached}
                    className="p-1.5 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
                <button
                  onClick={() => removeItem(product.id, variantId)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="remove"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Coupon */}
      <div className="mb-6">
        <CouponInput />
      </div>

      {/* Bill */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
        <h3 className="font-bold text-brown mb-3">Bill Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Item Total</span>
            <span>₹{subtotal}</span>
          </div>
          {couponDiscount > 0 && couponApplied && (
            <div className="flex justify-between text-indian-green">
              <span>Coupon ({couponApplied.code})</span>
              <span>− ₹{couponDiscount}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Delivery Fee</span>
            {deliveryFee === 0 ? (
              <span className="text-indian-green font-medium">FREE</span>
            ) : (
              <span>₹{deliveryFee}</span>
            )}
          </div>
          {deliveryFee > 0 && (
            <p className="text-xs text-saffron">
              Add ₹{FREE_DELIVERY_ABOVE - subtotalAfterCoupon} more for free delivery
            </p>
          )}
          <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-brown text-base">
            <span>Grand Total</span>
            <span>₹{total}</span>
          </div>
          {totalSavings > 0 && (
            <div className="mt-2 -mx-2 px-3 py-1.5 bg-green-light rounded-lg text-center text-xs font-bold text-indian-green">
              🎉 You saved ₹{totalSavings} on this order
            </div>
          )}
        </div>
      </div>

      {/* Checkout */}
      <Link href="/checkout" className="block">
        <Button size="lg" className="w-full">
          <ShoppingBag size={18} />
          Proceed to Checkout — ₹{total}
        </Button>
      </Link>
    </div>
  );
}
