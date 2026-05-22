import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import type { CartItem, Product, ProductVariant } from "@/types";

/**
 * A cart line's identity is "product + selected variant" — the same product
 * can be in cart twice with different pack sizes (Amul 500ml + 1L).
 */
function cartKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}::${variantId}` : productId;
}

function itemKey(it: CartItem): string {
  return cartKey(it.product.id, it.variant?.id);
}

/** Pick the right price source — variant overrides product when set. */
function unitPrice(it: CartItem): number {
  return it.variant?.price ?? it.product.price;
}

interface CartStore {
  items: CartItem[];
  addItem: (product: Product, variant?: ProductVariant | null) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  updateQuantity: (
    productId: string,
    quantity: number,
    variantId?: string | null,
  ) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, variant = null) => {
        const items = get().items;
        const key = cartKey(product.id, variant?.id);
        const existing = items.find((i) => itemKey(i) === key);
        if (existing) {
          set({
            items: items.map((i) =>
              itemKey(i) === key ? { ...i, quantity: i.quantity + 1 } : i,
            ),
          });
        } else {
          set({ items: [...items, { product, quantity: 1, variant }] });
        }
      },

      removeItem: (productId, variantId = null) => {
        const key = cartKey(productId, variantId);
        set({ items: get().items.filter((i) => itemKey(i) !== key) });
      },

      updateQuantity: (productId, quantity, variantId = null) => {
        if (quantity <= 0) {
          get().removeItem(productId, variantId);
          return;
        }
        const key = cartKey(productId, variantId);
        set({
          items: get().items.map((i) =>
            itemKey(i) === key ? { ...i, quantity } : i,
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      getTotal: () =>
        get().items.reduce(
          (sum, item) => sum + unitPrice(item) * item.quantity,
          0,
        ),

      getItemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    // ↓↓ persist options ↓↓
    {
      name: "atalmart-cart",
      skipHydration: true,
      storage: {
        getItem: (name) => {
          if (typeof window === "undefined") return null;
          const item = localStorage.getItem(name);
          return item ? JSON.parse(item) : null;
        },
        setItem: (name, value) => {
          if (typeof window === "undefined") return;
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          if (typeof window === "undefined") return;
          localStorage.removeItem(name);
        },
      },
    }
  )
);

/**
 * Returns true once the persisted cart has been read from localStorage.
 * Components that conditionally redirect when the cart is empty (e.g. /checkout)
 * MUST gate on this — otherwise the initial render (items=[]) will redirect
 * before hydration completes.
 */
export function useCartHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useCartStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useCartStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);
  return hydrated;
}

