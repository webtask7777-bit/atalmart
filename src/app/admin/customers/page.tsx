"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Users,
  Phone,
  IndianRupee,
  ShoppingBag,
  ChevronRight,
  TrendingUp,
  XCircle,
  FileSpreadsheet,
} from "lucide-react";
import { useAdminOrders } from "@/lib/hooks/use-admin";
import {
  buildCustomerInsights,
  SEGMENT_LABELS,
  SEGMENT_STYLES,
  type CustomerInsight,
} from "@/lib/customer-insights";
import { exportCustomersToExcel } from "@/lib/excel-export";
import { toast } from "sonner";

const SEGMENTS = ["all", "new", "regular", "loyal", "vip", "lapsed"] as const;

export default function CustomersAdminPage() {
  const { orders, loading } = useAdminOrders();
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<(typeof SEGMENTS)[number]>("all");
  const [sort, setSort] = useState<"ltv" | "orders" | "recent">("ltv");

  const customers = useMemo(() => buildCustomerInsights(orders), [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = customers.filter((c) => {
      const matchesQ =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.user_id.toLowerCase().includes(q);
      const matchesSeg = segmentFilter === "all" || c.segment === segmentFilter;
      return matchesQ && matchesSeg;
    });
    if (sort === "orders") list = [...list].sort((a, b) => b.orderCount - a.orderCount);
    else if (sort === "recent")
      list = [...list].sort(
        (a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime(),
      );
    return list;
  }, [customers, search, segmentFilter, sort]);

  const totals = useMemo(
    () => ({
      count: customers.length,
      revenue: customers.reduce((s, c) => s + c.lifetimeValue, 0),
      repeat: customers.filter((c) => c.orderCount > 1).length,
      vip: customers.filter((c) => c.segment === "vip").length,
      lapsed: customers.filter((c) => c.segment === "lapsed").length,
      cancelled: customers.reduce((s, c) => s + c.cancelledCount, 0),
    }),
    [customers],
  );

  return (
    <div className="max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brown">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totals.count} customers · ₹{totals.revenue.toLocaleString("en-IN")} lifetime revenue
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              const rows = filtered.map((c) => ({
                profile: {
                  id: c.user_id,
                  name: c.name,
                  phone: c.phone,
                  role: "customer" as const,
                  avatar_url: null,
                  created_at: c.lastOrderAt,
                },
                ordersCount: c.orderCount,
                ltv: c.lifetimeValue,
                aov: c.avgOrderValue,
                lastOrderAt: c.lastOrderAt,
              }));
              await exportCustomersToExcel(rows);
              toast.success(`Exported ${rows.length} customers to Excel`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Export failed");
            }
          }}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-indian-green border-2 border-indian-green rounded-xl hover:bg-green-light transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet size={14} />
          Export Excel
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
        <Kpi label="Total" value={totals.count} icon={<Users size={14} />} color="bg-blue-50 text-blue-600" />
        <Kpi
          label="LTV revenue"
          value={`₹${totals.revenue.toLocaleString("en-IN")}`}
          icon={<IndianRupee size={14} />}
          color="bg-saffron-light text-saffron"
        />
        <Kpi label="Repeat" value={totals.repeat} icon={<ShoppingBag size={14} />} color="bg-green-light text-indian-green" />
        <Kpi label="VIPs" value={totals.vip} icon={<TrendingUp size={14} />} color="bg-purple-50 text-purple-600" />
        <Kpi label="Lapsed" value={totals.lapsed} icon={<Users size={14} />} color="bg-red-50 text-red-500" />
        <Kpi label="Cancelled" value={totals.cancelled} icon={<XCircle size={14} />} color="bg-gray-100 text-gray-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or user ID…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-saffron"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {SEGMENTS.map((seg) => (
            <button
              key={seg}
              onClick={() => setSegmentFilter(seg)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap capitalize transition-colors ${
                segmentFilter === seg
                  ? "bg-saffron text-white"
                  : "bg-white text-brown-light border border-gray-200 hover:border-saffron"
              }`}
            >
              {seg}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-brown-light"
          >
            <option value="ltv">Sort: LTV</option>
            <option value="orders">Sort: Orders</option>
            <option value="recent">Sort: Recent</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={36} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No customers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Orders</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">LTV</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">AOV</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Saved</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Segment</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <CustomerRow key={c.user_id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerRow({ c }: { c: CustomerInsight }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50">
      <td className="px-4 py-3">
        <Link href={`/admin/customers/${c.user_id}`} className="flex items-center gap-3 group">
          <div className="w-9 h-9 bg-saffron-light rounded-full flex items-center justify-center text-saffron font-bold text-sm shrink-0">
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-brown group-hover:text-saffron">{c.name}</p>
            <p className="text-xs text-gray-500 truncate max-w-[200px]">{c.lastAddress}</p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        {c.phone ? (
          <a
            href={`tel:${c.phone}`}
            className="inline-flex items-center gap-1.5 text-brown hover:text-saffron"
          >
            <Phone size={12} />
            {c.phone}
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 font-medium text-brown">
        {c.orderCount}
        {c.cancelledCount > 0 && (
          <span className="text-xs text-red-500 ml-1">({c.cancelledCount} ✕)</span>
        )}
      </td>
      <td className="px-4 py-3 font-bold text-indian-green">
        ₹{c.lifetimeValue.toLocaleString("en-IN")}
      </td>
      <td className="px-4 py-3 text-brown-light">₹{c.avgOrderValue}</td>
      <td className="px-4 py-3 text-saffron font-medium">
        {c.totalSaved > 0 ? `₹${c.totalSaved}` : "—"}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
        {timeAgo(c.lastOrderAt)}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${SEGMENT_STYLES[c.segment]}`}
        >
          {SEGMENT_LABELS[c.segment]}
        </span>
      </td>
      <td className="px-2 py-3">
        <Link
          href={`/admin/customers/${c.user_id}`}
          aria-label="open"
          className="p-1.5 text-gray-400 hover:text-saffron"
        >
          <ChevronRight size={16} />
        </Link>
      </td>
    </tr>
  );
}

function Kpi({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        {icon}
      </div>
      <p className="text-lg font-bold text-brown leading-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN");
}
