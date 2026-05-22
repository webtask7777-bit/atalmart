import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Marketing campaigns — admin creates one per channel (society poster, IIIT
 * fest, newspaper insert), assigns a unique source slug, and gets back a
 * QR code + trackable URL.
 */
export interface Campaign {
  id: string;
  name: string; // human label e.g. "Sector 27 Lift QR — Oct"
  source: string; // URL slug e.g. "sector27_lift"
  medium: "qr" | "flyer" | "newspaper" | "referral" | "social" | "other";
  notes?: string;
  budgetInr?: number; // money allocated to this campaign
  startDate?: string;
  endDate?: string;
  created_at: string;
  active: boolean;
}

interface CampaignsStore {
  campaigns: Campaign[];
  add: (input: Omit<Campaign, "id" | "created_at" | "active">) => Campaign;
  update: (id: string, patch: Partial<Campaign>) => void;
  remove: (id: string) => void;
  toggleActive: (id: string) => void;
  reset: () => void;
}

const SEED: Campaign[] = [
  {
    id: "cmp_seed_sec27",
    name: "Sector 27 Society Lift QR",
    source: "sector27_lift",
    medium: "qr",
    notes: "Poster lift mein Avinash New County, Sector 27",
    budgetInr: 5000,
    created_at: "2026-05-01T00:00:00Z",
    active: true,
  },
  {
    id: "cmp_seed_iiit",
    name: "IIIT Naya Raipur Fest",
    source: "iiit_fest_2026",
    medium: "flyer",
    notes: "Stall at college fest — pamphlets + first-order coupon",
    budgetInr: 15000,
    created_at: "2026-05-05T00:00:00Z",
    active: true,
  },
  {
    id: "cmp_seed_newspaper",
    name: "Newspaper Insert — Patrika",
    source: "patrika_insert",
    medium: "newspaper",
    notes: "Naya Raipur ke pincodes mein newspaper insert",
    budgetInr: 30000,
    created_at: "2026-05-08T00:00:00Z",
    active: true,
  },
];

export const useCampaignsStore = create<CampaignsStore>()(
  persist(
    (set, get) => ({
      campaigns: SEED,
      add: (input) => {
        const newCampaign: Campaign = {
          ...input,
          id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          created_at: new Date().toISOString(),
          active: true,
        };
        set((s) => ({ campaigns: [newCampaign, ...s.campaigns] }));
        return newCampaign;
      },
      update: (id, patch) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        })),
      remove: (id) =>
        set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) })),
      toggleActive: (id) => {
        const c = get().campaigns.find((x) => x.id === id);
        if (c) {
          set((s) => ({
            campaigns: s.campaigns.map((x) =>
              x.id === id ? { ...x, active: !x.active } : x,
            ),
          }));
        }
      },
      reset: () => set({ campaigns: SEED }),
    }),
    { name: "atalmart-campaigns" },
  ),
);

/** Build the trackable URL for a campaign. */
export function campaignUrl(source: string, baseUrl?: string): string {
  const origin =
    baseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "https://atalmart.in");
  return `${origin}/?src=${encodeURIComponent(source)}`;
}
