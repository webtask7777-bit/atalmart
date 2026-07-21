import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";

/**
 * Tracks whether the customer has confirmed they are 18+. Required before
 * showing tobacco products (Paan Corner) — India's COTPA Act, 2003 §6 bars
 * sale of tobacco to minors. Once confirmed we persist it so the gate isn't
 * shown on every visit.
 */
interface AgeGateStore {
  /** true once the user has confirmed 18+ */
  verified: boolean;
  confirm: () => void;
  reset: () => void;
}

export const useAgeGateStore = create<AgeGateStore>()(
  persist(
    (set) => ({
      verified: false,
      confirm: () => set({ verified: true }),
      reset: () => set({ verified: false }),
    }),
    {
      name: "atalmart-age-verified",
      skipHydration: true,
    },
  ),
);

/** True once the persisted age-gate state has been read from localStorage. */
export function useAgeGateHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAgeGateStore.persist.hasHydrated()) {
      setHydrated(true);
      useAgeGateStore.persist.rehydrate();
      return;
    }
    const unsub = useAgeGateStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    useAgeGateStore.persist.rehydrate();
    return unsub;
  }, []);
  return hydrated;
}

/** Category names that require an 18+ confirmation before their products show. */
export const AGE_RESTRICTED_CATEGORIES = new Set<string>(["Paan Corner"]);

export function isAgeRestricted(categoryName: string | null | undefined): boolean {
  return !!categoryName && AGE_RESTRICTED_CATEGORIES.has(categoryName);
}
