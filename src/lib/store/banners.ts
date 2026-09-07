import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Banner = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  gradient: string; // e.g. "from-saffron via-orange-500 to-red-500"
  illo: string; // emoji
  imgSrc?: string; // optional real image, takes priority over illo
  /** Full-bleed artwork with the copy baked in (brand banners). When set, the
   *  slide renders ONLY the image (desktop 1920×600, mobile 1200×400) and the
   *  text fields above are used for alt/aria only. */
  fullImage?: { desktop: string; mobile: string };
  enabled: boolean;
  sortOrder: number;
};

const SEED: Banner[] = [
  {
    id: "b1",
    badge: "FLASH DEAL",
    title: "Quick delivery",
    subtitle: "Atal Nagar mein groceries, dairy, snacks — abhi order karo, abhi pao",
    ctaLabel: "Shop now",
    ctaHref: "/",
    gradient: "from-saffron via-orange-500 to-red-500",
    illo: "🛒",
    imgSrc: "/banners/delivery-rider-2.webp",
    enabled: true,
    sortOrder: 1,
  },
  {
    id: "b2",
    badge: "NEW USER OFFER",
    title: "₹50 off your first order",
    subtitle: "Code: ATAL50 — minimum order ₹199. Limited time offer.",
    ctaLabel: "Apply ATAL50",
    ctaHref: "/cart",
    gradient: "from-indian-green via-green-600 to-emerald-700",
    illo: "🎁",
    enabled: true,
    sortOrder: 2,
  },
  {
    id: "b3",
    badge: "FREE DELIVERY",
    title: "Order above ₹299, save ₹25",
    subtitle: "No delivery charges on orders over ₹299.",
    ctaLabel: "Browse essentials",
    ctaHref: "/",
    gradient: "from-purple-600 via-fuchsia-500 to-pink-500",
    illo: "🚚",
    imgSrc: "/banners/delivery-rider.webp",
    enabled: true,
    sortOrder: 3,
  },
  {
    id: "b4",
    badge: "TRENDING",
    title: "Aashirvaad Atta sale",
    // Real live product + real prices (10 kg @ ₹510, MRP ₹580) — never
    // advertise a pack/price that doesn't exist in the catalog.
    subtitle: "10 kg pack at ₹510 — ₹70 off MRP. 100% whole wheat.",
    ctaLabel: "Shop now",
    ctaHref: "/product/9258f450-1fde-43e2-acca-77c0874a354a",
    gradient: "from-amber-600 via-orange-600 to-red-700",
    illo: "🌾",
    imgSrc: "/banners/aashirvaad-atta.webp",
    enabled: true,
    sortOrder: 4,
  },
  {
    id: "b5",
    badge: "POPAT NAMKEEN",
    title: "Har Chai Ka Crunchy Saathi",
    subtitle: "Popat Namkeen ki poori range — sev, gathiya, mixture, bhujiya. Ab Atalmart par.",
    ctaLabel: "Shop Popat",
    ctaHref: "/?search=popat",
    gradient: "from-red-700 via-orange-600 to-amber-500",
    illo: "🥨",
    // Same compact slide format as the other banners (consistent height on
    // every screen). The full Popat brand hero — live text, art-directed for
    // desktop/tablet/mobile — is the PopatHero section further down the home
    // page (src/components/popat).
    imgSrc: "/banners/popat-dal-moth-440.webp",
    enabled: true,
    sortOrder: 5,
  },
];

interface BannerStore {
  banners: Banner[];
  active: () => Banner[]; // sorted, enabled only
  add: (b: Omit<Banner, "id" | "sortOrder">) => string;
  update: (id: string, patch: Partial<Banner>) => void;
  remove: (id: string) => void;
  reorder: (id: string, dir: "up" | "down") => void;
  reset: () => void;
}

export const useBannerStore = create<BannerStore>()(
  persist(
    (set, get) => ({
      banners: SEED,
      active: () =>
        get()
          .banners.filter((b) => b.enabled)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      add: (b) => {
        const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        const sortOrder = (Math.max(0, ...get().banners.map((x) => x.sortOrder)) || 0) + 1;
        set((s) => ({ banners: [...s.banners, { ...b, id, sortOrder }] }));
        return id;
      },
      update: (id, patch) =>
        set((s) => ({
          banners: s.banners.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),
      remove: (id) =>
        set((s) => ({ banners: s.banners.filter((b) => b.id !== id) })),
      reorder: (id, dir) => {
        const arr = [...get().banners].sort((a, b) => a.sortOrder - b.sortOrder);
        const i = arr.findIndex((b) => b.id === id);
        if (i === -1) return;
        const j = dir === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= arr.length) return;
        const tmp = arr[i].sortOrder;
        arr[i] = { ...arr[i], sortOrder: arr[j].sortOrder };
        arr[j] = { ...arr[j], sortOrder: tmp };
        set({ banners: arr });
      },
      reset: () => set({ banners: SEED }),
    }),
    {
      name: "atalmart-banners",
      // v1: b4 pointed at demo id /product/p31 with a made-up ₹265 price.
      // v2: banner art moved from 700 KB PNGs to 50 KB WebPs (.png → .webp).
      // v3: Popat Namkeen full-image banner (b5) added.
      // v4: b5 back to the compact slide format (art now lives in PopatHero);
      //     the /banners/popat-*.webp files it pointed at were removed.
      // Bumping the version discards that stale persisted copy for existing
      // visitors so everyone gets the corrected seed.
      version: 4,
      migrate: () => ({ banners: SEED }),
    },
  ),
);

export const GRADIENTS: { label: string; value: string }[] = [
  { label: "Saffron sunset", value: "from-saffron via-orange-500 to-red-500" },
  { label: "Indian green", value: "from-indian-green via-green-600 to-emerald-700" },
  { label: "Purple pop", value: "from-purple-600 via-fuchsia-500 to-pink-500" },
  { label: "Amber wheat", value: "from-amber-600 via-orange-600 to-red-700" },
  { label: "Ocean blue", value: "from-blue-600 via-cyan-500 to-teal-500" },
  { label: "Royal navy", value: "from-navy via-blue-800 to-indigo-700" },
  { label: "Sweet pink", value: "from-pink-500 via-rose-500 to-red-400" },
  { label: "Cosmic", value: "from-slate-900 via-purple-900 to-slate-900" },
];
