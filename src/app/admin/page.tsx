"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  IndianRupee,
  Bike,
  TrendingUp,
  Clock,
  AlertCircle,
  Plus,
  Package,
  Tag,
  Image as ImageIcon,
  Users,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { useAdminStats, useAdminOrders } from "@/lib/hooks/use-admin";
import { useAllProducts, useCategories } from "@/lib/hooks/use-products";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { StoreStatusQuickToggle } from "@/components/admin/store-status-quick-toggle";

const statusColors: Record<string, string> = {
  placed: "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-50 text-blue-600",
  picking: "bg-yellow-50 text-yellow-700",
  picked: "bg-purple-50 text-purple-600",
  out_for_delivery: "bg-saffron-light text-saffron",
  delivered: "bg-green-light text-indian-green",
  cancelled: "bg-red-50 text-red-600",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const QUICK_ACTIONS = [
  { href: "/admin/products", label: "Add Product", icon: Package, color: "bg-blue-50 text-blue-600" },
  { href: "/admin/banners", label: "New Banner", icon: ImageIcon, color: "bg-purple-50 text-purple-600" },
  { href: "/admin/coupons", label: "Create Coupon", icon: Tag, color: "bg-green-light text-indian-green" },
  { href: "/admin/customers", label: "View Customers", icon: Users, color: "bg-amber-50 text-amber-600" },
];

export default function AdminDashboard() {
  const { stats, loading: statsLoading } = useAdminStats();
  const { orders, loading: ordersLoading } = useAdminOrders();
  const { products } = useAllProducts();
  const { categories } = useCategories();

  const recentOrders = orders.slice(0, 5);

  // ─── Build 7-day revenue bars from real orders ───
  const weeklyBars = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { label: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86400000);
      const nextDay = day.getTime() + 86400000;
      const dayOrders = orders.filter((o) => {
        const t = new Date(o.placed_at).getTime();
        return t >= day.getTime() && t < nextDay && o.status !== "cancelled";
      });
      days.push({
        label: ["S", "M", "T", "W", "T", "F", "S"][day.getDay()],
        revenue: dayOrders.reduce((s, o) => s + o.total, 0),
      });
    }
    const max = Math.max(...days.map((d) => d.revenue), 100);
    return { days, max };
  }, [orders]);

  // ─── Low stock alerts ───
  const lowStock = useMemo(
    () => products.filter((p) => p.active && p.stock > 0 && p.stock < 10).slice(0, 5),
    [products],
  );
  const outOfStock = useMemo(
    () => products.filter((p) => p.active && p.stock === 0).slice(0, 5),
    [products],
  );

  // ─── Active orders waiting for action ───
  const needsAttention = useMemo(() => {
    return orders
      .filter((o) => o.status === "placed" || (o.status !== "delivered" && o.status !== "cancelled" && !o.rider_id))
      .slice(0, 4);
  }, [orders]);

  if (statsLoading) return <DashboardSkeleton />;

  const statCards = [
    {
      label: "Today's Orders",
      value: String(stats.ordersToday),
      icon: ShoppingCart,
      color: "bg-saffron-light text-saffron",
      href: "/admin/orders",
    },
    {
      label: "Revenue Today",
      value: `₹${stats.revenueToday.toLocaleString("en-IN")}`,
      icon: IndianRupee,
      color: "bg-green-light text-indian-green",
      href: "/admin/analytics",
    },
    {
      label: "Pending Orders",
      value: String(stats.pendingOrders),
      icon: AlertCircle,
      color: "bg-blue-50 text-navy",
      href: "/admin/orders?filter=active",
    },
    {
      label: "Active Riders",
      value: String(stats.activeRiders),
      icon: Bike,
      color: "bg-orange-50 text-orange-600",
      href: "/admin/riders",
    },
  ];

  const hasAlerts = lowStock.length + outOfStock.length > 0 || needsAttention.length > 0;

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-brown">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Welcome back — here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock size={14} />
          <span>Live</span>
          <span className="w-2 h-2 bg-indian-green rounded-full animate-pulse" />
        </div>
      </div>

      {/* Store availability quick control (rush handling) */}
      <StoreStatusQuickToggle />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {statCards.map(({ label, value, icon: Icon, color, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-white rounded-2xl p-4 border border-gray-100 hover:border-saffron transition-colors group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={18} />
              </div>
              <ChevronRight size={14} className="text-gray-300 group-hover:text-saffron transition-colors" />
            </div>
            <p className="text-2xl font-bold text-brown">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <section className="bg-white rounded-2xl p-4 border border-gray-100 mb-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:border-saffron hover:bg-saffron-light/30 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                <Icon size={14} />
              </div>
              <span className="text-sm font-semibold text-brown">{label}</span>
              <Plus size={12} className="ml-auto text-gray-400" />
            </Link>
          ))}
        </div>
      </section>

      {/* Alerts banner */}
      {hasAlerts && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {outOfStock.length > 0 && (
            <AlertCard
              icon={<AlertTriangle size={14} />}
              tone="red"
              title={`${outOfStock.length} out of stock`}
              href="/admin/products?filter=out"
              items={outOfStock.map((p) => p.name)}
            />
          )}
          {lowStock.length > 0 && (
            <AlertCard
              icon={<AlertTriangle size={14} />}
              tone="orange"
              title={`${lowStock.length} low stock`}
              href="/admin/products?filter=low"
              items={lowStock.map((p) => `${p.name} · ${p.stock} left`)}
            />
          )}
          {needsAttention.length > 0 && (
            <AlertCard
              icon={<AlertCircle size={14} />}
              tone="blue"
              title={`${needsAttention.length} need attention`}
              href="/admin/orders"
              items={needsAttention.map((o) => `#${o.id.slice(-6).toUpperCase()} — ${o.profile?.name || "Customer"}`)}
            />
          )}
        </section>
      )}

      {/* Revenue + Recent orders */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-bold text-brown flex items-center gap-2">
              <TrendingUp size={16} className="text-indian-green" />
              7-day Revenue
            </h3>
            <Link href="/admin/analytics" className="text-xs text-saffron hover:underline">
              Full report →
            </Link>
          </div>
          {weeklyBars.days.every((d) => d.revenue === 0) ? (
            <div className="h-40 flex flex-col items-center justify-center text-gray-300">
              <TrendingUp size={32} className="mb-2" />
              <p className="text-xs">No revenue yet</p>
            </div>
          ) : (
            <div className="h-40 flex items-end justify-between gap-2 px-2">
              {weeklyBars.days.map((d, i) => {
                const heightPct = Math.max(8, (d.revenue / weeklyBars.max) * 100);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute -top-6 opacity-0 group-hover:opacity-100 text-[10px] font-bold text-brown bg-white border border-gray-200 rounded px-1.5 py-0.5 whitespace-nowrap z-10 transition-opacity">
                      ₹{d.revenue}
                    </div>
                    <div
                      className="w-full bg-saffron/80 rounded-t-lg group-hover:bg-saffron transition-colors"
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[10px] text-gray-400">{d.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-3 bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-brown">Recent Orders</h3>
            <Link href="/admin/orders" className="text-xs text-saffron hover:underline flex items-center gap-1">
              View All <ArrowRight size={12} />
            </Link>
          </div>
          {ordersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recentOrders.length > 0 ? (
            <div className="space-y-1">
              {recentOrders.map((order) => {
                const profileName = order.profile?.name;
                return (
                  <Link
                    key={order.id}
                    href={`/admin/customers/${order.user_id}`}
                    className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-brown truncate">
                        {profileName || "Customer"}
                      </p>
                      <p className="text-xs text-gray-500">
                        #{order.id.slice(-8)} &middot; {timeAgo(order.placed_at)}
                        {(order.items?.length || 0) > 0 && ` · ${order.items?.length} items`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-2 py-1 rounded-full ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span className="text-sm font-bold text-brown tabular-nums">
                        ₹{order.total}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">No orders yet</p>
          )}
        </div>
      </div>

      {/* Top categories preview */}
      <section className="mt-5 bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-brown">Categories overview</h3>
          <Link href="/admin/products" className="text-xs text-saffron hover:underline">
            Manage →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-2">
          {categories.map((cat) => {
            // Match against the real category id (UUID in live mode,
            // sort_order string in demo). Counting against `String(i+1)`
            // — the prior code — left every count at 0 in live mode.
            const count = products.filter((p) => p.category_id === cat.id).length;
            return (
              <Link
                key={cat.id}
                href={`/admin/products`}
                className="text-center p-2 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100"
              >
                <div className="text-2xl mb-1">{cat.icon}</div>
                <p className="text-[10px] font-semibold text-brown truncate leading-tight">
                  {cat.name}
                </p>
                <p className={`text-[10px] font-bold mt-0.5 ${count > 0 ? "text-saffron" : "text-gray-300"}`}>
                  {count}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AlertCard({
  icon,
  tone,
  title,
  href,
  items,
}: {
  icon: React.ReactNode;
  tone: "red" | "orange" | "blue";
  title: string;
  href: string;
  items: string[];
}) {
  const toneClasses =
    tone === "red"
      ? "border-red-200 bg-red-50/50"
      : tone === "orange"
        ? "border-orange-200 bg-orange-50/50"
        : "border-blue-200 bg-blue-50/50";
  const iconColor =
    tone === "red" ? "text-red-500" : tone === "orange" ? "text-orange-600" : "text-blue-600";
  return (
    <Link
      href={href}
      className={`rounded-2xl border-2 p-4 hover:shadow-sm transition-shadow ${toneClasses}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className={`font-bold text-sm flex items-center gap-1.5 ${iconColor}`}>
          {icon}
          {title}
        </h3>
        <ChevronRight size={14} className={iconColor} />
      </div>
      <ul className="text-xs text-brown-light space-y-0.5">
        {items.slice(0, 3).map((it, i) => (
          <li key={i} className="truncate">
            • {it}
          </li>
        ))}
        {items.length > 3 && (
          <li className="text-gray-400">+ {items.length - 3} more</li>
        )}
      </ul>
    </Link>
  );
}
