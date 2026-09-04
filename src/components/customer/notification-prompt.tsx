"use client";

import { useEffect, useState } from "react";
import { Bell, X, Check } from "lucide-react";
import { toast } from "sonner";

const DISMISSED_KEY = "atalmart_notif_dismissed_at";
const REPROMPT_DAYS = 30;
const SUB_KEY = "atalmart_push_sub";

type Permission = "default" | "granted" | "denied" | "unsupported";

export function NotificationPrompt() {
  const [permission, setPermission] = useState<Permission>("default");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    const current = Notification.permission as Permission;
    setPermission(current);

    if (current === "default" && shouldShow()) {
      // Soft-prompt after 12s — don't ambush on first paint
      const t = setTimeout(() => setShow(true), 12000);
      return () => clearTimeout(t);
    }
  }, []);

  const enable = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result as Permission);
      if (result === "granted") {
        toast.success("Notifications on — order updates ab milenge");
        await subscribeForPush();
        setShow(false);
      } else if (result === "denied") {
        toast.error("Notifications blocked. Browser settings me enable kar sakte ho.");
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        setShow(false);
      }
    } catch (err) {
      console.warn("[push]", err);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShow(false);
  };

  if (!show || permission !== "default") return null;

  return (
    <div className="fixed inset-x-3 top-3 md:left-auto md:right-4 md:top-20 md:max-w-sm z-[100]">
      <div className="bg-white rounded-2xl shadow-xl border border-saffron/20 p-4 flex items-start gap-3 animate-in slide-in-from-top-5">
        <div className="shrink-0 w-11 h-11 bg-saffron rounded-xl flex items-center justify-center">
          <Bell size={22} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-brown leading-tight">
            Order updates chahiye?
          </p>
          <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">
            Confirm, packed, out for delivery — sab notifications me milenge
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={enable}
              className="inline-flex items-center gap-1.5 bg-saffron text-white text-[12px] font-bold px-3 py-1.5 rounded-lg hover:bg-saffron-dark transition-colors"
            >
              <Check size={12} strokeWidth={3} />
              Enable
            </button>
            <button
              onClick={dismiss}
              className="text-[12px] font-semibold text-gray-500 hover:text-brown px-2"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="dismiss"
          className="shrink-0 p-1 text-gray-500 hover:text-brown rounded-lg"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  const dismissedAt = localStorage.getItem(DISMISSED_KEY);
  if (!dismissedAt) return true;
  const daysSince = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
  return daysSince > REPROMPT_DAYS;
}

async function subscribeForPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    // VAPID public key would come from env in real prod. For now, mark subscribed locally.
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      localStorage.setItem(SUB_KEY, JSON.stringify(existing.toJSON()));
      return;
    }
    // Without a VAPID key we can't actually subscribe — fallback to marker only.
    localStorage.setItem(SUB_KEY, "permission-only");
  } catch (err) {
    console.warn("[push subscribe]", err);
  }
}

/**
 * Helper for demo: trigger a local notification immediately (no server roundtrip).
 * Use this from order-status changes to give the user instant feedback during demo mode.
 */
export async function showLocalOrderNotification(title: string, body: string, tag?: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-96.png",
        tag: tag || "atalmart-order",
        data: { url: "/orders" },
      });
    } else {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    }
  } catch (err) {
    console.warn("[notif]", err);
  }
}
