"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Heart, ShoppingBag, ReceiptIndianRupee, User } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { useWishlistStore } from "@/lib/store/wishlist";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/product") },
  { href: "/wishlist", label: "Wishlist", icon: Heart, match: (p: string) => p.startsWith("/wishlist") },
  { href: "/cart", label: "Cart", icon: ShoppingBag, match: (p: string) => p.startsWith("/cart") },
  { href: "/orders", label: "Orders", icon: ReceiptIndianRupee, match: (p: string) => p.startsWith("/orders") || p.startsWith("/track") },
  { href: "/auth", label: "Account", icon: User, match: (p: string) => p.startsWith("/auth") || p.startsWith("/account") },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const cartCount = useCartStore((s) => s.getItemCount());
  const wishlistCount = useWishlistStore((s) => s.ids.length);

  // Hide on checkout (focused flow) and admin
  if (pathname.startsWith("/checkout") || pathname.startsWith("/admin")) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom,0)]"
      role="navigation"
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around">
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          const showCartBadge = label === "Cart" && cartCount > 0;
          const showWishlistBadge = label === "Wishlist" && wishlistCount > 0;
          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 text-[10px] font-semibold transition-colors ${
                  active ? "text-saffron" : "text-gray-500 active:text-saffron"
                }`}
              >
                <span className="relative">
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                  {showCartBadge && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] bg-indian-green text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-white">
                      {cartCount > 9 ? "9+" : cartCount}
                    </span>
                  )}
                  {showWishlistBadge && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-white">
                      {wishlistCount > 9 ? "9+" : wishlistCount}
                    </span>
                  )}
                </span>
                <span className="leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
