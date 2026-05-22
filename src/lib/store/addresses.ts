import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SavedAddress = {
  id: string;
  label: "Home" | "Work" | "Other";
  customLabel?: string;
  recipient: string;
  phone: string;
  line: string;
  landmark?: string;
  pincode: string;
  lat?: number;
  lng?: number;
  createdAt: number;
};

interface AddressStore {
  addresses: SavedAddress[];
  selectedId: string | null;
  add: (a: Omit<SavedAddress, "id" | "createdAt">) => string;
  update: (id: string, patch: Partial<SavedAddress>) => void;
  remove: (id: string) => void;
  select: (id: string | null) => void;
}

export const useAddressStore = create<AddressStore>()(
  persist(
    (set) => ({
      addresses: [],
      selectedId: null,
      add: (a) => {
        const id = `addr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newAddr: SavedAddress = { ...a, id, createdAt: Date.now() };
        set((s) => ({
          addresses: [...s.addresses, newAddr],
          selectedId: s.selectedId ?? id,
        }));
        return id;
      },
      update: (id, patch) =>
        set((s) => ({
          addresses: s.addresses.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      remove: (id) =>
        set((s) => ({
          addresses: s.addresses.filter((a) => a.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),
      select: (id) => set({ selectedId: id }),
    }),
    {
      name: "atalmart-addresses",
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
    },
  ),
);
