import { create } from "zustand";
import { persist } from "zustand/middleware";
import { COUPONS, type Coupon } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";

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

// ─── snake_case DB row ↔ camelCase Coupon mappers ────────────────
// The `coupons` table (migration 010) stores snake_case columns to match the
// rest of the schema; the `Coupon` type is camelCase. Keep these two in sync
// with the inline mapper in src/app/api/orders/price/route.ts.
type CouponRow = {
  code: string;
  description: string | null;
  type: "flat" | "percent";
  value: number | string;
  min_order: number | string;
  max_discount: number | string | null;
  first_order_only: boolean | null;
  max_uses_per_user: number | null;
  total_usage_limit: number | null;
  total_usage_count: number | null;
  campaign_source: string | null;
  valid_for_pincodes: string | null;
  expires_at: string | null;
};

function rowToCoupon(r: CouponRow): Coupon {
  return {
    code: r.code,
    description: r.description ?? "",
    type: r.type,
    value: Number(r.value),
    minOrder: Number(r.min_order),
    maxDiscount: r.max_discount == null ? undefined : Number(r.max_discount),
    firstOrderOnly: r.first_order_only ?? undefined,
    maxUsesPerUser: r.max_uses_per_user ?? undefined,
    totalUsageLimit: r.total_usage_limit ?? undefined,
    totalUsageCount: r.total_usage_count ?? undefined,
    campaignSource: r.campaign_source ?? undefined,
    validForPincodes: r.valid_for_pincodes ?? undefined,
    expiresAt: r.expires_at ?? undefined,
  };
}

function couponToRow(c: Coupon) {
  return {
    code: c.code.toUpperCase(),
    description: c.description,
    type: c.type,
    value: c.value,
    min_order: c.minOrder,
    max_discount: c.maxDiscount ?? null,
    first_order_only: c.firstOrderOnly ?? false,
    max_uses_per_user: c.maxUsesPerUser ?? null,
    total_usage_limit: c.totalUsageLimit ?? null,
    total_usage_count: c.totalUsageCount ?? 0,
    campaign_source: c.campaignSource ?? null,
    valid_for_pincodes: c.validForPincodes ?? null,
    expires_at: c.expiresAt ?? null,
    active: true,
  };
}

/** Fire-and-forget DB write; log (don't throw) so optimistic UI never blocks. */
function warnOnError(label: string, p: PromiseLike<{ error: unknown }>) {
  Promise.resolve(p).then(({ error }) => {
    if (error && typeof window !== "undefined") {
      console.warn(`[coupons] ${label} failed`, error);
    }
  });
}

// ─── Coupon catalog (admin-managed, DB-backed) ───────────────────
// Seeded with the in-code COUPONS so the UI renders instantly and still works
// if migration 010 hasn't been applied yet. hydrate() replaces the seed with
// the live `coupons` table; mutations write through to the DB optimistically.
interface CouponCatalog {
  coupons: Coupon[];
  hydrated: boolean;
  /** Load the live catalog from Supabase (no-op in demo mode). */
  hydrate: () => Promise<void>;
  add: (c: Coupon) => void;
  update: (code: string, patch: Partial<Coupon>) => void;
  remove: (code: string) => void;
  reset: () => void;
  /** Increments totalUsageCount on the matching coupon. */
  incrementGlobalUsage: (code: string) => void;
}

export const useCouponCatalog = create<CouponCatalog>()(
  persist(
    (set, get) => ({
      coupons: COUPONS,
      hydrated: false,
      hydrate: async () => {
        if (isDemoMode()) {
          set({ hydrated: true });
          return;
        }
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("coupons")
            .select("*")
            .order("created_at", { ascending: true });
          // On error (table missing / RLS) keep the in-code seed — degrades
          // gracefully before migration 010 is applied.
          if (error || !data) return;
          set({ coupons: (data as CouponRow[]).map(rowToCoupon), hydrated: true });
        } catch {
          /* keep seed */
        }
      },
      add: (c) => {
        if (get().coupons.some((x) => x.code === c.code)) return;
        set((s) => ({ coupons: [...s.coupons, c] }));
        if (!isDemoMode()) {
          warnOnError("add", createClient().from("coupons").insert(couponToRow(c)));
        }
      },
      update: (code, patch) => {
        const existing = get().coupons.find((c) => c.code === code);
        const merged = existing ? { ...existing, ...patch } : null;
        set((s) => ({
          coupons: s.coupons.map((c) => (c.code === code ? { ...c, ...patch } : c)),
        }));
        if (merged && !isDemoMode()) {
          warnOnError(
            "update",
            createClient().from("coupons").update(couponToRow(merged)).eq("code", code),
          );
        }
      },
      remove: (code) => {
        set((s) => ({ coupons: s.coupons.filter((c) => c.code !== code) }));
        if (!isDemoMode()) {
          warnOnError("remove", createClient().from("coupons").delete().eq("code", code));
        }
      },
      reset: () => {
        set({ coupons: COUPONS });
        if (!isDemoMode()) {
          // Restore the catalog to the three defaults: drop everything else,
          // re-upsert the seed. Behind a destructive confirm dialog in the UI.
          const supabase = createClient();
          const keep = COUPONS.map((c) => c.code);
          warnOnError(
            "reset-delete",
            supabase.from("coupons").delete().not("code", "in", `(${keep.join(",")})`),
          );
          warnOnError(
            "reset-seed",
            supabase.from("coupons").upsert(COUPONS.map(couponToRow), { onConflict: "code" }),
          );
        }
      },
      incrementGlobalUsage: (code) => {
        const current = get().coupons.find((c) => c.code === code);
        const next = (current?.totalUsageCount || 0) + 1;
        set((s) => ({
          coupons: s.coupons.map((c) =>
            c.code === code ? { ...c, totalUsageCount: next } : c,
          ),
        }));
        if (current && !isDemoMode()) {
          warnOnError(
            "increment-usage",
            createClient()
              .from("coupons")
              .update({ total_usage_count: next })
              .eq("code", code),
          );
        }
      },
    }),
    { name: "atalmart-coupon-catalog" },
  ),
);
