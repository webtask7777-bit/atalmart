"use client";

import { useState } from "react";
import { useSettings, STORE_STATUS_COPY } from "@/lib/store/settings";
import { Zap, Clock, MapPin, ChevronDown } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { Logo } from "@/components/ui/logo";

/**
 * Store-availability board, driven by the admin Store Status toggle
 * (settings.storeStatus, DB-backed so it propagates to all customers live):
 *   • busy         → one-line strip at the top of the sticky header (see
 *                    BusyStrip below); browsing allowed, ordering paused.
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

  // "busy" is rendered by <BusyStrip /> inside the sticky header so the
  // header, strip and category bar share one stacking context.
  if (storeStatus === "busy") return null;

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

/**
 * Compact "orders paused" strip. Lives at the top of the sticky <header> so it
 * never covers the brand row. One line on phones (tap for the full message);
 * title + message on one line from sm up. Dark-on-amber for AA contrast.
 */
export function BusyStrip() {
  const { storeStatus, storeStatusMessage } = useSettings();
  const [open, setOpen] = useState(false);
  if (storeStatus !== "busy") return null;
  const copy = STORE_STATUS_COPY.busy;
  const body = storeStatusMessage.trim() || copy.body;
  return (
    <div className="bg-amber-400 text-amber-950">
      <div className="max-w-7xl mx-auto px-3 md:px-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-left sm:cursor-default"
        >
          <Zap size={13} fill="currentColor" className="shrink-0" />
          <span className="text-[12px] sm:text-sm font-bold leading-none truncate">{copy.title}</span>
          <span className="hidden sm:inline text-sm font-medium leading-none truncate">— {body}</span>
          <ChevronDown
            size={14}
            className={`sm:hidden shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <p className="sm:hidden pb-2 text-[11px] font-medium leading-snug text-center">{body}</p>
        )}
      </div>
    </div>
  );
}
