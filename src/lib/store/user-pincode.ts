import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";

/**
 * Stores the customer's selected pincode + a flag indicating whether the
 * first-visit prompt has been shown.
 *
 * On first visit, the customer is asked to enter their pincode. We persist
 * the choice in localStorage so they don't see the modal again unless they
 * change their address.
 */
interface UserPincodeStore {
  pincode: string | null;
  promptDismissed: boolean;
  setPincode: (pincode: string) => void;
  clearPincode: () => void;
  dismissPrompt: () => void;
}

export const useUserPincodeStore = create<UserPincodeStore>()(
  persist(
    (set) => ({
      pincode: null,
      promptDismissed: false,
      setPincode: (pincode) =>
        set({ pincode: pincode.trim(), promptDismissed: true }),
      clearPincode: () => set({ pincode: null }),
      dismissPrompt: () => set({ promptDismissed: true }),
    }),
    {
      name: "atalmart-user-pincode",
      skipHydration: true,
    },
  ),
);

/**
 * Returns true once the persisted pincode state has been read from localStorage.
 * Use this to avoid a flash of the first-visit modal during hydration.
 */
export function useUserPincodeHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useUserPincodeStore.persist.hasHydrated()) {
      setHydrated(true);
      useUserPincodeStore.persist.rehydrate();
      return;
    }
    const unsub = useUserPincodeStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    useUserPincodeStore.persist.rehydrate();
    return unsub;
  }, []);
  return hydrated;
}
