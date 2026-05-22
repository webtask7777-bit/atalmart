"use client";

import { useSettings } from "@/lib/store/settings";
import { Megaphone } from "lucide-react";

export function AnnouncementBanner() {
  const { notificationBanner } = useSettings();
  if (!notificationBanner.trim()) return null;
  return (
    <div className="bg-saffron text-white text-center text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 sticky top-0 z-[60]">
      <Megaphone size={12} className="shrink-0" />
      <span className="truncate">{notificationBanner}</span>
    </div>
  );
}
