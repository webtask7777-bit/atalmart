"use client";

import { useEffect, type ReactNode } from "react";
import { useCartStore } from "@/lib/store/cart";
import { AuthContext, useAuthProvider } from "@/lib/hooks/use-auth";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export function StoreHydration() {
  useEffect(() => {
    useCartStore.persist.rehydrate();
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
