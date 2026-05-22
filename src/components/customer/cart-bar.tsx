"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, ArrowRight, Truck } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { useSettings } from "@/lib/store/settings";

export function CartBar() {
  const pathname = usePathname();
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.getTotal());
  const itemCount = useCartStore((s) => s.getItemCount());

  const { freeDeliveryAbove } = useSettings();

  if (items.length === 0) return null;
  // Don't show on cart/checkout pages — they have their own summary
  if (pathname.startsWith("/cart") || pathname.startsWith("/checkout")) return null;

  const remaining = Math.max(0, freeDeliveryAbove - total);
  const progress = Math.min(100, (total / freeDeliveryAbove) * 100);
  const isFree = remaining === 0;

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 p-3 md:p-4 pointer-events-none">
      <div className="max-w-lg mx-auto pointer-events-auto">
        {/* Free-delivery progress bar */}
        <div className="bg-white rounded-t-2xl border border-gray-200 border-b-0 px-4 py-2">
          <div className="flex items-center gap-2 text-[11px]">
            <Truck size={12} className={isFree ? "text-indian-green" : "text-saffron"} />
            <span className="text-brown font-medium">
              {isFree ? (
                <span className="text-indian-green">
                  Yay! You unlocked <b>FREE delivery</b> 🎉
                </span>
              ) : (
                <>
                  Add <b>₹{remaining}</b> more for{" "}
                  <span className="text-indian-green font-bold">FREE delivery</span>
                </>
              )}
            </span>
          </div>
          <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${isFree ? "bg-indian-green" : "bg-saffron"} transition-all duration-300`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Cart CTA */}
        <Link
          href="/cart"
          className="flex items-center justify-between bg-saffron text-white rounded-b-2xl px-5 py-3.5 shadow-lg hover:bg-saffron-dark transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingBag size={22} />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white text-saffron text-[9px] font-bold rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            </div>
            <span className="text-sm font-medium">
              {itemCount} item{itemCount > 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">₹{total}</span>
            <ArrowRight size={18} />
          </div>
        </Link>
      </div>
    </div>
  );
}
