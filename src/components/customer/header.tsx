"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, ShoppingCart, User, Search, ChevronDown } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { useAuth } from "@/lib/hooks/use-auth";
import { APP_NAME, PINCODE_AREA_LABELS, isServiceablePincode } from "@/lib/constants";
import {
  useUserPincodeStore,
  useUserPincodeHydrated,
} from "@/lib/store/user-pincode";
import { useSettings } from "@/lib/store/settings";

interface HeaderProps {
  onSearch?: (query: string) => void;
}

export function Header({ onSearch }: HeaderProps) {
  const itemCount = useCartStore((s) => s.getItemCount());
  const { user, profile } = useAuth();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const hydrated = useUserPincodeHydrated();
  const userPincode = useUserPincodeStore((s) => s.pincode);
  const clearPincode = useUserPincodeStore((s) => s.clearPincode);
  const settings = useSettings();

  const pincodeLabel = (() => {
    if (!hydrated) return "Sector 21, Atal Nagar";
    if (!userPincode) return "Tap to set";
    return PINCODE_AREA_LABELS[userPincode] || userPincode;
  })();
  const pincodeOk =
    hydrated && userPincode
      ? isServiceablePincode(userPincode, settings.serviceablePincodes)
      : true;

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

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-3 md:gap-6 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 bg-saffron rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg leading-none">A</span>
            </div>
            <div className="hidden sm:block leading-tight">
              <h1 className="text-base font-bold text-brown">
                {APP_NAME}
              </h1>
              <p className="text-[10px] text-gray-500">
                10 min grocery delivery
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
                {userPincode && (
                  <span className="ml-1 font-mono text-[10px] text-gray-400">
                    · {userPincode}
                  </span>
                )}
              </p>
            </div>
            <ChevronDown size={14} className="text-gray-400 group-hover:text-saffron transition-colors" />
          </button>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-2xl">
            <div className="relative w-full">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder='Search "milk", "atta", "Maggi"...'
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-[14px] placeholder:text-gray-400 focus:outline-none focus:border-saffron focus:bg-white transition-colors"
              />
            </div>
          </form>

          {/* Right actions */}
          <div className="flex items-center gap-1 ml-auto">
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
              className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-indian-green text-white hover:bg-green-700 transition-colors"
            >
              <ShoppingCart size={18} />
              <span className="text-[13px] font-semibold hidden sm:inline">
                {itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "My Cart"}
              </span>
              {itemCount > 0 && (
                <span className="sm:hidden absolute -top-1 -right-1 w-5 h-5 bg-white text-indian-green text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-indian-green">
                  {itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile: location + search */}
        <div className="md:hidden pb-3 space-y-2">
          <button
            onClick={() => clearPincode()}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <MapPin
              size={14}
              className={`${pincodeOk ? "text-saffron" : "text-red-500"} shrink-0`}
            />
            <div className="text-left leading-tight flex-1">
              <p className="text-[9px] text-gray-500 font-medium">DELIVER TO</p>
              <p className="text-[12px] font-semibold text-brown truncate">
                {pincodeLabel}
                {userPincode && (
                  <span className="ml-1 font-mono text-[10px] text-gray-400">
                    · {userPincode}
                  </span>
                )}
              </p>
            </div>
            <ChevronDown size={12} className="text-gray-400" />
          </button>
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder='Search "milk", "atta", "Maggi"...'
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-[13px] placeholder:text-gray-400 focus:outline-none focus:border-saffron focus:bg-white transition-colors"
              />
            </div>
          </form>
        </div>
      </div>
    </header>
  );
}
