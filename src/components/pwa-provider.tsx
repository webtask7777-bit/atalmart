"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { usePwaStore, type BeforeInstallPromptEvent } from "@/lib/store/pwa";

const DISMISSED_KEY = "atalmart_pwa_install_dismissed_at";
const REPROMPT_DAYS = 14;

export function PWAProvider() {
  const setPrompt = usePwaStore((s) => s.setPrompt);
  const setIos = usePwaStore((s) => s.setIos);
  const setStandalone = usePwaStore((s) => s.setStandalone);
  const setInstalled = usePwaStore((s) => s.setInstalled);
  const promptInstall = usePwaStore((s) => s.promptInstall);
  const [showBanner, setShowBanner] = useState(false);
  const [iosHint, setIosHint] = useState(false);

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

  // Listen for install prompt
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      if (shouldShowBanner()) setShowBanner(true);
    };

    const onInstalled = () => {
      setShowBanner(false);
      setPrompt(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari does not fire beforeinstallprompt — show hint instead
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/MSStream/.test(ua);
    const standalone =
      ("standalone" in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean }).standalone) ||
      window.matchMedia("(display-mode: standalone)").matches;
    setIos(isIos);
    setStandalone(Boolean(standalone));
    if (isIos && !standalone && shouldShowBanner()) {
      setIosHint(true);
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [setPrompt, setIos, setStandalone, setInstalled]);

  const handleInstall = useCallback(async () => {
    const outcome = await promptInstall();
    if (outcome === "dismissed") localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShowBanner(false);
  }, [promptInstall]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShowBanner(false);
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 md:left-auto md:right-4 md:bottom-4 md:max-w-sm z-[100] animate-in slide-in-from-bottom-5">
      <div className="bg-white rounded-2xl shadow-xl border border-saffron/20 p-4 flex items-start gap-3">
        <div className="shrink-0 w-11 h-11 bg-saffron rounded-xl flex items-center justify-center">
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
              className="mt-2 inline-flex items-center gap-1.5 bg-saffron text-white text-[12px] font-bold px-3 py-1.5 rounded-lg hover:bg-saffron-dark transition-colors"
            >
              <Download size={12} strokeWidth={3} />
              Install Now
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          aria-label="dismiss"
          className="shrink-0 p-1 text-gray-400 hover:text-brown rounded-lg"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function shouldShowBanner(): boolean {
  if (typeof window === "undefined") return false;
  const dismissedAt = localStorage.getItem(DISMISSED_KEY);
  if (!dismissedAt) return true;
  const daysSince = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
  return daysSince > REPROMPT_DAYS;
}
