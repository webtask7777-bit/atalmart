"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Phone,
  Edit2,
  Trash2,
  Bike,
  TrendingUp,
  Award,
  Clock,
  Star,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  useAdminRiders,
  useAdminOrders,
  createRider,
  updateRider,
  deleteRider,
} from "@/lib/hooks/use-admin";
import { toast } from "sonner";
import { validatePhone10 } from "@/lib/validators";
import type { Rider, Order } from "@/types";

const statusVariant: Record<string, "green" | "saffron" | "gray"> = {
  available: "green",
  busy: "saffron",
  offline: "gray",
};

const emptyForm = {
  name: "",
  phone: "",
  vehicle_number: "",
  status: "available" as Rider["status"],
};

type RiderStats = {
  rider: Rider;
  total: number;
  delivered: number;
  active: number; // currently assigned, not yet delivered
  cancelled: number;
  revenue: number;
  earnings: number; // ₹20 per delivery (commission)
  completionRate: number;
  rating: number; // synthesized 4.0-5.0 based on cancellation %
  lastDeliveryAt: string | null;
};

const COMMISSION_PER_DELIVERY = 20;

export default function AdminRidersPage() {
  const { riders, loading, refetch } = useAdminRiders();
  const { orders } = useAdminOrders();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);

  // ─── Compute per-rider performance ───
  const riderStats = useMemo<RiderStats[]>(() => {
    return riders.map((r) => {
      const assigned = orders.filter((o) => o.rider_id === r.id);
      const delivered = assigned.filter((o) => o.status === "delivered");
      const cancelled = assigned.filter((o) => o.status === "cancelled");
      const active = assigned.filter((o) => !["delivered", "cancelled"].includes(o.status));
      const revenue = delivered.reduce((s, o) => s + o.total, 0);
      const completionRate = assigned.length
        ? Math.round((delivered.length / assigned.length) * 100)
        : 0;
      // Synthesize rating from completion %: 100% = 5.0, 80% = 4.0
      const rating = assigned.length
        ? Math.min(5, Math.max(3.5, 3.5 + (completionRate / 100) * 1.5))
        : 0;
      const lastDelivered = delivered.sort(
        (a, b) =>
          new Date(b.delivered_at || b.placed_at).getTime() -
          new Date(a.delivered_at || a.placed_at).getTime(),
      )[0];
      return {
        rider: r,
        total: assigned.length,
        delivered: delivered.length,
        active: active.length,
        cancelled: cancelled.length,
        revenue,
        earnings: delivered.length * COMMISSION_PER_DELIVERY,
        completionRate,
        rating,
        lastDeliveryAt: lastDelivered?.delivered_at || lastDelivered?.placed_at || null,
      };
    });
  }, [riders, orders]);

  // ─── Overall KPIs ───
  const totals = useMemo(
    () => ({
      total: riders.length,
      available: riders.filter((r) => r.status === "available").length,
      busy: riders.filter((r) => r.status === "busy").length,
      offline: riders.filter((r) => r.status === "offline").length,
      totalDelivered: riderStats.reduce((s, r) => s + r.delivered, 0),
      totalRevenue: riderStats.reduce((s, r) => s + r.revenue, 0),
    }),
    [riders, riderStats],
  );

  // ─── Leaderboard (top 3 by delivered count) ───
  const leaderboard = useMemo(
    () => [...riderStats].sort((a, b) => b.delivered - a.delivered).slice(0, 3),
    [riderStats],
  );

  const selectedStats = selectedRiderId
    ? riderStats.find((s) => s.rider.id === selectedRiderId)
    : null;
  const selectedAssignments = selectedRiderId
    ? orders.filter((o) => o.rider_id === selectedRiderId)
    : [];

  // ─── Form helpers ───
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (r: Rider) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      phone: r.phone,
      vehicle_number: r.vehicle_number || "",
      status: r.status,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    const phoneErr = validatePhone10(form.phone);
    if (phoneErr) return toast.error(phoneErr);
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await updateRider(editingId, form);
        if (error) throw error;
        toast.success("Rider updated");
      } else {
        const { error } = await createRider({ ...form, lat: null, lng: null, active: true });
        if (error) throw error;
        toast.success("Rider added");
      }
      setModalOpen(false);
      refetch();
    } catch {
      toast.error("Failed to save rider");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: `Remove rider "${name}"?`,
      message: "The rider will no longer appear in assignment lists. Past orders keep their record.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await deleteRider(id);
    if (error) toast.error("Failed to remove rider");
    else {
      toast.success("Rider removed");
      refetch();
    }
  };

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-brown">Delivery Riders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totals.total} riders · {totals.available} available · {totals.busy} on delivery ·{" "}
            {totals.totalDelivered} orders delivered
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} />
          Add Rider
        </Button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Kpi label="Total" value={totals.total} icon={<Bike size={14} />} color="bg-blue-50 text-blue-600" />
        <Kpi label="Available" value={totals.available} icon={<Activity size={14} />} color="bg-green-light text-indian-green" />
        <Kpi label="On delivery" value={totals.busy} icon={<Bike size={14} />} color="bg-saffron-light text-saffron" />
        <Kpi label="Delivered" value={totals.totalDelivered} icon={<TrendingUp size={14} />} color="bg-purple-50 text-purple-600" />
        <Kpi
          label="Revenue delivered"
          value={`₹${totals.totalRevenue.toLocaleString("en-IN")}`}
          icon={<Award size={14} />}
          color="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Leaderboard */}
      {leaderboard.some((l) => l.delivered > 0) && (
        <section className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
          <h2 className="flex items-center gap-2 font-bold text-brown mb-3">
            <Award size={16} className="text-saffron" />
            Top performers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {leaderboard.map((s, i) => {
              const podium = ["🥇", "🥈", "🥉"][i];
              const isTop = i === 0;
              return (
                <button
                  key={s.rider.id}
                  onClick={() => setSelectedRiderId(s.rider.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${
                    isTop ? "border-saffron bg-saffron-light/30" : "border-gray-100"
                  } hover:border-saffron`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{podium}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-brown truncate">{s.rider.name}</p>
                      <p className="text-xs text-gray-500">{s.rider.vehicle_number || "—"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-gray-100">
                    <Mini label="Delivered" value={s.delivered} />
                    <Mini label="Earned" value={`₹${s.earnings}`} />
                    <Mini
                      label="Rating"
                      value={s.rating.toFixed(1)}
                      icon={<Star size={10} className="text-amber-500" fill="currentColor" />}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Rider list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {riderStats.map((s) => (
            <RiderCard
              key={s.rider.id}
              stats={s}
              expanded={selectedRiderId === s.rider.id}
              onToggle={() =>
                setSelectedRiderId((cur) => (cur === s.rider.id ? null : s.rider.id))
              }
              assignments={selectedRiderId === s.rider.id ? selectedAssignments : []}
              onEdit={() => openEdit(s.rider)}
              onDelete={() => handleDelete(s.rider.id, s.rider.name)}
              onRefresh={refetch}
            />
          ))}
          {riderStats.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400">
              <Bike size={36} className="mx-auto text-gray-300 mb-2" />
              No riders added yet
            </div>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Rider" : "Add Rider"}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Rahul Kumar"
          />
          <Input
            label="Phone"
            type="tel"
            maxLength={10}
            value={form.phone}
            onChange={(e) =>
              setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "") }))
            }
            placeholder="9876543210"
          />
          <Input
            label="Vehicle Number"
            value={form.vehicle_number}
            onChange={(e) =>
              setForm((f) => ({ ...f, vehicle_number: e.target.value.toUpperCase() }))
            }
            placeholder="CG-04 AB 1234"
          />
          <div>
            <label className="block text-sm font-medium text-brown-light mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as Rider["status"] }))
              }
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-brown focus:outline-none focus:border-saffron"
            >
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <Button className="w-full" loading={saving} onClick={handleSave}>
            {editingId ? "Update Rider" : "Add Rider"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Components ───

function RiderCard({
  stats,
  expanded,
  onToggle,
  assignments,
  onEdit,
  onDelete,
  onRefresh,
}: {
  stats: RiderStats;
  expanded: boolean;
  onToggle: () => void;
  assignments: Order[];
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const r = stats.rider;
  return (
    <div
      className={`bg-white rounded-2xl border transition-colors overflow-hidden ${
        expanded ? "border-saffron" : "border-gray-100 hover:border-saffron/30"
      }`}
    >
      <div className="p-4 flex items-center gap-3">
        <button
          onClick={onToggle}
          className="w-11 h-11 bg-saffron-light rounded-full flex items-center justify-center shrink-0 text-xl"
          aria-label="Toggle details"
        >
          🛵
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-brown">{r.name}</h3>
            <Badge variant={statusVariant[r.status]}>{r.status}</Badge>
            {stats.active > 0 && (
              <span className="text-[10px] font-bold bg-saffron text-white px-1.5 py-0.5 rounded">
                {stats.active} active
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
            <span>{r.vehicle_number || "No vehicle"}</span>
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indian-green bg-green-light px-1 py-0.5 rounded">
              ⚡ EV
            </span>
            <span>· {r.phone}</span>
          </p>
        </div>

        {/* Quick stats inline */}
        <div className="hidden md:flex items-center gap-4 mr-2 text-xs">
          <Inline label="Delivered" value={stats.delivered} />
          <Inline label="Earned" value={`₹${stats.earnings}`} accent="green" />
          <Inline
            label="Rating"
            value={stats.delivered > 0 ? stats.rating.toFixed(1) : "—"}
            accent="amber"
          />
        </div>

        <div className="flex items-center gap-1">
          <a
            href={`tel:${r.phone}`}
            className="p-2 text-gray-400 hover:text-indian-green rounded-lg hover:bg-green-light"
            aria-label="Call"
          >
            <Phone size={14} />
          </a>
          <button
            onClick={onEdit}
            className="p-2 text-gray-400 hover:text-saffron rounded-lg hover:bg-saffron-light"
            aria-label="Edit"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
            aria-label="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/40">
          {/* Rider-app login credentials */}
          <div className="bg-white rounded-xl border border-saffron/30 p-3 mb-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <Bike size={10} className="text-saffron" />
              Rider app login
            </h4>
            <div className="flex items-center justify-between gap-2 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Phone</p>
                <p className="font-mono font-semibold text-brown">{r.phone}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Access code</p>
                <p className="font-mono font-bold text-saffron text-lg tracking-widest">
                  {r.access_code || "—"}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => {
                    const text = `Atalmart Rider app\nLink: ${typeof window !== "undefined" ? window.location.origin : ""}/rider\nPhone: ${r.phone}\nCode: ${r.access_code || ""}`;
                    navigator.clipboard?.writeText(text);
                    toast.success("Login details copied");
                  }}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-saffron-light text-saffron hover:bg-orange-100"
                >
                  Copy
                </button>
                <button
                  onClick={async () => {
                    const code = String(Math.floor(100000 + Math.random() * 900000));
                    const { error } = await updateRider(r.id, { access_code: code });
                    if (error) toast.error("Code change nahi hua");
                    else {
                      toast.success(`New code: ${code}`);
                      onRefresh();
                    }
                  }}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  New code
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Rider <code className="bg-gray-100 px-1 rounded">/rider</code> par jaakar phone + code se login kare.
            </p>
          </div>

          {/* Mobile KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
            <Detail label="Total assigned" value={stats.total} />
            <Detail label="Delivered" value={stats.delivered} accent="green" />
            <Detail label="In flight" value={stats.active} accent="orange" />
            <Detail label="Cancelled" value={stats.cancelled} accent="red" />
            <Detail label="Completion" value={`${stats.completionRate}%`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
            <Detail
              label="Revenue delivered"
              value={`₹${stats.revenue.toLocaleString("en-IN")}`}
              accent="green"
            />
            <Detail label="Earnings (₹20/order)" value={`₹${stats.earnings}`} accent="amber" />
            <Detail
              label="Last delivery"
              value={stats.lastDeliveryAt ? formatRelative(stats.lastDeliveryAt) : "—"}
            />
          </div>

          {/* Active assignments */}
          {assignments.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
                <Clock size={10} />
                Assigned orders ({assignments.length})
              </h4>
              <ul className="space-y-1 text-sm">
                {assignments.slice(0, 5).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/customers/${o.user_id}`}
                      className="text-brown hover:text-saffron truncate flex-1"
                    >
                      #{o.id.slice(-8).toUpperCase()} · {o.profile?.name || "Customer"}
                    </Link>
                    <Badge variant={statusVariant[o.status as keyof typeof statusVariant] || "gray"}>
                      {o.status}
                    </Badge>
                    <span className="text-xs text-gray-500 tabular-nums shrink-0">₹{o.total}</span>
                  </li>
                ))}
                {assignments.length > 5 && (
                  <li className="text-xs text-gray-400 text-center pt-1">
                    +{assignments.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic text-center py-4">
              No orders assigned yet
            </p>
          )}
        </div>
      )}
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

function Mini({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-bold text-brown leading-tight flex items-center justify-center gap-0.5">
        {icon}
        {value}
      </p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

function Inline({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "green" | "amber";
}) {
  const cls = accent === "green" ? "text-indian-green" : accent === "amber" ? "text-amber-600" : "text-brown";
  return (
    <div className="text-center">
      <p className={`font-bold ${cls}`}>{value}</p>
      <p className="text-[9px] text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function Detail({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "green" | "red" | "orange" | "amber";
}) {
  const cls =
    accent === "green"
      ? "text-indian-green"
      : accent === "red"
        ? "text-red-500"
        : accent === "orange"
          ? "text-orange-600"
          : accent === "amber"
            ? "text-amber-600"
            : "text-brown";
  return (
    <div className="bg-white rounded-lg p-2">
      <p className={`text-base font-bold leading-tight ${cls}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN");
}
