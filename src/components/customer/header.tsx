"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, ShoppingCart, User, Search, ChevronDown } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { useAuth } from "@/lib/hooks/use-auth";
import { PINCODE_AREA_LABELS, isServiceablePincode } from "@/lib/constants";
import { Logo } from "@/components/ui/logo";
import { BusyStrip } from "@/components/customer/store-status-board";
import {
  useUserPincodeStore,
  useUserPincodeHydrated,
} from "@/lib/store/user-pincode";
import { useSettings } from "@/lib/store/settings";
import {
  DELIVERY_ETA_ENABLED,
  etaForArea,
  formatEta,
} from "@/lib/delivery-zones";

interface HeaderProps {
  onSearch?: (query: string) => void;
}

// Rotating search hints — the placeholder cycles so first-time visitors see
// what they can type without a "trending" panel.
const SEARCH_HINTS = ['Search "milk"', 'Search "atta"', 'Search "Maggi"', 'Search "eggs"', 'Search "oil"', 'Search "chips"'];

/** Search box whose placeholder rotates. Owning the timer here keeps the
 *  2.6 s tick from re-rendering the whole Header; it pauses in hidden tabs. */
function SearchInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const [hintIdx, setHintIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setHintIdx((i) => (i + 1) % SEARCH_HINTS.length);
    }, 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <input
      type="text"
      placeholder={SEARCH_HINTS[hintIdx]}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}

export function Header({ onSearch }: HeaderProps) {
  const itemCount = useCartStore((s) => s.getItemCount());
  const { user, profile } = useAuth();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const hydrated = useUserPincodeHydrated();
  const userPincode = useUserPincodeStore((s) => s.pincode);
  const userArea = useUserPincodeStore((s) => s.area);
  const clearPincode = useUserPincodeStore((s) => s.clearPincode);
  const settings = useSettings();

  const pincodeLabel = (() => {
    if (!hydrated) return "Atal Nagar";
    if (!userPincode) return "Tap to set";
    // Precise sector from a location lookup wins over the generic pincode
    // label (all of 21–29 share 492101, so the generic label is a range).
    // Show just the sector — drop the ", Atal Nagar" suffix (covers values
    // already saved with it in localStorage).
    const area = userArea?.replace(/,\s*Atal Nagar\s*$/i, "") || null;
    return area || PINCODE_AREA_LABELS[userPincode] || userPincode;
  })();
  const pincodeOk =
    hydrated && userPincode
      ? isServiceablePincode(userPincode, settings.serviceablePincodes)
      : true;
  // Zone delivery-time estimate — only once a precise serviceable sector is set.
  const deliveryEta =
    DELIVERY_ETA_ENABLED && hydrated && pincodeOk ? etaForArea(userArea) : null;

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    onSearch?.(val);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/?search=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  // Publish the rendered header height so sticky elements below it (the
  // home category strip) pin exactly under it on every breakpoint, with or
  // without the busy strip — a fixed `top-16` was wrong on phones.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <BusyStrip />
      <div className="max-w-7xl mx-auto px-3 md:px-4">
        <div className="flex items-center gap-2 md:gap-6 h-12 md:h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="leading-tight text-center">
              <Logo className="text-xl md:text-2xl" />
              <p className="block text-[9px] md:text-[10px] text-gray-500 -mt-0.5 md:-mt-1 leading-none">
                Quick Delivery Services
              </p>
            </div>
          </Link>

          {/* Location pill — click to change pincode */}
          <button
            onClick={() => clearPincode()}
            title="Change delivery pincode"
            className="hidden md:flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg hover:bg-gray-50 transition-colors shrink-0 group"
          >
            <MapPin
              size={16}
              className={`${pincodeOk ? "text-saffron" : "text-red-500"} shrink-0`}
            />
            <div className="text-left leading-tight">
              <p className="text-[10px] text-gray-500 font-medium">DELIVER TO</p>
              <p className="text-[13px] font-semibold text-brown truncate max-w-[160px]">
                {pincodeLabel}
                {userPincode && !deliveryEta && (
                  <span className="ml-1 font-mono text-[10px] text-gray-500">
                    · {userPincode}
                  </span>
                )}
              </p>
              {deliveryEta && (
                <p className="text-[11px] font-semibold text-indian-green leading-none -mt-0.5">
                  {formatEta(deliveryEta)}
                </p>
              )}
            </div>
            <ChevronDown size={14} className="text-gray-500 group-hover:text-saffron transition-colors" />
          </button>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-2xl">
            <div className="relative w-full">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <SearchInput value={searchInput} onChange={handleSearchChange} className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-[14px] placeholder:text-gray-500 focus:outline-none focus:border-saffron focus:bg-white transition-colors" />
            </div>
          </form>

          {/* Right actions */}
          <div className="flex items-center gap-1 ml-auto">
            {/* Mobile: inline location chip */}
            <button
              onClick={() => clearPincode()}
              className="md:hidden flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50 text-left max-w-[140px]"
              title="Change delivery pincode"
            >
              <MapPin
                size={12}
                className={`${pincodeOk ? "text-saffron" : "text-red-500"} shrink-0`}
              />
              <span className="min-w-0 leading-tight">
                {deliveryEta ? (
                  <>
                    <span className="block text-[12px] font-extrabold text-indian-green leading-none">
                      ⚡ {formatEta(deliveryEta)}
                    </span>
                    <span className="block text-[10px] font-medium text-gray-600 truncate mt-0.5">
                      {pincodeLabel}
                    </span>
                  </>
                ) : (
                  <span className="block text-[11px] font-semibold text-brown truncate">
                    {pincodeLabel}
                  </span>
                )}
              </span>
              <ChevronDown size={10} className="text-gray-500 shrink-0" />
            </button>
            <Link
              href="/auth"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {user ? (
                <div className="w-6 h-6 bg-saffron rounded-full flex items-center justify-center">
                  <span className="text-white text-[11px] font-bold">
                    {(profile?.name || "U").charAt(0).toUpperCase()}
                  </span>
                </div>
              ) : (
                <User size={18} className="text-brown-light" />
              )}
              <span className="text-[13px] font-medium text-brown">
                {user ? (profile?.name?.split(" ")[0] || "Account") : "Login"}
              </span>
            </Link>
            <Link
              href="/cart"
              className="relative flex items-center gap-2 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg bg-indian-green text-white hover:bg-green-700 transition-colors"
              aria-label="Cart"
            >
              <ShoppingCart size={16} />
              <span className="text-[13px] font-semibold hidden sm:inline">
                {itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "My Cart"}
              </span>
              {itemCount > 0 && (
                <span className="sm:hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-white text-indian-green text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-indian-green">
                  {itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile: slim search row */}
        <div className="md:hidden pb-1.5">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <SearchInput value={searchInput} onChange={handleSearchChange} className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[12px] placeholder:text-gray-500 focus:outline-none focus:border-saffron focus:bg-white transition-colors" />
            </div>
          </form>
        </div>
      </div>
    </header>
  );
}
