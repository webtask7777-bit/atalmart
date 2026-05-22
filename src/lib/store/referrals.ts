import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Referral system — each user gets a unique 6-char code. Friends who land
 * via that code get ₹50 off their first order; the referrer gets ₹50 credit
 * after the friend's first paid order.
 */
const REWARD_AMOUNT = 50;
const REWARD_MIN_ORDER = 199; // friend's first order must meet this

export interface ReferralEvent {
  id: string;
  referrerCode: string;
  refereePhone: string;
  refereeName?: string;
  status: "signed_up" | "ordered" | "credited";
  signedUpAt: string;
  orderedAt?: string;
  creditedAt?: string;
  orderId?: string;
  orderTotal?: number;
}

interface ReferralStore {
  /** This visitor's own referral code (generated on first visit). */
  myCode: string | null;
  /** All referral events the system has seen. */
  events: ReferralEvent[];
  /** Pending credit balance (₹) earned but not yet applied. */
  creditBalance: number;
  ensureMyCode: () => string;
  recordSignup: (input: { referrerCode: string; refereePhone: string; refereeName?: string }) => void;
  recordOrder: (input: { refereePhone: string; orderId: string; orderTotal: number }) => void;
  reset: () => void;
}

/** Generate a friendly 6-char code (uppercase letters + digits, no ambiguous chars). */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const useReferralStore = create<ReferralStore>()(
  persist(
    (set, get) => ({
      myCode: null,
      events: [],
      creditBalance: 0,
      ensureMyCode: () => {
        const existing = get().myCode;
        if (existing) return existing;
        const code = generateCode();
        set({ myCode: code });
        return code;
      },
      recordSignup: ({ referrerCode, refereePhone, refereeName }) => {
        // Avoid duplicate signup for same phone+referrer
        const existing = get().events.find(
          (e) =>
            e.referrerCode === referrerCode && e.refereePhone === refereePhone,
        );
        if (existing) return;
        const ev: ReferralEvent = {
          id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          referrerCode,
          refereePhone,
          refereeName,
          status: "signed_up",
          signedUpAt: new Date().toISOString(),
        };
        set((s) => ({ events: [ev, ...s.events] }));
      },
      recordOrder: ({ refereePhone, orderId, orderTotal }) => {
        const ev = get().events.find(
          (e) =>
            e.refereePhone === refereePhone &&
            e.status === "signed_up" &&
            !e.orderId,
        );
        if (!ev) return;
        // Only credit if order meets minimum
        const shouldCredit = orderTotal >= REWARD_MIN_ORDER;
        const now = new Date().toISOString();
        set((s) => ({
          events: s.events.map((e) =>
            e.id === ev.id
              ? {
                  ...e,
                  status: shouldCredit ? "credited" : "ordered",
                  orderedAt: now,
                  creditedAt: shouldCredit ? now : undefined,
                  orderId,
                  orderTotal,
                }
              : e,
          ),
          // Keep local mirror for backwards compatibility; source of truth is wallet
          creditBalance: shouldCredit
            ? s.creditBalance + REWARD_AMOUNT
            : s.creditBalance,
        }));

        // Push reward to unified wallet (fire-and-forget; wallet store may
        // not be loaded during SSR — referrals only fire client-side anyway)
        if (shouldCredit) {
          (async () => {
            try {
              const { useWalletStore } = await import("@/lib/store/wallet");
              useWalletStore.getState().credit({
                type: "referral_reward",
                amount: REWARD_AMOUNT,
                description: `Referral reward — friend ordered #${orderId.slice(-8).toUpperCase()}`,
                orderId,
              });
            } catch {
              // ignore
            }
          })();
        }
      },
      reset: () =>
        set({ myCode: null, events: [], creditBalance: 0 }),
    }),
    { name: "atalmart-referrals" },
  ),
);

export const REFERRAL_REWARD = REWARD_AMOUNT;
export const REFERRAL_MIN_ORDER = REWARD_MIN_ORDER;
