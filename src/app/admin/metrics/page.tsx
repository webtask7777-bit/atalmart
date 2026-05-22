"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  IndianRupee,
  ShoppingBag,
  Users,
  Package,
  AlertTriangle,
  Clock,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRupees } from "@/lib/money";
import { toast } from "sonner";

/**
 * Admin metrics dashboard. Pulls a single JSONB snapshot from the
 * `get_metrics_snapshot` Postgres function plus the top-products,
 * stock-alerts and coupon-performance views. Vercel Analytics (page views,
 * RUM Web Vitals) is collected separately and shown in the Vercel dashboard.
 *
 * Disabled in demo mode — needs live Supabase to be meaningful.
 */

type Snapshot = {
  updated_at: string;
  totals: { lifetime_orders: number; lifetime_revenue: number; lifetime_aov: number; lifetime_customers: number };
  today: { orders: number; revenue: number; aov: number };
  this_week: { orders: number; revenue: number };
  stock_alerts: { out_of_stock: number; critical: number; low: number };
  catalog: { total_products: number; total_categories: number };
  pending_orders: Record<string, number>;
};

type TopProduct = { product_id: string; product_name: string; units_sold: number; gross_revenue: number; unique_orders: number };
type StockAlert = { id: string; name: string; stock: number; alert_level: "out_of_stock" | "critical" | "low" };
type CouponMetric = { coupon_code: string; uses: number; revenue_with_coupon: number; discount_given: number; avg_order_value: number };
type DailyOrder = { day: string; orders: number; revenue: number; avg_order_value: number };

