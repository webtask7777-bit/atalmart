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
  /**
   * Precise area label when known (e.g. from a location lookup that resolved
   * the exact sector — "Sector 24, Atal Nagar"). All of sectors 21–29 share
   * pincode 492101, so without this the header can only show the generic
   * "Sector 21–29" range. Null when the user typed a pincode by hand.
   */
  area: string | null;
  promptDismissed: boolean;
  setPincode: (pincode: string, area?: string | null) => void;
  clearPincode: () => void;
  dismissPrompt: () => void;
}

export const useUserPincodeStore = create<UserPincodeStore>()(
  persist(
    (set) => ({
      pincode: null,
      area: null,
      promptDismissed: false,
      setPincode: (pincode, area = null) =>
        set({ pincode: pincode.trim(), area: area || null, promptDismissed: true }),
      // clearPincode also un-dismisses so the picker modal opens again.
      // Without this reset, tapping "Tap to set" on a header that had a
      // previously-dismissed pincode prompt was a silent no-op.
      clearPincode: () => set({ pincode: null, area: null, promptDismissed: false }),
      dismissPrompt: () => set({ promptDismissed: true }),
    }),
    {
      name: "atalmart-user-pincode",
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
    setHydrated(useUserPincodeStore.persist.hasHydrated());
    const unsub = useUserPincodeStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    return unsub;
  }, []);
  return hydrated;
}
