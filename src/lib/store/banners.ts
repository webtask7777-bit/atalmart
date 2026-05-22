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
  enabled: boolean;
  sortOrder: number;
};

const SEED: Banner[] = [
  {
    id: "b1",
    badge: "FLASH DEAL",
    title: "10-minute delivery",
    subtitle: "Atal Nagar mein groceries, dairy, snacks — abhi order karo, abhi pao",
    ctaLabel: "Shop now",
    ctaHref: "/",
    gradient: "from-saffron via-orange-500 to-red-500",
    illo: "🛒",
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
    subtitle: "No delivery charges on orders over ₹299 — sirf aaj!",
    ctaLabel: "Browse essentials",
    ctaHref: "/",
    gradient: "from-purple-600 via-fuchsia-500 to-pink-500",
    illo: "🚚",
    enabled: true,
    sortOrder: 3,
  },
  {
    id: "b4",
    badge: "TRENDING",
    title: "Aashirvaad Atta sale",
    subtitle: "5 kg pack at ₹265 — 15% off MRP. Made from 100% whole wheat.",
    ctaLabel: "Shop now",
    ctaHref: "/product/p31",
    gradient: "from-amber-600 via-orange-600 to-red-700",
    illo: "🌾",
    enabled: true,
    sortOrder: 4,
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
    { name: "atalmart-banners" },
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
