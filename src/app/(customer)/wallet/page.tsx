"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wallet,
  ArrowDown,
  ArrowUp,
  Gift,
  RotateCcw,
  XCircle,
  Sparkles,
  Settings,
  TrendingDown,
  Calendar,
} from "lucide-react";
import {
  useWalletStore,
  WALLET_TXN_LABELS,
  WALLET_TXN_ICON_CLASS,
  type WalletTxnType,
} from "@/lib/store/wallet";

const TXN_ICON: Record<WalletTxnType, React.ReactNode> = {
  refund_return: <RotateCcw size={14} />,
  refund_cancel: <XCircle size={14} />,
  referral_reward: <Gift size={14} />,
  welcome_bonus: <Sparkles size={14} />,
  promo_credit: <Sparkles size={14} />,
  admin_adjust: <Settings size={14} />,
  checkout_spend: <ArrowUp size={14} />,
  expiry_writeoff: <TrendingDown size={14} />,
};

export default function WalletPage() {
  const balance = useWalletStore((s) => s.balance);
  const transactions = useWalletStore((s) => s.transactions);

  const summary = useMemo(() => {
    let totalCredited = 0;
    let totalSpent = 0;
    for (const t of transactions) {
      if (t.amount > 0) totalCredited += t.amount;
      else totalSpent += -t.amount;
    }
    return { totalCredited, totalSpent };
  }, [transactions]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="p-2 rounded-full hover:bg-saffron-light transition-colors"
        >
          <ArrowLeft size={20} className="text-brown" />
        </Link>
        <h1 className="text-xl font-bold text-brown">My Wallet</h1>
      </div>

      {/* Balance card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indian-green via-green-600 to-emerald-700 rounded-3xl p-6 text-white mb-5">
        <div className="absolute -right-6 -bottom-6 text-8xl opacity-15 select-none pointer-events-none">
          💰
        </div>
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">
            Atalmart Wallet
          </p>
          <p className="text-4xl font-bold leading-tight tabular-nums">
            ₹{balance.toLocaleString("en-IN")}
          </p>
          <p className="text-xs opacity-80 mt-2">
            Auto-applied at checkout · No expiry on refund credits
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="w-8 h-8 bg-green-light text-indian-green rounded-lg flex items-center justify-center mb-2">
            <ArrowDown size={14} />
          </div>
          <p className="text-xl font-bold text-brown leading-tight tabular-nums">
            ₹{summary.totalCredited.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Total credited</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center mb-2">
            <ArrowUp size={14} />
          </div>
          <p className="text-xl font-bold text-brown leading-tight tabular-nums">
            ₹{summary.totalSpent.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Total spent</p>
        </div>
      </div>

      {/* How to earn (when no balance + no history) */}
      {transactions.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
          <h3 className="font-bold text-brown mb-3">How to earn wallet credit</h3>
          <ul className="space-y-3 text-sm">
            <EarnRow
              icon={<Gift size={16} className="text-indian-green" />}
              title="Refer friends — ₹50 each"
              desc="Friend orders ₹199+, both of you get ₹50 credit"
              href="/refer"
            />
            <EarnRow
              icon={<RotateCcw size={16} className="text-amber-600" />}
              title="Return refunds"
              desc="Damaged item? Get full refund as wallet credit, instant"
            />
            <EarnRow
              icon={<XCircle size={16} className="text-red-500" />}
              title="Cancellation refunds"
              desc="Cancelled prepaid orders → instant wallet credit"
            />
          </ul>
        </div>
      )}

      {/* Transactions */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-brown">Transaction history</h3>
          {transactions.length > 0 && (
            <span className="text-xs text-gray-500">
              {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-10">
            <Wallet size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) => {
              const isCredit = t.amount > 0;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${WALLET_TXN_ICON_CLASS[t.type]}`}
                  >
                    {TXN_ICON[t.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brown truncate">
                      {t.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                        {WALLET_TXN_LABELS[t.type]}
                      </span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <Calendar size={9} />
                        {new Date(t.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        isCredit ? "text-indian-green" : "text-gray-500"
                      }`}
                    >
                      {isCredit ? "+" : "−"}₹
                      {Math.abs(t.amount).toLocaleString("en-IN")}
                    </p>
                    <p className="text-[10px] text-gray-400 tabular-nums">
                      Bal: ₹{t.balanceAfter.toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-gray-400 mt-4 text-center leading-relaxed">
        Wallet credits never expire on refunds. Promo credits may have an
        expiry. For questions, contact webtask7777@gmail.com
      </p>
    </div>
  );
}

function EarnRow({
  icon,
  title,
  desc,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href?: string;
}) {
  const content = (
    <li className="flex items-start gap-3 group">
      <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-brown">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      {href && (
        <span className="text-xs text-saffron group-hover:underline shrink-0">
          Refer now →
        </span>
      )}
    </li>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
