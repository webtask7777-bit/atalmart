"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPin, ShoppingCart, User, Search, ChevronDown, X } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { useAuth } from "@/lib/hooks/use-auth";
import { PINCODE_AREA_LABELS } from "@/lib/constants";
import { Logo } from "@/components/ui/logo";
import { BusyStrip } from "@/components/customer/store-status-board";
import {
  useUserPincodeStore,
  useUserPincodeHydrated,
} from "@/lib/store/user-pincode";
import { useStoreAvailability } from "@/lib/hooks/use-availability";
import {
  DELIVERY_ETA_ENABLED,
  etaForArea,
  formatEta,
} from "@/lib/delivery-zones";

// Rotating search hints — the placeholder cycles so first-time visitors see
// what they can type without a "trending" panel.
const SEARCH_HINTS = ['Search "milk"', 'Search "atta"', 'Search "Maggi"', 'Search "eggs"', 'Search "oil"', 'Search "chips"'];

/** Search box whose placeholder rotates. Owning the timer here keeps the
 *  2.6 s tick from re-rendering the whole Header; it pauses in hidden tabs. */
function SearchInput({
  value,
  onChange,
  onClear,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
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
    <>
      <input
        type="search"
        name="search"
        aria-label="Search products"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={SEARCH_HINTS[hintIdx]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-500 hover:text-brown hover:bg-gray-100"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </>
  );
}

/**
 * Keeps the header's search box equal to the URL's ?search= on the home
 * route. The shortcut chips, the "Clear" link, the Home/logo link and the
 * browser Back button all change the URL without touching this input, so
 * before this sync the box could show "दूध" over a full homepage, or stay
 * empty while "Results for milk" rendered. `useSearchParams` lives in its
 * own Suspense subtree so the rest of the header still prerenders.
 */
function SearchUrlSync({ onSync }: { onSync: (value: string) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = pathname === "/" ? searchParams.get("search") ?? "" : "";
  useEffect(() => {
    onSync(urlSearch);
  }, [urlSearch, onSync]);
  return null;
}

export function Header() {
  const itemCount = useCartStore((s) => s.getItemCount());
  const { user, profile } = useAuth();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const hydrated = useUserPincodeHydrated();
  const userPincode = useUserPincodeStore((s) => s.pincode);
  const userArea = useUserPincodeStore((s) => s.area);
  const clearPincode = useUserPincodeStore((s) => s.clearPincode);
  const availability = useStoreAvailability();

  const pincodeLabel = (() => {
    if (!hydrated) return "Atal Nagar";
    if (!userPincode) return "Pincode set karo";
    // Precise sector from a location lookup wins over the generic pincode
    // label (all of 21–29 share 492101, so the generic label is a range).
    // Show just the sector — drop the ", Atal Nagar" suffix (covers values
    // already saved with it in localStorage).
    const area = userArea?.replace(/,\s*Atal Nagar\s*$/i, "") || null;
    return area || PINCODE_AREA_LABELS[userPincode] || userPincode;
  })();
  const pincodeOk = availability.state !== "unserviceable";
  // Zone delivery-time estimate — only once a precise serviceable sector is
  // set AND the store is actually taking orders. A paused/closed store shows
  // its availability state here instead of a delivery promise (AM-04).
  const deliveryEta =
    DELIVERY_ETA_ENABLED && hydrated && availability.showEta ? etaForArea(userArea) : null;
  // Short status for the chip when no ETA may be shown (paused/closed/unknown).
  const chipStatus: { text: string; tone: "amber" | "red" | "gray" } | null = (() => {
    switch (availability.state) {
      case "capacity_paused":
        return { text: "Orders paused", tone: "amber" };
      case "closed":
        return { text: "Store closed", tone: "amber" };
      case "unserviceable":
        return { text: "Not serviceable", tone: "red" };
      case "unknown":
        return hydrated && userPincode ? { text: "Checking availability…", tone: "gray" } : null;
      default:
        return null;
    }
  })();
  const toneClass = { amber: "text-amber-700", red: "text-red-600", gray: "text-gray-500" };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    // Enter on an empty box clears the current search (same as "Clear").
    router.push(q ? `/?search=${encodeURIComponent(q)}` : "/");
  };
  const clearSearch = () => {
    setSearchInput("");
    router.push("/");
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

  const locationButtonLabel = `Delivery location: ${pincodeLabel}${chipStatus ? ` — ${chipStatus.text}` : deliveryEta ? ` — ${formatEta(deliveryEta)}` : ""}. Change pincode`;

  return (
    <header ref={headerRef} className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <Suspense fallback={null}>
        <SearchUrlSync onSync={setSearchInput} />
      </Suspense>
      <BusyStrip />
      <div className="max-w-7xl mx-auto px-3 md:px-4">
        <div className="flex items-center gap-2 md:gap-6 h-12 md:h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="Atalmart home">
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
            aria-label={locationButtonLabel}
            className="hidden md:flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg hover:bg-gray-50 transition-colors shrink-0 group"
          >
            <MapPin
              size={16}
              className={`${pincodeOk ? "text-saffron" : "text-red-500"} shrink-0`}
              aria-hidden="true"
            />
            <div className="text-left leading-tight">
              <p className="text-[10px] text-gray-500 font-medium">DELIVER TO</p>
              <p className="text-[13px] font-semibold text-brown truncate max-w-[160px]">
                {pincodeLabel}
                {userPincode && !deliveryEta && !chipStatus && (
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
              {chipStatus && (
                <p className={`text-[11px] font-semibold leading-none -mt-0.5 ${toneClass[chipStatus.tone]}`}>
                  {chipStatus.text}
                </p>
              )}
            </div>
            <ChevronDown size={14} className="text-gray-500 group-hover:text-saffron transition-colors" aria-hidden="true" />
          </button>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} role="search" className="hidden md:flex flex-1 max-w-2xl">
            <div className="relative w-full">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
                aria-hidden="true"
              />
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                onClear={clearSearch}
                className="w-full pl-11 pr-10 py-3 rounded-xl border border-gray-200 bg-gray-50 text-[14px] placeholder:text-gray-500 focus:outline-none focus:border-saffron focus:bg-white transition-colors"
              />
            </div>
          </form>

          {/* Right actions */}
          <div className="flex items-center gap-1 ml-auto">
            {/* Mobile: inline location chip */}
            <button
              onClick={() => clearPincode()}
              className="md:hidden flex items-center gap-1 px-2 py-1 min-h-[36px] rounded-lg hover:bg-gray-50 text-left max-w-[150px]"
              title="Change delivery pincode"
              aria-label={locationButtonLabel}
            >
              <MapPin
                size={12}
                className={`${pincodeOk ? "text-saffron" : "text-red-500"} shrink-0`}
                aria-hidden="true"
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
                ) : chipStatus ? (
                  <>
                    <span className={`block text-[11px] font-bold leading-none ${toneClass[chipStatus.tone]}`}>
                      {chipStatus.text}
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
              <ChevronDown size={10} className="text-gray-500 shrink-0" aria-hidden="true" />
            </button>
            <Link
              href="/auth"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {user ? (
                <div className="w-6 h-6 bg-saffron rounded-full flex items-center justify-center" aria-hidden="true">
                  <span className="text-white text-[11px] font-bold">
                    {(profile?.name || "U").charAt(0).toUpperCase()}
                  </span>
                </div>
              ) : (
                <User size={18} className="text-brown-light" aria-hidden="true" />
              )}
              <span className="text-[13px] font-medium text-brown">
                {user ? (profile?.name?.split(" ")[0] || "Account") : "Login"}
              </span>
            </Link>
            <Link
              href="/cart"
              className="relative flex items-center gap-2 px-2.5 md:px-3 py-1.5 md:py-2 min-h-[36px] rounded-lg bg-indian-green text-white hover:bg-green-700 transition-colors"
              aria-label={itemCount > 0 ? `Cart, ${itemCount} item${itemCount > 1 ? "s" : ""}` : "Cart, empty"}
            >
              <ShoppingCart size={16} aria-hidden="true" />
              <span className="text-[13px] font-semibold hidden sm:inline">
                {itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "My Cart"}
              </span>
              {itemCount > 0 && (
                <span
                  aria-hidden="true"
                  className="sm:hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-white text-indian-green text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-indian-green"
                >
                  {itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile: slim search row */}
        <div className="md:hidden pb-1.5">
          <form onSubmit={handleSearchSubmit} role="search">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                aria-hidden="true"
              />
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                onClear={clearSearch}
                className="w-full pl-9 pr-9 py-1.5 min-h-[36px] rounded-lg border border-gray-200 bg-gray-50 text-[12px] placeholder:text-gray-500 focus:outline-none focus:border-saffron focus:bg-white transition-colors"
              />
            </div>
          </form>
        </div>
      </div>
    </header>
  );
}
