import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Atalmart Wallet — unified credit ledger.
 *
 * Every credit-worthy event (refund on return, cancellation refund, referral
 * reward, welcome bonus, admin adjustment) becomes a transaction. Customer
 * can spend wallet credit at checkout (capped at order subtotal).
 *
 * Designed to be auditable: every debit/credit has a source + reference,
 * so customer + admin can trace where money came from / went to.
 */
export type WalletTxnType =
  | "refund_return" // approved return
  | "refund_cancel" // order cancellation (prepaid)
  | "referral_reward" // friend's first order credited
  | "welcome_bonus" // new user signup credit
  | "promo_credit" // marketing/grievance credit (admin)
  | "admin_adjust" // manual admin add/subtract
  | "checkout_spend" // debit: applied at checkout
  | "expiry_writeoff"; // debit: expired credits (future)

export interface WalletTransaction {
  id: string;
  type: WalletTxnType;
  amount: number; // positive = credit, negative = debit
  balanceAfter: number; // wallet balance after this txn (for audit)
  description: string; // human label (e.g. "Refund for #DEMO-1")
  orderId?: string; // associated order, if any
  adminNote?: string; // free-text for manual adjustments
  created_at: string;
}

interface WalletStore {
  balance: number;
  transactions: WalletTransaction[];
  /** Credit (positive) or debit (negative) the wallet. */
  credit: (
    input: Omit<WalletTransaction, "id" | "balanceAfter" | "created_at"> & {
      created_at?: string;
    },
  ) => WalletTransaction;
  /** Convenience: spend at checkout. Returns actual amount debited (capped at balance). */
  spend: (amount: number, orderId: string) => number;
  reset: () => void;
}

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      balance: 0,
      transactions: [],
      credit: (input) => {
        const balanceAfter = Math.max(0, get().balance + input.amount);
        const txn: WalletTransaction = {
          ...input,
          id: `wtxn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          balanceAfter,
          created_at: input.created_at || new Date().toISOString(),
        };
        set((s) => ({
          balance: balanceAfter,
          transactions: [txn, ...s.transactions],
        }));
        return txn;
      },
      spend: (amount, orderId) => {
        const available = get().balance;
        const actual = Math.min(available, Math.max(0, Math.round(amount)));
        if (actual <= 0) return 0;
        get().credit({
          type: "checkout_spend",
          amount: -actual,
          description: `Used at checkout for order #${orderId.slice(-8).toUpperCase()}`,
          orderId,
        });
        return actual;
      },
      reset: () => set({ balance: 0, transactions: [] }),
    }),
    { name: "atalmart-wallet" },
  ),
);

/** Friendly label for transaction type. */
export const WALLET_TXN_LABELS: Record<WalletTxnType, string> = {
  refund_return: "Return refund",
  refund_cancel: "Cancellation refund",
  referral_reward: "Referral reward",
  welcome_bonus: "Welcome bonus",
  promo_credit: "Promo credit",
  admin_adjust: "Admin adjustment",
  checkout_spend: "Used at checkout",
  expiry_writeoff: "Expired credit",
};

export const WALLET_TXN_ICON_CLASS: Record<WalletTxnType, string> = {
  refund_return: "bg-amber-50 text-amber-600",
  refund_cancel: "bg-red-50 text-red-500",
  referral_reward: "bg-green-light text-indian-green",
  welcome_bonus: "bg-saffron-light text-saffron",
  promo_credit: "bg-purple-50 text-purple-600",
  admin_adjust: "bg-blue-50 text-blue-600",
  checkout_spend: "bg-gray-100 text-gray-500",
  expiry_writeoff: "bg-gray-100 text-gray-400",
};
