"use client";

import { useSettings, STORE_STATUS_COPY } from "@/lib/store/settings";
import { Zap, Clock, MapPin } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { Logo } from "@/components/ui/logo";

/**
 * Store-availability board, driven by the admin Store Status toggle
 * (settings.storeStatus, DB-backed so it propagates to all customers live):
 *   • busy         → sticky top banner; browsing allowed, ordering paused.
 *   • opening_soon → full-screen pre-launch board; store blocked.
 *   • open         → nothing.
 *
 * The actual order block lives in createOrder() (authoritative DB check) +
 * the checkout button; this component is the customer-facing signage.
 */
export function StoreStatusBoard() {
  const { storeStatus, storeStatusMessage } = useSettings();

  if (storeStatus === "open") return null;

  const copy = STORE_STATUS_COPY[storeStatus];
  const body = storeStatusMessage.trim() || copy.body;

  if (storeStatus === "busy") {
    return (
      <div className="bg-amber-500 text-white sticky top-0 z-[70] shadow-sm">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center justify-center gap-2 text-center">
          <Zap size={14} className="shrink-0" fill="currentColor" />
          <p className="text-xs sm:text-sm font-semibold leading-tight">
            <span className="font-bold">{copy.title}</span>
            <span className="hidden sm:inline"> — </span>
            <span className="block sm:inline font-medium opacity-95">{body}</span>
          </p>
        </div>
      </div>
    );
  }

  // opening_soon — full-screen pre-launch board
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gradient-to-b from-brown via-brown to-[#2a1d14] text-cream px-6 text-center">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-saffron/20 border border-saffron/40 text-saffron text-xs font-bold uppercase tracking-wider mb-5">
        <Clock size={12} />
        {copy.title}
      </span>

      <Logo onDark className="text-4xl sm:text-5xl mb-3" />
      <p className="max-w-md text-sm sm:text-base text-cream/80 leading-relaxed mb-6">
        {body}
      </p>

      <div className="flex items-center gap-1.5 text-xs text-cream/60">
        <MapPin size={12} className="text-saffron" />
        <span>Nava Raipur, Chhattisgarh</span>
      </div>

      <p className="absolute bottom-6 text-[11px] text-cream/40">
        © {APP_NAME} — Quick grocery delivery, coming soon
      </p>
    </div>
  );
}
