"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Download, X, Smartphone } from "lucide-react";
import { usePwaStore, type BeforeInstallPromptEvent } from "@/lib/store/pwa";
import { useUserPincodeStore, useUserPincodeHydrated } from "@/lib/store/user-pincode";
import { useCartStore } from "@/lib/store/cart";

const DISMISSED_KEY = "atalmart_pwa_install_dismissed_at";
const VISITS_KEY = "atalmart_visit_count";
const REPROMPT_DAYS = 14;
/** Show the install card from this visit onwards (counted per browser session). */
const MIN_VISITS = 2;

/**
 * Install prompt timing (AM-08):
 *   • never while the first-visit pincode dialog is open — one overlay at a time;
 *   • never on /checkout (it sat over the pay controls on phones);
 *   • only after meaningful engagement: a return visit OR an item in the cart;
 *   • a dismissal is respected for REPROMPT_DAYS.
 * The `beforeinstallprompt` event is still captured immediately (it fires
 * once); the card just waits for the conditions above before appearing.
 */
export function PWAProvider() {
  const setPrompt = usePwaStore((s) => s.setPrompt);
  const setIos = usePwaStore((s) => s.setIos);
  const setStandalone = usePwaStore((s) => s.setStandalone);
  const setInstalled = usePwaStore((s) => s.setInstalled);
  const promptInstall = usePwaStore((s) => s.promptInstall);
  const deferredPrompt = usePwaStore((s) => s.deferredPrompt);
  const isIos = usePwaStore((s) => s.isIos);
  const isStandalone = usePwaStore((s) => s.isStandalone);
  const installed = usePwaStore((s) => s.installed);

  const pathname = usePathname();
  const pincodeHydrated = useUserPincodeHydrated();
  const pincode = useUserPincodeStore((s) => s.pincode);
  const pincodeDismissed = useUserPincodeStore((s) => s.promptDismissed);
  const cartCount = useCartStore((s) => s.getItemCount());

  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  // Visit count (one per browser session) for the engagement gate. Read
  // lazily on the client; the server renders nothing from this component
  // anyway (the pincode store is unhydrated there, so showBanner is false).
  const [visits] = useState(() => countVisit());

  // Register service worker
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Skip in dev to avoid Next.js HMR conflicts
    if (process.env.NODE_ENV !== "production" && !window.location.search.includes("force_sw=1")) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("[PWA] SW registration failed:", err));
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  // Capture the (single-use) install event; detect iOS / standalone.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari does not fire beforeinstallprompt — show hint instead
    const ua = window.navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !/MSStream/.test(ua);
    const standalone =
      ("standalone" in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean }).standalone) ||
      window.matchMedia("(display-mode: standalone)").matches;
    setIos(ios);
    setStandalone(Boolean(standalone));

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [setPrompt, setIos, setStandalone, setInstalled]);

  const handleInstall = useCallback(async () => {
    const outcome = await promptInstall();
    if (outcome === "dismissed") localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissedThisSession(true);
  }, [promptInstall]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissedThisSession(true);
  }, []);

  const iosHint = isIos && !isStandalone;
  const canInstall = !!deferredPrompt || iosHint;
  const pincodeDialogOpen = !pincodeHydrated || (!pincode && !pincodeDismissed);
  const engaged = visits >= MIN_VISITS || cartCount > 0;
  const onCheckout = pathname.startsWith("/checkout") || pathname.startsWith("/admin");
  const showBanner =
    canInstall &&
    !installed &&
    !isStandalone &&
    !dismissedThisSession &&
    !pincodeDialogOpen &&
    !onCheckout &&
    engaged &&
    notRecentlyDismissed();

  if (!showBanner) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Atalmart"
      // Above the cart bar + bottom nav on phones so it never covers a
      // purchase control; bottom-right card on desktop.
      className="fixed inset-x-3 bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm z-[45] animate-in slide-in-from-bottom-5"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-saffron/20 p-4 flex items-start gap-3">
        <div className="shrink-0 w-11 h-11 bg-saffron rounded-xl flex items-center justify-center" aria-hidden="true">
          {iosHint ? (
            <Smartphone size={22} className="text-white" />
          ) : (
            <Download size={22} className="text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-brown leading-tight">
            Install Atalmart
          </p>
          <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">
            {iosHint
              ? "Tap Share → Add to Home Screen"
              : "Faster, offline-ready, app jaisa experience"}
          </p>
          {!iosHint && (
            <button
              onClick={handleInstall}
              className="mt-2 inline-flex items-center gap-1.5 bg-saffron text-white text-[12px] font-bold px-3 py-1.5 min-h-[36px] rounded-lg hover:bg-saffron-dark transition-colors"
            >
              <Download size={12} strokeWidth={3} aria-hidden="true" />
              Install Now
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 p-2 -m-1 text-gray-400 hover:text-brown rounded-lg"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function countVisit(): number {
  if (typeof window === "undefined") return 0;
  try {
    const counted = sessionStorage.getItem(VISITS_KEY);
    let n = Number(localStorage.getItem(VISITS_KEY) || 0);
    if (!counted) {
      n += 1;
      localStorage.setItem(VISITS_KEY, String(n));
      sessionStorage.setItem(VISITS_KEY, "1");
    }
    return n;
  } catch {
    return 1;
  }
}

function notRecentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (!dismissedAt) return true;
    const daysSince = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
    return daysSince > REPROMPT_DAYS;
  } catch {
    return false;
  }
}
