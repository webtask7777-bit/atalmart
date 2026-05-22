"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  IndianRupee,
  ShoppingBag,
  TrendingUp,
  XCircle,
  ChevronDown,
  ChevronRight,
  Phone,
  MapPin,
  Bike,
  FileText,
  User,
  Tag,
  FileSpreadsheet,
} from "lucide-react";
import { exportOrdersToExcel } from "@/lib/excel-export";
import { Badge } from "@/components/ui/badge";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-dialog";
import { OrderCardSkeleton } from "@/components/ui/skeleton";
import {
  useAdminOrders,
  useAdminRiders,
  updateOrderStatus,
  assignRider,
  resolveReturn,
} from "@/lib/hooks/use-admin";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import type { Order, OrderStatus } from "@/types";

const statusVariant: Record<string, "green" | "saffron" | "gray" | "red" | "navy"> = {
  placed: "gray",
  confirmed: "navy",
  picking: "saffron",
  picked: "saffron",
  out_for_delivery: "saffron",
  delivered: "green",
  cancelled: "red",
  return_requested: "saffron",
  return_approved: "green",
  return_rejected: "red",
  refunded: "green",
};

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Placed", value: "placed" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Picking", value: "picking" },
  { label: "Ready", value: "picked" },
  { label: "Out for delivery", value: "out_for_delivery" },
  { label: "Delivered", value: "delivered" },
  { label: "Returns", value: "return_requested" },
  { label: "Cancelled", value: "cancelled" },
];

const DATE_FILTERS: { label: string; value: string; days: number }[] = [
  { label: "Today", value: "today", days: 1 },
  { label: "7 days", value: "7d", days: 7 },
  { label: "30 days", value: "30d", days: 30 },
  { label: "All time", value: "all", days: 99999 },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  placed: "confirmed",
  confirmed: "picking",
  picking: "picked",
  picked: "out_for_delivery",
  out_for_delivery: "delivered",
};

const ACTIVE_STATUSES = new Set<OrderStatus>(["placed", "confirmed", "picking", "picked", "out_for_delivery"]);

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Resolve order metadata. Prefers the first-class columns (phone,
 * payment_method, coupon_code); falls back to regex on `notes` for legacy
 * orders placed before migration 003 ran.
 */
