"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAcquisitionStore,
  useCampaignAnalyticsStore,
} from "@/lib/store/acquisition";

/**
 * Mounts on every customer page. Reads `?src=`, `?ref=`, `?utm_*` from the
 * URL and persists the first-touch source in localStorage, then records a
 * scan against the campaign analytics store (once per source per session).
 *
 * Renders nothing.
 */
const SESSION_RECORDED_SCANS_KEY = "atalmart-recorded-scans-session";

export function SourceTracker() {
  const params = useSearchParams();
  const setSource = useAcquisitionStore((s) => s.setSource);
  const recordScan = useCampaignAnalyticsStore((s) => s.recordScan);

  useEffect(() => {
    const src =
      params.get("src") ||
      params.get("utm_source") ||
      params.get("source") ||
      "";
    const medium = params.get("utm_medium") || params.get("medium") || "";
    const campaign =
      params.get("utm_campaign") || params.get("campaign") || "";
    const ref = params.get("ref") || params.get("referrer") || "";

    if (!src && !ref) return;

    const sourceKey = src || (ref ? `referral:${ref}` : "");
    if (!sourceKey) return;

    setSource({
      source: sourceKey,
      medium: medium || (ref ? "referral" : "url"),
      campaign,
      referrerCode: ref || undefined,
    });

    // Record scan, but only once per browser session per source to avoid
    // double-counting on page navigation
    try {
      const recorded = JSON.parse(
        sessionStorage.getItem(SESSION_RECORDED_SCANS_KEY) || "[]",
      ) as string[];
      if (!recorded.includes(sourceKey)) {
        recordScan(sourceKey);
        sessionStorage.setItem(
          SESSION_RECORDED_SCANS_KEY,
          JSON.stringify([...recorded, sourceKey]),
        );
      }
    } catch {
      // ignore session storage errors
    }
  }, [params, setSource, recordScan]);

  return null;
}
