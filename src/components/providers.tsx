"use client";

import { useEffect, type ReactNode } from "react";
import { useCartStore } from "@/lib/store/cart";
import { useCouponCatalog } from "@/lib/store/coupon";
import { useSettingsStore } from "@/lib/store/settings";
import { AuthContext, useAuthProvider } from "@/lib/hooks/use-auth";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export function StoreHydration() {
  useEffect(() => {
    useCartStore.persist.rehydrate();
    // Pull admin-managed config (coupons, delivery rules, pincodes, banner)
    // from the DB so customers + every admin device see the live values, not
    // each browser's localStorage copy. No-ops in demo mode / before migration
    // 010 is applied (keeps the in-code seed on query error).
    useCouponCatalog.getState().hydrate();
    useSettingsStore.getState().hydrate();
  }, []);
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthProvider();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StoreHydration />
        {children}
      </AuthProvider>
    </ErrorBoundary>
  );
}