export default function AdminMetricsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [stock, setStock] = useState<StockAlert[]>([]);
  const [coupons, setCoupons] = useState<CouponMetric[]>([]);
  const [daily, setDaily] = useState<DailyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (isDemoMode()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const [snapRes, topRes, stockRes, couponRes, dailyRes] = await Promise.all([
        supabase.rpc("get_metrics_snapshot"),
        supabase.from("metrics_top_products").select("*"),
        supabase.from("metrics_stock_alerts").select("*").limit(50),
        supabase.from("metrics_coupons").select("*"),
        supabase.from("metrics_daily_orders").select("*"),
      ]);
      if (snapRes.data) setSnapshot(snapRes.data as Snapshot);
      if (topRes.data) setTop(topRes.data as TopProduct[]);
      if (stockRes.data) setStock(stockRes.data as StockAlert[]);
      if (couponRes.data) setCoupons(couponRes.data as CouponMetric[]);
      if (dailyRes.data) setDaily(dailyRes.data as DailyOrder[]);
    } catch (err) {
      console.error("[metrics] fetch failed", err);
      toast.error("Failed to load metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  if (isDemoMode()) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertTriangle size={48} className="text-yellow-500 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-brown mb-2">Metrics unavailable in demo mode</h1>
        <p className="text-sm text-gray-600">
          Connect a real Supabase project (set <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code>)
          to populate live KPIs.
        </p>
      </div>
    );
  }

  const updated = snapshot
    ? new Date(snapshot.updated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brown">Metrics</h1>
          <p className="text-sm text-gray-500">Live KPIs from Supabase · refreshed {updated}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={loading}
            onClick={fetchAll}
          >
            <RefreshCw size={14} /> Refresh
          </Button>
          <a
            href="https://vercel.com/analytics"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-saffron hover:underline"
          >
            Vercel Analytics <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          icon={ShoppingBag}
          label="Orders today"
          value={snapshot?.today.orders ?? 0}
          accent="saffron"
        />
        <KPI
          icon={IndianRupee}
          label="Revenue today"
          value={formatRupees(snapshot?.today.revenue ?? 0)}
          accent="green"
        />
        <KPI
          icon={TrendingUp}
          label="AOV today"
          value={formatRupees(snapshot?.today.aov ?? 0)}
          accent="blue"
        />
        <KPI
          icon={Users}
          label="Lifetime customers"
          value={snapshot?.totals.lifetime_customers ?? 0}
          accent="purple"
        />
      </div>

      {/* This week + lifetime */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="This week">
          <Row label="Orders" value={snapshot?.this_week.orders ?? 0} />
          <Row label="Revenue" value={formatRupees(snapshot?.this_week.revenue ?? 0)} />
        </Card>
        <Card title="Lifetime">
          <Row label="Total orders" value={snapshot?.totals.lifetime_orders ?? 0} />
          <Row label="Total revenue" value={formatRupees(snapshot?.totals.lifetime_revenue ?? 0)} />
          <Row label="Lifetime AOV" value={formatRupees(snapshot?.totals.lifetime_aov ?? 0)} />
        </Card>
      </div>

      {/* Pending orders breakdown */}
      <Card title="Active orders" subtitle="Orders not yet delivered, by status">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {snapshot &&
            Object.entries(snapshot.pending_orders).map(([k, v]) => (
              <div key={k} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-brown">{v}</p>
                <p className="text-xs text-gray-500 capitalize mt-0.5">
                  {k.replace(/_/g, " ")}
                </p>
              </div>
            ))}
        </div>
      </Card>

      {/* Catalog + stock alerts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Catalog" subtitle="Active SKUs and categories">
          <Row label="Active products" value={snapshot?.catalog.total_products ?? 0} icon={Package} />
          <Row label="Categories" value={snapshot?.catalog.total_categories ?? 0} icon={Package} />
        </Card>
        <Card
          title="Stock alerts"
          subtitle="Products needing reorder"
          accent={
            (snapshot?.stock_alerts.out_of_stock ?? 0) > 0 ? "danger" : "warning"
          }
        >
          <Row label="Out of stock" value={snapshot?.stock_alerts.out_of_stock ?? 0} highlight={(snapshot?.stock_alerts.out_of_stock ?? 0) > 0 ? "red" : undefined} />
          <Row label="Critical (< 5)" value={snapshot?.stock_alerts.critical ?? 0} highlight={(snapshot?.stock_alerts.critical ?? 0) > 0 ? "orange" : undefined} />
          <Row label="Low (< 15)" value={snapshot?.stock_alerts.low ?? 0} />
        </Card>
      </div>

      {/* Top selling products */}
      <Card title="Top products (30 days)" subtitle={`${top.length} ranked by units sold`}>
        {top.length === 0 ? (
          <Empty msg="No sales yet — top products will appear once orders come in." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b border-gray-100">
              <tr>
                <th className="text-left py-2 font-medium">Product</th>
                <th className="text-right py-2 font-medium">Units</th>
                <th className="text-right py-2 font-medium">Orders</th>
                <th className="text-right py-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.product_id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 font-medium text-brown">{p.product_name}</td>
                  <td className="py-2 text-right font-mono">{p.units_sold}</td>
                  <td className="py-2 text-right font-mono text-gray-500">{p.unique_orders}</td>
                  <td className="py-2 text-right font-mono text-indian-green font-semibold">{formatRupees(p.gross_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Coupon performance */}
      <Card title="Coupon performance (30 days)" subtitle={`${coupons.length} active codes`}>
        {coupons.length === 0 ? (
          <Empty msg="No coupon redemptions in the last 30 days." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b border-gray-100">
              <tr>
                <th className="text-left py-2 font-medium">Code</th>
                <th className="text-right py-2 font-medium">Uses</th>
                <th className="text-right py-2 font-medium">Discount given</th>
                <th className="text-right py-2 font-medium">Revenue</th>
                <th className="text-right py-2 font-medium">Avg order</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.coupon_code} className="border-b border-gray-50 last:border-0">
                  <td className="py-2"><Badge variant="saffron">{c.coupon_code}</Badge></td>
                  <td className="py-2 text-right font-mono">{c.uses}</td>
                  <td className="py-2 text-right font-mono text-red-500">-{formatRupees(c.discount_given)}</td>
                  <td className="py-2 text-right font-mono text-indian-green font-semibold">{formatRupees(c.revenue_with_coupon)}</td>
                  <td className="py-2 text-right font-mono">{formatRupees(c.avg_order_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Stock alerts detail */}
      {stock.length > 0 && (
        <Card title={`Products needing reorder (${stock.length})`} subtitle="Sorted by lowest stock first" accent="warning">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
            {stock.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border ${
                  s.alert_level === "out_of_stock"
                    ? "bg-red-50 border-red-200"
                    : s.alert_level === "critical"
                      ? "bg-orange-50 border-orange-200"
                      : "bg-yellow-50 border-yellow-200"
                }`}
              >
                <span className="font-medium text-brown truncate">{s.name}</span>
                <span className="font-mono text-xs shrink-0">
                  {s.stock === 0 ? "OUT" : `${s.stock} left`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Daily orders mini-chart */}
      <Card title="Daily orders (30 days)" subtitle={`${daily.length} days with activity`}>
        {daily.length === 0 ? (
          <Empty msg="No orders in the last 30 days yet." />
        ) : (
          <div className="flex items-end gap-1 h-32">
            {daily.slice(0, 30).reverse().map((d) => {
              const max = Math.max(...daily.map((x) => x.orders), 1);
              const heightPct = (d.orders / max) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.orders} orders, ${formatRupees(d.revenue)}`}>
                  <div className="w-full bg-saffron rounded-t-sm" style={{ height: `${heightPct}%` }} />
                  <span className="text-[9px] text-gray-400">{d.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* External links */}
      <Card title="External dashboards" subtitle="Live data sources">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ExtLink
            label="Vercel Analytics"
            sub="Page views, top pages, browsers, countries"
            href="https://vercel.com/dashboard"
          />
          <ExtLink
            label="Vercel Speed Insights"
            sub="Core Web Vitals (LCP, CLS, FCP) per page"
            href="https://vercel.com/dashboard"
          />
          <ExtLink
            label="Supabase Reports"
            sub="DB performance, auth events, API calls"
            href="https://supabase.com/dashboard/project/mplrmucaegburmvupjny/reports/api-overview"
          />
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Sub-components — kept inline since they're page-specific.
// ────────────────────────────────────────────────────────────────

function KPI({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: number | string;
  accent: "saffron" | "green" | "blue" | "purple";
}) {
  const accentClasses = {
    saffron: "text-saffron bg-saffron-light",
    green: "text-indian-green bg-green-50",
    blue: "text-blue-600 bg-blue-50",
    purple: "text-purple-600 bg-purple-50",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentClasses[accent]}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className="text-2xl font-bold text-brown">{value}</p>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: "danger" | "warning";
}) {
  const accentBorder =
    accent === "danger" ? "border-red-200" : accent === "warning" ? "border-yellow-200" : "border-gray-100";
  return (
    <div className={`bg-white rounded-xl border p-5 ${accentBorder}`}>
      <div className="mb-3">
        <h3 className="text-base font-semibold text-brown">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number | string;
  icon?: typeof TrendingUp;
  highlight?: "red" | "orange";
}) {
  const highlightClass =
    highlight === "red" ? "text-red-600 font-bold" : highlight === "orange" ? "text-orange-600 font-bold" : "text-brown font-semibold";
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600 flex items-center gap-2">
        {Icon && <Icon size={14} className="text-gray-400" />}
        {label}
      </span>
      <span className={`text-sm ${highlightClass}`}>{value}</span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="text-center py-6 text-sm text-gray-400 flex flex-col items-center gap-2">
      <Clock size={24} className="text-gray-300" />
      {msg}
    </div>
  );
}

function ExtLink({ label, sub, href }: { label: string; sub: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block p-3 rounded-lg border border-gray-100 hover:border-saffron hover:bg-saffron-light/30 transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="font-semibold text-brown text-sm">{label}</span>
        <ExternalLink size={11} className="text-gray-400" />
      </div>
      <p className="text-xs text-gray-500">{sub}</p>
    </a>
  );
}
