"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Megaphone,
  TrendingUp,
  Users,
  Gift,
  Tag,
  QrCode,
  IndianRupee,
  Target,
  ArrowRight,
} from "lucide-react";
import { useCampaignsStore } from "@/lib/store/campaigns";
import { useCampaignAnalyticsStore } from "@/lib/store/acquisition";
import { useCouponCatalog } from "@/lib/store/coupon";
import { useReferralStore, REFERRAL_REWARD } from "@/lib/store/referrals";
import { useWalletStore } from "@/lib/store/wallet";

export default function MarketingDashboardPage() {
  const campaigns = useCampaignsStore((s) => s.campaigns);
  const analytics = useCampaignAnalyticsStore((s) => s.byCampaign);
  const coupons = useCouponCatalog((s) => s.coupons);
  const referralEvents = useReferralStore((s) => s.events);
  const walletBalance = useWalletStore((s) => s.balance);
  const walletTxns = useWalletStore((s) => s.transactions);

  // Wallet KPIs — admin needs to see outstanding liability
  const walletStats = useMemo(() => {
    let totalCredited = 0;
    let totalSpent = 0;
    let refundsIssued = 0;
    let referralsPaid = 0;
    for (const t of walletTxns) {
      if (t.amount > 0) totalCredited += t.amount;
      else totalSpent += -t.amount;
      if (t.type === "refund_return" || t.type === "refund_cancel") {
        refundsIssued += t.amount;
      }
      if (t.type === "referral_reward") {
        referralsPaid += t.amount;
      }
    }
    return {
      outstanding: walletBalance,
      totalCredited,
      totalSpent,
      refundsIssued,
      referralsPaid,
    };
  }, [walletTxns, walletBalance]);

  // ─── Acquisition totals ───────────────────────────────────────
  const totals = useMemo(() => {
    let scans = 0;
    let signups = 0;
    let orders = 0;
    let revenue = 0;
    let budgetSpent = 0;
    let activeCampaigns = 0;
    for (const c of campaigns) {
      if (c.active) activeCampaigns++;
      const a = analytics[c.source];
      if (a) {
        scans += a.scans;
        signups += a.signups;
        orders += a.orders;
        revenue += a.revenue;
      }
      budgetSpent += c.budgetInr || 0;
    }
    return {
      scans,
      signups,
      orders,
      revenue,
      budgetSpent,
      activeCampaigns,
      cpa: orders > 0 && budgetSpent > 0 ? Math.round(budgetSpent / orders) : 0,
      roi:
        revenue > 0 && budgetSpent > 0
          ? Math.round((revenue / budgetSpent) * 100)
          : 0,
      conversionRate:
        scans > 0 ? Math.round((orders / scans) * 1000) / 10 : 0,
    };
  }, [campaigns, analytics]);

  // ─── Source breakdown ────────────────────────────────────────
  const sourcesByOrders = useMemo(() => {
    return [...campaigns]
      .map((c) => ({
        ...c,
        analytics: analytics[c.source] || {
          scans: 0,
          signups: 0,
          orders: 0,
          revenue: 0,
        },
      }))
      .filter((c) => (c.analytics.orders || 0) > 0 || (c.analytics.scans || 0) > 0)
      .sort((a, b) => (b.analytics.orders || 0) - (a.analytics.orders || 0));
  }, [campaigns, analytics]);

  // ─── Coupon performance ─────────────────────────────────────
  const couponPerf = useMemo(() => {
    return [...coupons]
      .map((c) => ({ ...c, usage: c.totalUsageCount || 0 }))
      .sort((a, b) => b.usage - a.usage);
  }, [coupons]);

  // ─── Referral funnel ────────────────────────────────────────
  const referralFunnel = useMemo(() => {
    const total = referralEvents.length;
    const ordered = referralEvents.filter((e) => e.status !== "signed_up").length;
    const credited = referralEvents.filter((e) => e.status === "credited").length;
    return {
      total,
      ordered,
      credited,
      payout: credited * REFERRAL_REWARD,
      conversion: total > 0 ? Math.round((ordered / total) * 100) : 0,
    };
  }, [referralEvents]);

  const maxScans = Math.max(1, ...sourcesByOrders.map((s) => s.analytics.scans || 0));

  return (
    <div className="max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-brown flex items-center gap-2">
          <Megaphone size={22} className="text-saffron" />
          Marketing Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Track acquisition channels, coupon ROI, referral funnel — all in one
          place
        </p>
      </div>

      {/* ── Top KPIs ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <BigKpi
          icon={<QrCode size={16} />}
          label="QR scans / visits"
          value={String(totals.scans)}
          color="bg-blue-50 text-blue-600"
          sub={`${totals.activeCampaigns} active campaigns`}
        />
        <BigKpi
          icon={<Users size={16} />}
          label="New signups"
          value={String(totals.signups)}
          color="bg-purple-50 text-purple-600"
          sub={`${totals.conversionRate}% conversion`}
        />
        <BigKpi
          icon={<IndianRupee size={16} />}
          label="Revenue from campaigns"
          value={`₹${totals.revenue.toLocaleString("en-IN")}`}
          color="bg-green-light text-indian-green"
          sub={
            totals.roi > 0 ? `${totals.roi}% ROI` : "Set budget to see ROI"
          }
        />
        <BigKpi
          icon={<Target size={16} />}
          label="Avg CPA"
          value={totals.cpa > 0 ? `₹${totals.cpa}` : "—"}
          color="bg-saffron-light text-saffron"
          sub={`₹${totals.budgetSpent.toLocaleString("en-IN")} budget spent`}
        />
      </div>

      {/* ── Wallet liability + refunds ───────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-brown flex items-center gap-2">
            <IndianRupee size={16} className="text-indian-green" />
            Wallet &amp; Refunds
          </h2>
          <span className="text-[11px] text-gray-500">
            Liability = credits we owe customers
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border-2 border-amber-200 bg-amber-50/40 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">
              Outstanding liability
            </p>
            <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
              ₹{walletStats.outstanding.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-amber-600 mt-1">
              Across all wallets — pay back via repeat orders
            </p>
          </div>
          <div className="border border-gray-100 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Refunds issued
            </p>
            <p className="text-xl font-bold text-brown tabular-nums mt-1">
              ₹{walletStats.refundsIssued.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Returns + cancellations
            </p>
          </div>
          <div className="border border-gray-100 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Referral payouts
            </p>
            <p className="text-xl font-bold text-brown tabular-nums mt-1">
              ₹{walletStats.referralsPaid.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Auto-credited via /refer
            </p>
          </div>
          <div className="border border-gray-100 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Used at checkout
            </p>
            <p className="text-xl font-bold text-indian-green tabular-nums mt-1">
              ₹{walletStats.totalSpent.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Effective reuse = repeat business
            </p>
          </div>
        </div>
      </div>

      {/* ── Quick links ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Link
          href="/admin/campaigns"
          className="bg-white border border-gray-100 hover:border-saffron rounded-2xl p-4 flex items-center gap-3 group transition-colors"
        >
          <div className="w-10 h-10 bg-saffron-light text-saffron rounded-xl flex items-center justify-center">
            <QrCode size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brown">Campaigns</p>
            <p className="text-xs text-gray-500">QR posters + tracking</p>
          </div>
          <ArrowRight
            size={16}
            className="text-gray-300 group-hover:text-saffron"
          />
        </Link>
        <Link
          href="/admin/coupons"
          className="bg-white border border-gray-100 hover:border-saffron rounded-2xl p-4 flex items-center gap-3 group transition-colors"
        >
          <div className="w-10 h-10 bg-green-light text-indian-green rounded-xl flex items-center justify-center">
            <Tag size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brown">Coupons</p>
            <p className="text-xs text-gray-500">{coupons.length} active</p>
          </div>
          <ArrowRight
            size={16}
            className="text-gray-300 group-hover:text-saffron"
          />
        </Link>
      </div>

      {/* ── Acquisition by channel ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-brown flex items-center gap-2">
              <TrendingUp size={16} className="text-saffron" />
              Top performing campaigns
            </h2>
            <Link
              href="/admin/campaigns"
              className="text-xs text-saffron hover:underline"
            >
              Manage →
            </Link>
          </div>
          {sourcesByOrders.length === 0 ? (
            <EmptyHint
              icon={<QrCode size={28} />}
              text="No campaign activity yet. Create a campaign and share its QR/link."
            />
          ) : (
            <div className="space-y-3">
              {sourcesByOrders.slice(0, 6).map((c) => {
                const scans = c.analytics.scans || 0;
                const orders = c.analytics.orders || 0;
                const conv =
                  scans > 0 ? Math.round((orders / scans) * 100) : 0;
                const widthPct = (scans / maxScans) * 100;
                const cpa =
                  orders > 0 && c.budgetInr
                    ? Math.round(c.budgetInr / orders)
                    : null;
                return (
                  <div
                    key={c.id}
                    className="border-b border-gray-100 pb-3 last:border-0"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-brown truncate">
                          {c.name}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono uppercase">
                          {c.source} · {c.medium}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-bold text-indian-green tabular-nums">
                          {orders} orders
                        </p>
                        <p className="text-[10px] text-gray-500">
                          ₹{(c.analytics.revenue || 0).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-saffron"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 tabular-nums w-20 text-right">
                        {scans} scans · {conv}%
                      </span>
                      {cpa && (
                        <span
                          className={`text-[10px] font-bold tabular-nums w-16 text-right ${
                            cpa < 100
                              ? "text-indian-green"
                              : cpa < 250
                                ? "text-amber-600"
                                : "text-red-500"
                          }`}
                        >
                          CPA ₹{cpa}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Referral funnel */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-brown flex items-center gap-2">
              <Gift size={16} className="text-indian-green" />
              Referral funnel
            </h2>
            <span className="text-[11px] font-bold text-indian-green bg-green-light px-2 py-1 rounded-full">
              ₹{REFERRAL_REWARD} per referral
            </span>
          </div>
          {referralFunnel.total === 0 ? (
            <EmptyHint
              icon={<Gift size={28} />}
              text="No referrals yet. Customers can share via /refer page."
            />
          ) : (
            <>
              <div className="space-y-3 mb-4">
                <FunnelStep
                  label="Friends signed up"
                  value={referralFunnel.total}
                  pct={100}
                />
                <FunnelStep
                  label="Placed an order"
                  value={referralFunnel.ordered}
                  pct={
                    referralFunnel.total > 0
                      ? (referralFunnel.ordered / referralFunnel.total) * 100
                      : 0
                  }
                />
                <FunnelStep
                  label="Credit earned (≥ min)"
                  value={referralFunnel.credited}
                  pct={
                    referralFunnel.total > 0
                      ? (referralFunnel.credited / referralFunnel.total) * 100
                      : 0
                  }
                  color="green"
                />
              </div>
              <div className="bg-green-light/50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-green-700 font-bold">
                    Total payout
                  </p>
                  <p className="text-lg font-bold text-indian-green tabular-nums">
                    ₹{referralFunnel.payout.toLocaleString("en-IN")}
                  </p>
                </div>
                <p className="text-xs text-green-700 max-w-[140px] text-right">
                  Net: customer pays this back via repeat orders
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Coupon performance ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-brown flex items-center gap-2">
            <Tag size={16} className="text-saffron" />
            Coupon performance
          </h2>
          <Link
            href="/admin/coupons"
            className="text-xs text-saffron hover:underline"
          >
            Edit →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                <th className="text-left py-2">Code</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Flags</th>
                <th className="text-right py-2">Uses</th>
                <th className="text-right py-2">Limit</th>
                <th className="text-right py-2">% Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {couponPerf.map((c) => {
                const usagePct = c.totalUsageLimit
                  ? Math.round((c.usage / c.totalUsageLimit) * 100)
                  : null;
                return (
                  <tr key={c.code} className="hover:bg-gray-50">
                    <td className="py-3 font-mono font-bold text-brown">
                      {c.code}
                    </td>
                    <td className="py-3 text-xs text-gray-600">
                      {c.type === "flat"
                        ? `₹${c.value} flat`
                        : `${c.value}% off`}
                      {c.maxDiscount && (
                        <span className="text-gray-400 ml-1">
                          (max ₹{c.maxDiscount})
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.firstOrderOnly && (
                          <span className="text-[9px] font-bold text-saffron bg-saffron-light px-1.5 py-0.5 rounded">
                            FIRST-ORDER
                          </span>
                        )}
                        {c.campaignSource && (
                          <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            {c.campaignSource}
                          </span>
                        )}
                        {c.expiresAt && (
                          <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            EXPIRES {new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right tabular-nums font-semibold text-brown">
                      {c.usage}
                    </td>
                    <td className="py-3 text-right tabular-nums text-gray-500">
                      {c.totalUsageLimit || "∞"}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {usagePct != null ? (
                        <span
                          className={`font-bold ${
                            usagePct >= 90
                              ? "text-red-500"
                              : usagePct >= 60
                                ? "text-amber-600"
                                : "text-indian-green"
                          }`}
                        >
                          {usagePct}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BigKpi({
  icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold text-brown leading-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      <p className="text-[10px] text-gray-400 mt-1.5">{sub}</p>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  pct,
  color = "saffron",
}: {
  label: string;
  value: number;
  pct: number;
  color?: "saffron" | "green";
}) {
  const bg = color === "green" ? "bg-indian-green" : "bg-saffron";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-brown-light">{label}</span>
        <span className="text-sm font-bold text-brown tabular-nums">
          {value}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${bg}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function EmptyHint({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto text-gray-300 mb-2 w-fit">{icon}</div>
      <p className="text-sm text-gray-500 max-w-xs mx-auto">{text}</p>
    </div>
  );
}
