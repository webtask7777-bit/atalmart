import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Persisted acquisition attribution — once a visitor arrives via a tracked
 * source (UTM, campaign QR, referral), we keep that source through their
 * first order so admin can measure CPA per channel.
 *
 * Read by checkout and admin dashboard. Set by the URL-param effect that
 * runs on every customer page load.
 */
export interface AcquisitionSource {
  source: string; // primary channel — e.g. "sector27_lift", "iiit_fest", "newspaper"
  medium?: string; // e.g. "qr", "flyer", "referral"
  campaign?: string; // e.g. "diwali2026"
  referrerCode?: string; // if user came via a referral code
  firstSeenAt: string; // ISO timestamp
  firstOrderId?: string; // set when they place their first order
  firstOrderAt?: string;
  totalOrdersFromSource?: number;
}

interface AcquisitionStore {
  current: AcquisitionSource | null;
  setSource: (s: Omit<AcquisitionSource, "firstSeenAt">) => void;
  recordOrder: (orderId: string) => void;
  clear: () => void;
}

export const useAcquisitionStore = create<AcquisitionStore>()(
  persist(
    (set, get) => ({
      current: null,
      setSource: (s) => {
        // Don't overwrite an existing source — first-touch attribution wins
        if (get().current?.source) return;
        set({
          current: {
            ...s,
            firstSeenAt: new Date().toISOString(),
            totalOrdersFromSource: 0,
          },
        });
      },
      recordOrder: (orderId) => {
        const cur = get().current;
        if (!cur) return;
        set({
          current: {
            ...cur,
            firstOrderId: cur.firstOrderId || orderId,
            firstOrderAt: cur.firstOrderAt || new Date().toISOString(),
            totalOrdersFromSource: (cur.totalOrdersFromSource || 0) + 1,
          },
        });
      },
      clear: () => set({ current: null }),
    }),
    { name: "atalmart-acquisition" },
  ),
);

/**
 * Per-campaign analytics — incremented when a UTM-tagged URL is visited.
 * Stored separately so admin can see all campaigns' performance even after
 * customers convert to attributed users.
 */
export interface CampaignAnalytics {
  source: string;
  scans: number; // unique URL visits
  signups: number; // distinct users with this source
  orders: number; // total orders from this source
  revenue: number;
  lastUpdated: string;
}

interface AnalyticsStore {
  byCampaign: Record<string, CampaignAnalytics>;
  recordScan: (source: string) => void;
  recordSignup: (source: string) => void;
  recordOrder: (source: string, revenue: number) => void;
  reset: () => void;
}

export const useCampaignAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set) => ({
      byCampaign: {},
      recordScan: (source) =>
        set((s) => {
          const cur = s.byCampaign[source] || {
            source,
            scans: 0,
            signups: 0,
            orders: 0,
            revenue: 0,
            lastUpdated: new Date().toISOString(),
          };
          return {
            byCampaign: {
              ...s.byCampaign,
              [source]: {
                ...cur,
                scans: cur.scans + 1,
                lastUpdated: new Date().toISOString(),
              },
            },
          };
        }),
      recordSignup: (source) =>
        set((s) => {
          const cur = s.byCampaign[source] || {
            source,
            scans: 0,
            signups: 0,
            orders: 0,
            revenue: 0,
            lastUpdated: new Date().toISOString(),
          };
          return {
            byCampaign: {
              ...s.byCampaign,
              [source]: {
                ...cur,
                signups: cur.signups + 1,
                lastUpdated: new Date().toISOString(),
              },
            },
          };
        }),
      recordOrder: (source, revenue) =>
        set((s) => {
          const cur = s.byCampaign[source] || {
            source,
            scans: 0,
            signups: 0,
            orders: 0,
            revenue: 0,
            lastUpdated: new Date().toISOString(),
          };
          return {
            byCampaign: {
              ...s.byCampaign,
              [source]: {
                ...cur,
                orders: cur.orders + 1,
                revenue: cur.revenue + revenue,
                lastUpdated: new Date().toISOString(),
              },
            },
          };
        }),
      reset: () => set({ byCampaign: {} }),
    }),
    { name: "atalmart-campaign-analytics" },
  ),
);
