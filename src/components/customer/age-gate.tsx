"use client";

import { ShieldAlert } from "lucide-react";
import { useAgeGateStore } from "@/lib/store/age-gate";

/**
 * 18+ confirmation shown before an age-restricted category's products (Paan
 * Corner / tobacco) are revealed. Rendered inline in place of the product grid
 * — not a dismissable overlay — so under-18 users can't slip past it.
 * `onDecline` lets the caller navigate away (e.g. clear the category filter).
 */
export function AgeGate({ onDecline }: { onDecline: () => void }) {
  const confirm = useAgeGateStore((s) => s.confirm);

  return (
    <div className="mt-6 flex justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-orange-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-saffron-light">
          <ShieldAlert size={26} className="text-saffron" />
        </div>
        <h2 className="text-lg font-bold text-brown">Aap 18 saal ke hain?</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Is section mein tobacco products hain. Kanoon ke hisaab se (COTPA
          2003) yeh sirf 18+ ke liye hain.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={confirm}
            className="w-full rounded-xl bg-saffron py-3 text-sm font-bold text-white transition-colors hover:bg-saffron-dark active:scale-[0.98]"
          >
            Haan, main 18+ hun
          </button>
          <button
            onClick={onDecline}
            className="w-full rounded-xl border-2 border-gray-200 py-3 text-sm font-semibold text-brown-light transition-colors hover:bg-gray-50"
          >
            Nahi
          </button>
        </div>
      </div>
    </div>
  );
}
