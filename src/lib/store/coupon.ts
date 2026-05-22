import { create } from "zustand";
import { persist } from "zustand/middleware";
import { COUPONS, type Coupon } from "@/lib/constants";

interface CouponStore {
  applied: Coupon | null;
  /** Times THIS browser has used each code (key: code, value: count). */
  myUsage: Record<string, number>;
  apply: (c: Coupon | null) => void;
  clear: () => void;
  recordUsage: (code: string) => void;
}

export const useCouponStore = create<CouponStore>()(
  persist(
    (set) => ({
      applied: null,
      myUsage: {},
      apply: (c) => set({ applied: c }),
      clear: () => set({ applied: null }),
      recordUsage: (code) =>
        set((s) => ({
          myUsage: { ...s.myUsage, [code]: (s.myUsage[code] || 0) + 1 },
        })),
    }),
    { name: "atalmart-coupon" },
  ),
);

// ─── Coupon catalog (admin-managed) ──────────────────────────────
interface CouponCatalog {
  coupons: Coupon[];
  add: (c: Coupon) => void;
  update: (code: string, patch: Partial<Coupon>) => void;
  remove: (code: string) => void;
  reset: () => void;
  /** Increments totalUsageCount on the matching coupon. */
  incrementGlobalUsage: (code: string) => void;
}

export const useCouponCatalog = create<CouponCatalog>()(
  persist(
    (set) => ({
      coupons: COUPONS,
      add: (c) =>
        set((s) => {
          if (s.coupons.some((x) => x.code === c.code)) return s;
          return { coupons: [...s.coupons, c] };
        }),
      update: (code, patch) =>
        set((s) => ({
          coupons: s.coupons.map((c) => (c.code === code ? { ...c, ...patch } : c)),
        })),
      remove: (code) =>
        set((s) => ({ coupons: s.coupons.filter((c) => c.code !== code) })),
      reset: () => set({ coupons: COUPONS }),
      incrementGlobalUsage: (code) =>
        set((s) => ({
          coupons: s.coupons.map((c) =>
            c.code === code
              ? { ...c, totalUsageCount: (c.totalUsageCount || 0) + 1 }
              : c,
          ),
        })),
    }),
    { name: "atalmart-coupon-catalog" },
  ),
);
