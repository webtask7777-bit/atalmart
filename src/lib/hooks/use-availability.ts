"use client";

import { useSettingsStore } from "@/lib/store/settings";
import { useUserPincodeStore, useUserPincodeHydrated } from "@/lib/store/user-pincode";
import { isServiceablePincode } from "@/lib/constants";
import { isDemoMode } from "@/lib/supabase/helpers";
import { deriveAvailability, type Availability } from "@/lib/availability";

/**
 * Live store availability for customer UI. Reads the DB-backed settings
 * store (store status + serviceable pincodes) and the customer's pincode.
 * See src/lib/availability.ts for the state mapping.
 */
export function useStoreAvailability(): Availability {
  const settings = useSettingsStore((s) => s.settings);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const pincodeHydrated = useUserPincodeHydrated();
  const pincode = useUserPincodeStore((s) => s.pincode);

  const serviceable =
    pincodeHydrated && pincode
      ? isServiceablePincode(pincode, settings.serviceablePincodes)
      : null;

  return deriveAvailability({
    storeStatus: settings.storeStatus,
    // Demo mode has no settings row to read; the in-memory defaults are final.
    settingsHydrated: settingsHydrated || isDemoMode(),
    customMessage: settings.storeStatusMessage,
    serviceable,
  });
}
