"use client";

import { useMemo } from "react";
import {
  TrendingUp,
  IndianRupee,
  ShoppingCart,
  Users,
  Package,
  Repeat,
  XCircle,
  Award,
} from "lucide-react";
import { useAdminOrders } from "@/lib/hooks/use-admin";
import { useAllProducts } from "@/lib/hooks/use-products";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import type { Order } from "@/types";

export default function AdminAnalyticsPage() {
  const { orders, loading: ordersLoading } = useAdminOrders();
  const { products, loading: productsLoading } = useAllProducts();
  const loading = ordersLoading || productsLoading;

  const analytics = useMemo(() => buildAnalytics(orders), [orders]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brown">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Last 7 days · {analytics.totalOrders} orders · ₹{analytics.totalRevenue.toLocaleString("en-IN")} revenue
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile
          label="Revenue (7d)"
          value={`₹${analytics.totalRevenue.toLocaleString("en-IN")}`}
          icon={IndianRupee}
          color="bg-saffron-light text-saffron"
          trend={analytics.revenueTrend}
        />
        <KpiTile
          label="Orders (7d)"
          value={String(analytics.totalOrders)}
          icon={ShoppingCart}
          color="bg-blue-50 text-blue-600"
          trend={analytics.ordersTrend}
        />
        <KpiTile
          label="Avg order value"
          value={`₹${analytics.aov}`}
          icon={TrendingUp}
          color="bg-green-light text-indian-green"
        />
        <KpiTile
          label="Customers"
          value={String(analytics.uniqueCustomers)}
          icon={Users}
          color="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Revenue trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-bold text-brown">Revenue trend</h2>
            <span className="text-xs text-gray-500">Last 7 days</span>
          </div>
          <LineChart points={analytics.dailyRevenue} />
        </div>
        {/* Status donut */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
          <h2 className="font-bold text-brown mb-3">Order status</h2>
          <DonutChart segments={analytics.statusBreakdown} />
        </div>
      </div>

      {/* Top products + Repeat customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award size={16} className="text-saffron" />
            <h2 className="font-bold text-brown">Top selling products</h2>
          </div>
          {analytics.topProducts.length === 0 ? (
            <EmptyHint icon={Package} label="No sales yet" />
          ) : (
            <div className="space-y-3">
              {analytics.topProducts.map((p, i) => {
                const product = products.find((pr) => pr.id === p.id);
                const maxQty = analytics.topProducts[0].qty;
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="w-6 text-center text-xs font-bold text-gray-400">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brown truncate">
                        {product?.name || p.name}
                      </p>
                      <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-saffron"
                          style={{ width: `${(p.qty / maxQty) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-brown">{p.qty} sold</p>
                      <p className="text-xs text-gray-500">
                        ₹{p.revenue.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Repeat size={16} className="text-indian-green" />
            <h2 className="font-bold text-brown">Customer insights</h2>
          </div>
          <div className="space-y-3">
            <InsightRow
              label="Repeat customers"
              value={String(analytics.repeatCustomers)}
              sub={
                analytics.uniqueCustomers > 0
                  ? `${Math.round((analytics.repeatCustomers / analytics.uniqueCustomers) * 100)}% repeat rate`
                  : ""
              }
              icon={<Repeat size={16} className="text-indian-green" />}
            />
            <InsightRow
              label="Avg orders per customer"
              value={analytics.uniqueCustomers ? (analytics.totalOrders / analytics.uniqueCustomers).toFixed(1) : "0"}
              sub="last 7 days"
              icon={<TrendingUp size={16} className="text-saffron" />}
            />
            <InsightRow
              label="Cancellation rate"
              value={`${analytics.cancelRate}%`}
              sub={`${analytics.cancelled} cancelled`}
              icon={<XCircle size={16} className="text-red-500" />}
            />
            <InsightRow
              label="Customer lifetime value (avg)"
              value={`₹${analytics.ltv}`}
              sub="all-time spend / customer"
              icon={<IndianRupee size={16} className="text-purple-600" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────── Components ─────────────

function KpiTile({
  label,
  value,
  icon: Icon,
  color,
  trend,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  trend?: number;
}) {
  const up = (trend ?? 0) > 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        <Icon size={18} />
      </div>
      <p className="text-xl font-bold text-brown leading-tight">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-gray-500">{label}</p>
        {trend !== undefined && trend !== 0 && (
          <span
            className={`text-[10px] font-bold ${up ? "text-indian-green" : "text-red-500"}`}
          >
            {up ? "▲" : "▼"} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}

function LineChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 600;
  const H = 180;
  const PAD = { top: 10, right: 10, bottom: 24, left: 32 };
  const max = Math.max(...points.map((p) => p.value), 100);

  const x = (i: number) =>
    PAD.left + (i / Math.max(points.length - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const area = `${path} L ${x(points.length - 1)} ${H - PAD.bottom} L ${x(0)} ${H - PAD.bottom} Z`;

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
        <defs>
          <linearGradient id="rev-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FF6B00" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* y-axis labels */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#f3f4f6"
              strokeWidth="1"
            />
            <text x={4} y={y(max * f) + 4} fontSize="10" fill="#9ca3af">
              ₹{Math.round(max * f)}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#rev-gradient)" />
        <path d={path} fill="none" stroke="#FF6B00" strokeWidth="2.5" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke="#FF6B00" strokeWidth="2" />
            <text
              x={x(i)}
              y={H - 6}
              fontSize="10"
              fill="#6b7280"
              textAnchor="middle"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <EmptyHint icon={ShoppingCart} label="No orders yet" />;
  }
  const R = 60;
  const C = 2 * Math.PI * R;

  // Pre-compute cumulative offsets so we don't mutate during render
  const arcs = segments.reduce<
    { label: string; color: string; len: number; offset: number }[]
  >((acc, seg) => {
    const len = (seg.value / total) * C;
    const prevOffset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    acc.push({ label: seg.label, color: seg.color, len, offset: prevOffset });
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <g transform="translate(90 90) rotate(-90)">
          <circle r={R} fill="none" stroke="#f3f4f6" strokeWidth="22" />
          {arcs.map((seg) => (
            <circle
              key={seg.label}
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth="22"
              strokeDasharray={`${seg.len} ${C - seg.len}`}
              strokeDashoffset={-seg.offset}
            />
          ))}
        </g>
        <text
          x="90"
          y="86"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="#1a1a1a"
        >
          {total}
        </text>
        <text x="90" y="106" textAnchor="middle" fontSize="11" fill="#6b7280">
          orders
        </text>
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="text-brown-light">
              {s.label} <b className="text-brown">{s.value}</b>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightRow({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
      {icon && (
        <div className="shrink-0 w-9 h-9 bg-white rounded-lg flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-base font-bold text-brown">{value}</p>
      </div>
      {sub && <p className="text-xs text-brown-light text-right">{sub}</p>}
    </div>
  );
}

function EmptyHint({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <div className="py-12 text-center">
      <Icon size={28} className="mx-auto text-gray-300 mb-2" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

// ───────────── Aggregation ─────────────

const STATUS_COLORS: Record<string, string> = {
  placed: "#9ca3af",
  confirmed: "#3b82f6",
  picking: "#eab308",
  picked: "#a855f7",
  out_for_delivery: "#FF6B00",
  delivered: "#138808",
  cancelled: "#ef4444",
};

function buildAnalytics(orders: Order[]) {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const last7Start = now - 7 * oneDay;
  const prev7Start = now - 14 * oneDay;

  const within = (order: Order, after: number, before: number) => {
    const t = new Date(order.placed_at).getTime();
    return t >= after && t < before;
  };

  const last7 = orders.filter((o) => within(o, last7Start, now));
  const prev7 = orders.filter((o) => within(o, prev7Start, last7Start));

  const totalRevenue = last7.reduce((s, o) => s + o.total, 0);
  const prevRevenue = prev7.reduce((s, o) => s + o.total, 0);
  const revenueTrend = prevRevenue
    ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100)
    : 0;
  const ordersTrend = prev7.length
    ? Math.round(((last7.length - prev7.length) / prev7.length) * 100)
    : 0;

  // Daily revenue for the last 7 days
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const dailyRevenue: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now - i * oneDay);
    day.setHours(0, 0, 0, 0);
    const next = day.getTime() + oneDay;
    const dayOrders = orders.filter((o) => within(o, day.getTime(), next));
    dailyRevenue.push({
      label: dayLabels[day.getDay()],
      value: dayOrders.reduce((s, o) => s + o.total, 0),
    });
  }

  // Status breakdown of last 7d
  const statusCounts: Record<string, number> = {};
  last7.forEach((o) => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  });
  const statusBreakdown = Object.entries(statusCounts)
    .map(([k, v]) => ({
      label: ORDER_STATUS_LABELS[k] || k,
      value: v,
      color: STATUS_COLORS[k] || "#6b7280",
    }))
    .sort((a, b) => b.value - a.value);

  // Top products
  type ProdAgg = { id: string; name: string; qty: number; revenue: number };
  const prodMap = new Map<string, ProdAgg>();
  last7.forEach((o) => {
    (o.items || []).forEach((it) => {
      const cur = prodMap.get(it.product_id) || {
        id: it.product_id,
        name: it.product_name,
        qty: 0,
        revenue: 0,
      };
      cur.qty += it.quantity;
      cur.revenue += it.price * it.quantity;
      prodMap.set(it.product_id, cur);
    });
  });
  const topProducts = Array.from(prodMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Customers
  const customerOrderCounts = new Map<string, number>();
  orders.forEach((o) => {
    customerOrderCounts.set(o.user_id, (customerOrderCounts.get(o.user_id) || 0) + 1);
  });
  const uniqueCustomers = customerOrderCounts.size;
  const repeatCustomers = Array.from(customerOrderCounts.values()).filter((n) => n > 1).length;

  // LTV
  const customerSpend = new Map<string, number>();
  orders.forEach((o) => {
    customerSpend.set(o.user_id, (customerSpend.get(o.user_id) || 0) + o.total);
  });
  const ltv = uniqueCustomers
    ? Math.round(
        Array.from(customerSpend.values()).reduce((s, n) => s + n, 0) / uniqueCustomers,
      )
    : 0;

  // Cancellation
  const cancelled = last7.filter((o) => o.status === "cancelled").length;
  const cancelRate = last7.length ? Math.round((cancelled / last7.length) * 100) : 0;

  return {
    totalRevenue,
    totalOrders: last7.length,
    revenueTrend,
    ordersTrend,
    aov: last7.length ? Math.round(totalRevenue / last7.length) : 0,
    uniqueCustomers,
    repeatCustomers,
    cancelled,
    cancelRate,
    ltv,
    dailyRevenue,
    statusBreakdown,
    topProducts,
  };
}
