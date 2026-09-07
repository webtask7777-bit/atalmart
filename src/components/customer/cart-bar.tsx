"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, ArrowRight } from "lucide-react";
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
    // One compact row (Blinkit/Zepto style): thin free-delivery progress line
    // on top, "n items · ₹total" + hint on the left, "View cart" on the right.
    // Sits flush above the mobile bottom nav; ~55px instead of the old ~125px.
    <div className="fixed bottom-12 md:bottom-0 left-0 right-0 z-40 px-3 pb-2 md:p-4 pointer-events-none">
      <Link
        href="/cart"
        className="block max-w-lg mx-auto pointer-events-auto bg-saffron text-white rounded-xl shadow-lg overflow-hidden hover:bg-saffron-dark transition-colors"
      >
        <div className="h-[3px] bg-white/25" aria-hidden="true">
          <div
            className="h-full bg-white transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <ShoppingBag size={20} />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white text-saffron text-[9px] font-bold rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            </div>
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-bold">
                {itemCount} item{itemCount > 1 ? "s" : ""} · ₹{total}
              </div>
              <div className="text-[11px] opacity-90 truncate">
                {isFree ? (
                  <>FREE delivery unlocked 🎉</>
                ) : (
                  <>
                    Add ₹{remaining} more for <b>FREE delivery</b>
                  </>
                )}
              </div>
            </div>
          </div>
          <span className="flex items-center gap-1 text-sm font-bold shrink-0">
            View cart <ArrowRight size={16} />
          </span>
        </div>
      </Link>
    </div>
  );
}
