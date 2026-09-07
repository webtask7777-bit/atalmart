"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  IndianRupee,
  AlertTriangle,
  Package,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePnl, type PnlRange } from "@/lib/hooks/use-pnl";
import { formatRupees } from "@/lib/money";

const RANGES: { value: PnlRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All" },
];

export default function PnlAdminPage() {
  const [range, setRange] = useState<PnlRange>("30d");
  const { summary, byProduct, loading, refetch } = usePnl(range);

  const profitPositive = summary.netProfit >= 0;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-brown flex items-center gap-2">
            <Receipt size={24} className="text-saffron" /> Profit &amp; Loss
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Revenue, cost of goods, and real profit from delivered &amp; active
            orders. Cost of goods comes from the cost frozen on each sale.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Range switch */}
      <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden text-sm w-fit my-4">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-4 py-2 ${
              range === r.value ? "bg-saffron text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {summary.ordersWithMissingCost > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {summary.ordersWithMissingCost} order
            {summary.ordersWithMissingCost > 1 ? "s" : ""} had items with no cost
            recorded — their profit is overstated. Enter costs in{" "}
            <strong>Pricing</strong> or receive stock via <strong>Purchases</strong> so
            future sales capture cost automatically.
          </span>
        </div>
      )}

      {/* Headline P&L waterfall */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <BigTile
          label="Revenue (goods)"
          value={formatRupees(summary.itemsRevenue)}
          sub={`${summary.orders} orders · avg ${formatRupees(summary.avgOrderValue)}`}
          tone="navy"
          icon={<IndianRupee size={18} />}
        />
        <BigTile
          label="Cost of goods"
          value={`− ${formatRupees(summary.cogs)}`}
          sub="what the stock cost you"
          tone="gray"
          icon={<Package size={18} />}
        />
        <BigTile
          label="Gross profit"
          value={formatRupees(summary.grossProfit)}
          sub={`${summary.grossMarginPct}% gross margin`}
          tone="green"
          icon={<TrendingUp size={18} />}
        />
      </div>

      {/* Net profit block */}
      <div
        className={`rounded-2xl p-5 mb-6 border ${
          profitPositive
            ? "bg-green-light/60 border-green-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {profitPositive ? (
                <TrendingUp size={16} className="text-indian-green" />
              ) : (
                <TrendingDown size={16} className="text-red-600" />
              )}
              Net profit ({range})
            </div>
            <div
              className={`text-3xl font-bold mt-1 ${
                profitPositive ? "text-indian-green" : "text-red-600"
              }`}
            >
              {formatRupees(summary.netProfit)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.netMarginPct}% net margin · after {formatRupees(summary.discounts)} coupon
              discounts
            </div>
          </div>

          {/* Mini breakdown */}
          <div className="text-sm text-gray-600 space-y-0.5 min-w-[220px]">
            <Row label="Gross profit" value={formatRupees(summary.grossProfit)} />
            <Row label="Coupon discounts" value={`− ${formatRupees(summary.discounts)}`} />
            <Row
              label="Net profit"
              value={formatRupees(summary.netProfit)}
              bold
            />
            <div className="pt-1 mt-1 border-t border-gray-200 text-xs text-gray-400">
              Delivery fees collected: {formatRupees(summary.deliveryFees)} (paid by
              customers; add rider payouts to net when modelled)
            </div>
          </div>
        </div>
      </div>

      {/* Per-product profit */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-brown">Profit by product</h2>
        <span className="text-xs text-gray-400">{byProduct.length} products sold</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-3 py-3 font-medium text-right">Units</th>
              <th className="px-3 py-3 font-medium text-right">Revenue</th>
              <th className="px-3 py-3 font-medium text-right">COGS</th>
              <th className="px-3 py-3 font-medium text-right">Gross profit</th>
              <th className="px-4 py-3 font-medium text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : byProduct.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-gray-400">
                  No sales in this range.
                </td>
              </tr>
            ) : (
              byProduct.slice(0, 100).map((r) => (
                <tr key={r.productId || r.productName} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 font-medium text-brown truncate max-w-[240px]">
                    {r.productName}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500">{r.unitsSold}</td>
                  <td className="px-3 py-2.5 text-right">{formatRupees(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500">
                    {formatRupees(r.cogs)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-semibold ${
                      r.grossProfit < 0 ? "text-red-600" : "text-indian-green"
                    }`}
                  >
                    {formatRupees(r.grossProfit)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.cogs === 0 ? (
                      <Badge variant="gray">no cost</Badge>
                    ) : (
                      <span
                        className={
                          r.grossMarginPct < 0 ? "text-red-600" : "text-gray-500"
                        }
                      >
                        {r.grossMarginPct}%
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BigTile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "navy" | "green" | "gray";
  icon: React.ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    navy: "bg-blue-50 text-navy",
    green: "bg-green-light text-indian-green",
    gray: "bg-gray-100 text-gray-500",
  };
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClasses[tone]}`}
        >
          {icon}
        </span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-brown">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${bold ? "font-bold text-brown" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