function readOrderMeta(order: { phone?: string | null; payment_method?: string | null; coupon_code?: string | null; notes: string | null }) {
  const phone =
    order.phone ||
    order.notes?.match(/Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)/)?.[1]?.trim() ||
    "";
  const payment =
    order.payment_method ||
    order.notes?.match(/Payment:\s*(\w+)/)?.[1] ||
    "";
  const coupon =
    order.coupon_code ||
    order.notes?.match(/Coupon:\s*([A-Z0-9]+)/)?.[1] ||
    null;
  return { phone, payment, coupon };
}

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const { orders, loading, refetch } = useAdminOrders(statusFilter || undefined);
  const { riders } = useAdminRiders();

  // ─── Filter pipeline ───
  const filtered = useMemo(() => {
    const days = DATE_FILTERS.find((d) => d.value === dateFilter)?.days || 99999;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (new Date(o.placed_at).getTime() < since) return false;
      if (q) {
        const { phone } = readOrderMeta(o);
        const name = o.profile?.name || "";
        const matches =
          o.id.toLowerCase().includes(q) ||
          name.toLowerCase().includes(q) ||
          phone.includes(q) ||
          o.address_line?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [orders, dateFilter, search]);

  // ─── KPI roll-up ───
  const stats = useMemo(() => {
    const revenue = filtered.reduce((s, o) => s + (o.status !== "cancelled" ? o.total : 0), 0);
    return {
      total: filtered.length,
      revenue,
      active: filtered.filter((o) => ACTIVE_STATUSES.has(o.status)).length,
      delivered: filtered.filter((o) => o.status === "delivered").length,
      cancelled: filtered.filter((o) => o.status === "cancelled").length,
      avgOrderValue: filtered.length
        ? Math.round(revenue / Math.max(1, filtered.filter((o) => o.status !== "cancelled").length))
        : 0,
    };
  }, [filtered]);

  // ─── Actions ───
  const handleNextStatus = async (order: Order) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    if (next === "out_for_delivery" && !order.rider_id) {
      toast.error("Assign a rider first");
      return;
    }
    const { error } = await updateOrderStatus(order.id, next);
    if (error) toast.error("Failed to update status");
    else {
      toast.success(`Status → ${ORDER_STATUS_LABELS[next]}`);
      refetch();
    }
  };

  const handleAssignRider = async (orderId: string, riderId: string) => {
    const { error } = await assignRider(orderId, riderId);
    if (error) toast.error("Failed to assign rider");
    else {
      toast.success("Rider assigned");
      setAssigningId(null);
      refetch();
    }
  };

  const handleCancel = async (orderId: string) => {
    const ok = await confirmDialog({
      title: "Cancel order?",
      message: "This will mark the order as cancelled and notify the customer.",
      confirmLabel: "Cancel order",
      cancelLabel: "Keep",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await updateOrderStatus(orderId, "cancelled");
    if (error) toast.error("Failed to cancel");
    else {
      toast.success("Order cancelled");
      refetch();
    }
  };

  const handleApproveReturn = async (orderId: string) => {
    const ok = await confirmDialog({
      title: "Approve return?",
      message: "Refund will be credited to the customer's wallet and WhatsApp confirmation will be sent.",
      confirmLabel: "Approve & refund",
    });
    if (!ok) return;
    const { error } = await resolveReturn(orderId, "approve");
    if (error) toast.error("Failed to approve");
    else {
      toast.success("Return approved · refund initiated · WhatsApp sent");
      refetch();
    }
  };

  const handleRejectReturn = async (orderId: string) => {
    const reason = await promptDialog({
      title: "Reject return",
      message: "Reason will be sent to the customer via WhatsApp:",
      placeholder: "e.g. Product was used / not in original condition",
      confirmLabel: "Reject return",
    });
    if (!reason || !reason.trim()) return;
    const { error } = await resolveReturn(orderId, "reject", reason);
    if (error) toast.error("Failed to reject");
    else {
      toast.success("Return rejected · customer notified");
      refetch();
    }
  };

  const availableRiders = riders.filter((r) => r.status === "available");

  return (
    <div className="max-w-7xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brown">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} orders · ₹{stats.revenue.toLocaleString("en-IN")} revenue ·{" "}
            <span className="text-saffron">{stats.active} active</span>
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              await exportOrdersToExcel(filtered);
              toast.success(`Exported ${filtered.length} orders to Excel`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Export failed");
            }
          }}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-indian-green border-2 border-indian-green rounded-xl hover:bg-green-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet size={14} />
          Export Excel
        </button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Kpi label="Orders" value={stats.total} icon={<ShoppingBag size={14} />} color="bg-blue-50 text-blue-600" />
        <Kpi
          label="Revenue"
          value={`₹${stats.revenue.toLocaleString("en-IN")}`}
          icon={<IndianRupee size={14} />}
          color="bg-saffron-light text-saffron"
        />
        <Kpi label="Avg order" value={`₹${stats.avgOrderValue}`} icon={<TrendingUp size={14} />} color="bg-purple-50 text-purple-600" />
        <Kpi label="Delivered" value={stats.delivered} icon={<ShoppingBag size={14} />} color="bg-green-light text-indian-green" />
        <Kpi label="Cancelled" value={stats.cancelled} icon={<XCircle size={14} />} color="bg-red-50 text-red-500" />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order #, customer name, phone, or address…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-saffron"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {DATE_FILTERS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDateFilter(d.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                dateFilter === d.value
                  ? "bg-saffron text-white"
                  : "bg-white text-brown-light border border-gray-200 hover:border-saffron"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1 overflow-x-auto mb-4">
        <Filter size={14} className="text-gray-400 mr-1 shrink-0" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
              statusFilter === f.value
                ? "bg-brown text-white"
                : "bg-white text-brown-light border border-gray-200 hover:border-saffron"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400">
          <ShoppingBag size={36} className="mx-auto text-gray-300 mb-2" />
          No orders match your filters
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              expanded={expandedId === order.id}
              onToggle={() => setExpandedId((id) => (id === order.id ? null : order.id))}
              onNextStatus={() => handleNextStatus(order)}
              onCancel={() => handleCancel(order.id)}
              onApproveReturn={() => handleApproveReturn(order.id)}
              onRejectReturn={() => handleRejectReturn(order.id)}
              assigningId={assigningId}
              onStartAssign={() => setAssigningId(order.id)}
              onCancelAssign={() => setAssigningId(null)}
              onAssign={(rid) => handleAssignRider(order.id, rid)}
              availableRiders={availableRiders}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Components ───

function OrderCard({
  order,
  expanded,
  onToggle,
  onNextStatus,
  onCancel,
  onApproveReturn,
  onRejectReturn,
  assigningId,
  onStartAssign,
  onCancelAssign,
  onAssign,
  availableRiders,
}: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onNextStatus: () => void;
  onCancel: () => void;
  onApproveReturn: () => void;
  onRejectReturn: () => void;
  assigningId: string | null;
  onStartAssign: () => void;
  onCancelAssign: () => void;
  onAssign: (riderId: string) => void;
  availableRiders: { id: string; name: string }[];
}) {
  const { phone, payment, coupon } = readOrderMeta(order);
  const profileName = order.profile?.name || "Customer";
  const placedDate = formatDate(order.placed_at);
  const placedTime = formatTime(order.placed_at);
  const isActive = ACTIVE_STATUSES.has(order.status);

  return (
    <div
      className={`bg-white rounded-2xl border transition-all overflow-hidden ${
        expanded ? "border-saffron shadow-sm" : "border-gray-100 hover:border-saffron/30"
      }`}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        <div className="shrink-0 mt-0.5">
          {expanded ? (
            <ChevronDown size={16} className="text-saffron" />
          ) : (
            <ChevronRight size={16} className="text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-bold text-brown font-mono text-sm">
              #{order.id.slice(-8).toUpperCase()}
            </span>
            <Badge variant={statusVariant[order.status]}>
              {ORDER_STATUS_LABELS[order.status] || order.status}
            </Badge>
            {coupon && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indian-green bg-green-light px-1.5 py-0.5 rounded">
                <Tag size={9} /> {coupon}
              </span>
            )}
          </div>
          <p className="text-sm text-brown-light truncate">
            <span className="font-medium text-brown">{profileName}</span>
            {phone && ` · ${phone}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-brown leading-tight">₹{order.total}</p>
          <p className="text-[11px] text-gray-500">
            {placedDate} · {placedTime}
          </p>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/40">
          {/* Address + delivery info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DetailRow icon={<MapPin size={12} />} label="Delivery">
              <span className="text-brown-light leading-snug">
                {order.address_line || "—"}
              </span>
            </DetailRow>
            <DetailRow icon={<User size={12} />} label="Payment">
              <span className="text-brown capitalize">{payment || "—"}</span>
              {order.discount > 0 && (
                <span className="ml-1.5 text-xs text-indian-green">
                  · ₹{order.discount} off
                </span>
              )}
            </DetailRow>
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              Items ({order.items?.length || 0})
            </h4>
            {(order.items || []).length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">No line items recorded</p>
            ) : (
              <ul className="text-sm space-y-1.5">
                {(order.items || []).map((it) => (
                  <li key={it.id} className="flex justify-between text-brown-light">
                    <span className="truncate flex-1">
                      <span className="text-brown font-medium">{it.product_name}</span>
                      <span className="text-gray-400 text-xs ml-1">× {it.quantity}</span>
                    </span>
                    <span className="text-brown font-medium shrink-0 tabular-nums">
                      ₹{it.price * it.quantity}
                    </span>
                  </li>
                ))}
                <li className="border-t border-gray-100 pt-1.5 mt-1.5 flex justify-between font-bold text-brown">
                  <span>Total</span>
                  <span className="tabular-nums">₹{order.total}</span>
                </li>
              </ul>
            )}
          </div>

          {/* Return request details (when applicable) */}
          {order.return_info && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">
                    Return request
                  </h4>
                  <p className="text-sm text-amber-900 font-semibold">
                    {order.return_info.reason}
                  </p>
                  {order.return_info.notes && (
                    <p className="text-xs text-amber-800 mt-1 italic">
                      &ldquo;{order.return_info.notes}&rdquo;
                    </p>
                  )}
                  <p className="text-[10px] text-amber-600 mt-1">
                    Requested {formatDate(order.return_info.requested_at)} at{" "}
                    {formatTime(order.return_info.requested_at)}
                  </p>
                </div>
                {order.return_info.refund_amount != null && (
                  <div className="bg-white border border-amber-300 rounded-lg px-3 py-2 text-right shrink-0">
                    <p className="text-[9px] uppercase tracking-wider text-amber-700 font-bold">
                      Refund
                    </p>
                    <p className="text-base font-bold text-amber-700 tabular-nums">
                      ₹{order.return_info.refund_amount}
                    </p>
                    <p className="text-[9px] text-amber-600">
                      of ₹{order.total} order
                    </p>
                  </div>
                )}
              </div>

              {/* Returned items breakdown */}
              {order.return_info.items && order.return_info.items.length > 0 && (
                <div className="mt-2 pt-2 border-t border-amber-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">
                    Items selected ({order.return_info.items.length})
                  </p>
                  <ul className="text-xs space-y-0.5">
                    {order.return_info.items.map((it) => (
                      <li
                        key={it.order_item_id}
                        className="flex justify-between text-amber-900"
                      >
                        <span>
                          {it.product_name} ×{it.quantity}
                          <span className="text-amber-600 text-[10px] ml-1">
                            (@ ₹{it.unit_price})
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">
                          ₹{it.quantity * it.unit_price}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {isActive && (
              <>
                <button
                  onClick={onNextStatus}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indian-green text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
                >
                  {ORDER_STATUS_LABELS[NEXT_STATUS[order.status]!] || "Next"} →
                </button>

                {!order.rider_id ? (
                  assigningId === order.id ? (
                    <select
                      autoFocus
                      onChange={(e) => e.target.value && onAssign(e.target.value)}
                      onBlur={onCancelAssign}
                      className="px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white"
                    >
                      <option value="">Select rider…</option>
                      {availableRiders.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                      {availableRiders.length === 0 && <option disabled>No riders available</option>}
                    </select>
                  ) : (
                    <button
                      onClick={onStartAssign}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-brown text-xs font-semibold rounded-lg border border-gray-200 hover:border-saffron"
                    >
                      <Bike size={12} />
                      Assign Rider
                    </button>
                  )
                ) : (
                  order.rider && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-brown-light bg-white border border-gray-200 rounded-lg">
                      <Bike size={12} className="text-saffron" />
                      {order.rider.name}
                      {order.rider.phone && (
                        <a
                          href={`tel:${order.rider.phone}`}
                          aria-label="Call rider"
                          className="ml-1 p-0.5 text-indian-green hover:bg-green-light rounded"
                        >
                          <Phone size={11} />
                        </a>
                      )}
                    </span>
                  )
                )}

                {["placed", "confirmed", "picking"].includes(order.status) && (
                  <button
                    onClick={onCancel}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-red-500 text-xs font-semibold rounded-lg border border-red-200 hover:bg-red-50"
                  >
                    <XCircle size={12} />
                    Cancel
                  </button>
                )}
              </>
            )}

            {/* Return approval workflow */}
            {order.status === "return_requested" && (
              <>
                <button
                  onClick={onApproveReturn}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indian-green text-white text-xs font-bold rounded-lg hover:bg-green-700"
                >
                  ✓ Approve return
                </button>
                <button
                  onClick={onRejectReturn}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-red-500 text-xs font-semibold rounded-lg border border-red-200 hover:bg-red-50"
                >
                  ✗ Reject
                </button>
              </>
            )}

            <a
              href={`/invoice/${order.id}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-brown text-xs font-semibold rounded-lg border border-gray-200 hover:border-saffron ml-auto"
            >
              <FileText size={12} />
              Invoice
            </a>
            <Link
              href={`/admin/customers/${order.user_id}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-brown text-xs font-semibold rounded-lg border border-gray-200 hover:border-saffron"
            >
              <User size={12} />
              Customer
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">
        {icon}
        {label}
      </p>
      <div>{children}</div>
    </div>
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
