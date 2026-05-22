"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  IndianRupee,
  ShoppingBag,
  Tag,
  Pin,
  PinOff,
  Trash2,
  Plus,
  CreditCard,
  Award,
  AlertCircle,
  TrendingUp,
  FileText,
} from "lucide-react";
import { useAdminOrders } from "@/lib/hooks/use-admin";
import {
  buildCustomerInsights,
  SEGMENT_LABELS,
  SEGMENT_STYLES,
  type CustomerInsight,
} from "@/lib/customer-insights";
import { useAdminNotesStore, type CustomerTag } from "@/lib/store/admin-notes";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const TAG_OPTIONS: { value: CustomerTag; label: string; color: string }[] = [
  { value: "vip", label: "VIP", color: "bg-saffron-light text-saffron" },
  { value: "bulk-buyer", label: "Bulk buyer", color: "bg-purple-50 text-purple-600" },
  { value: "fast-payer", label: "Fast payer", color: "bg-green-light text-indian-green" },
  { value: "complainer", label: "Complainer", color: "bg-orange-50 text-orange-600" },
  { value: "lapsed", label: "Lapsed", color: "bg-red-50 text-red-500" },
  { value: "trial", label: "Trial user", color: "bg-blue-50 text-blue-600" },
];

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { orders, loading } = useAdminOrders();
  const { addNote, removeNote, togglePin, toggleTag, getNotes, getTags } =
    useAdminNotesStore();
  const [noteBody, setNoteBody] = useState("");

  const customer = useMemo(() => {
    if (!orders.length) return null;
    return buildCustomerInsights(orders).find((c) => c.user_id === id) || null;
  }, [orders, id]);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <span className="inline-block h-8 w-8 border-3 border-saffron border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <p className="text-5xl mb-3">👤</p>
        <p className="text-brown font-bold">Customer not found</p>
        <Link href="/admin/customers" className="text-saffron text-sm hover:underline">
          ← Back to customers
        </Link>
      </div>
    );
  }

  const notes = getNotes(customer.user_id);
  const tags = getTags(customer.user_id);

  const handleAddNote = () => {
    const body = noteBody.trim();
    if (!body) return toast.error("Note can't be empty");
    addNote(customer.user_id, body);
    setNoteBody("");
    toast.success("Note added");
  };

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/customers"
          className="p-2 rounded-lg hover:bg-white border border-gray-200"
        >
          <ArrowLeft size={18} className="text-brown" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brown">{customer.name}</h1>
          <p className="text-xs text-gray-500 font-mono">{customer.user_id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Profile + tags + insights */}
        <div className="lg:col-span-1 space-y-4">
          <ProfileCard c={customer} />
          <TagsCard
            tags={tags}
            onToggle={(t) => toggleTag(customer.user_id, t)}
          />
          <InsightsCard c={customer} />
        </div>

        {/* RIGHT: Orders + notes */}
        <div className="lg:col-span-2 space-y-4">
          <OrdersCard c={customer} />
          <NotesCard
            notes={notes}
            value={noteBody}
            onChange={setNoteBody}
            onAdd={handleAddNote}
            onPin={(noteId) => togglePin(customer.user_id, noteId)}
            onRemove={(noteId) => {
              removeNote(customer.user_id, noteId);
              toast.success("Note removed");
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Components ─────────────────────────────────────

function ProfileCard({ c }: { c: CustomerInsight }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 bg-saffron-light rounded-2xl flex items-center justify-center text-saffron font-bold text-2xl shrink-0">
          {c.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-brown leading-tight">{c.name}</h2>
          <span
            className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${SEGMENT_STYLES[c.segment]}`}
          >
            {SEGMENT_LABELS[c.segment]}
          </span>
        </div>
      </div>

      <dl className="mt-5 space-y-2.5 text-sm">
        <Row icon={<Phone size={14} />} label="Phone">
          {c.phone ? (
            <a href={`tel:${c.phone}`} className="text-brown hover:text-saffron">
              {c.phone}
            </a>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </Row>
        <Row icon={<Mail size={14} />} label="Email">
          <span className="text-gray-400 italic text-xs">
            {c.email || "Not collected"}
          </span>
        </Row>
        <Row icon={<MapPin size={14} />} label="Last delivery">
          <span className="text-brown-light text-xs leading-snug">{c.lastAddress || "—"}</span>
        </Row>
        <Row icon={<Calendar size={14} />} label="Customer since">
          <span className="text-brown-light">
            {c.customerSinceDays === 0 ? "today" : `${c.customerSinceDays}d ago`}
            <span className="text-gray-400 ml-1.5 text-xs">
              ({new Date(c.firstOrderAt).toLocaleDateString("en-IN")})
            </span>
          </span>
        </Row>
        <Row icon={<CreditCard size={14} />} label="Preferred">
          <span className="text-brown-light capitalize">{c.preferredPayment}</span>
        </Row>
      </dl>

      <div className="mt-5 pt-4 border-t border-gray-100 flex gap-2">
        {c.phone && (
          <a
            href={`tel:${c.phone}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indian-green text-white text-xs font-bold rounded-lg hover:bg-green-700"
          >
            <Phone size={12} />
            Call
          </a>
        )}
        <button
          onClick={() => {
            navigator.clipboard.writeText(c.phone || c.user_id);
            toast.success("Copied");
          }}
          className="flex-1 py-2 text-xs font-semibold text-brown border border-gray-200 rounded-lg hover:border-saffron"
        >
          Copy ID
        </button>
      </div>
    </section>
  );
}

function TagsCard({
  tags,
  onToggle,
}: {
  tags: CustomerTag[];
  onToggle: (t: CustomerTag) => void;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="flex items-center gap-2 font-bold text-brown mb-3">
        <Tag size={14} className="text-saffron" />
        Tags
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {TAG_OPTIONS.map((t) => {
          const on = tags.includes(t.value);
          return (
            <button
              key={t.value}
              onClick={() => onToggle(t.value)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                on
                  ? `${t.color} border-transparent`
                  : "bg-white text-gray-400 border-gray-200 hover:border-saffron hover:text-brown"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tags.length === 0 && (
        <p className="text-xs text-gray-400 mt-2">No tags yet — tap any chip to add</p>
      )}
    </section>
  );
}

function InsightsCard({ c }: { c: CustomerInsight }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="flex items-center gap-2 font-bold text-brown mb-3">
        <TrendingUp size={14} className="text-indian-green" />
        Insights
      </h3>
      <dl className="space-y-2.5 text-sm">
        <Row icon={<IndianRupee size={14} />} label="Lifetime value">
          <span className="font-bold text-indian-green">
            ₹{c.lifetimeValue.toLocaleString("en-IN")}
          </span>
        </Row>
        <Row icon={<ShoppingBag size={14} />} label="Total orders">
          <span className="font-medium text-brown">{c.orderCount}</span>
        </Row>
        <Row icon={<TrendingUp size={14} />} label="Avg order value">
          <span className="font-medium text-brown">₹{c.avgOrderValue}</span>
        </Row>
        <Row icon={<Award size={14} />} label="Total saved">
          <span className="font-medium text-saffron">
            {c.totalSaved > 0 ? `₹${c.totalSaved}` : "—"}
          </span>
        </Row>
        <Row icon={<AlertCircle size={14} />} label="Cancellations">
          <span className={c.cancelledCount > 0 ? "text-red-500" : "text-gray-400"}>
            {c.cancelledCount}
          </span>
        </Row>
        <Row icon={<Calendar size={14} />} label="Last order">
          <span className="text-brown-light">
            {c.daysSinceLastOrder === 0
              ? "today"
              : `${c.daysSinceLastOrder}d ago`}
          </span>
        </Row>
        {c.favProductName && (
          <Row icon={<Award size={14} />} label="Favourite">
            <span className="text-brown-light text-xs">
              {c.favProductName.slice(0, 22)}
              {c.favProductName.length > 22 ? "…" : ""} × {c.favProductQty}
            </span>
          </Row>
        )}
        {c.couponsUsed.length > 0 && (
          <Row icon={<Tag size={14} />} label="Coupons used">
            <span className="text-xs font-mono">
              {c.couponsUsed.join(", ")}
            </span>
          </Row>
        )}
      </dl>
    </section>
  );
}

function OrdersCard({ c }: { c: CustomerInsight }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 font-bold text-brown">
          <ShoppingBag size={14} className="text-saffron" />
          Order history
          <span className="text-xs font-normal text-gray-500 ml-1">
            ({c.orders.length})
          </span>
        </h3>
      </div>

      <div className="space-y-2">
        {c.orders.map((o) => (
          <div
            key={o.id}
            className="rounded-xl border border-gray-100 hover:border-saffron transition-colors overflow-hidden flex items-stretch"
          >
            <Link
              href={`/track/${o.id}`}
              className="block p-3 hover:bg-saffron-light/30 flex-1 min-w-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-gray-500">
                      #{o.id.slice(-8)}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${statusStyle(o.status)}`}
                    >
                      {ORDER_STATUS_LABELS[o.status] || o.status}
                    </span>
                  </div>
                  <p className="text-xs text-brown-light truncate">
                    {(o.items || []).length > 0
                      ? (o.items || [])
                          .slice(0, 3)
                          .map((it) => `${it.product_name} ×${it.quantity}`)
                          .join(", ")
                      : "No items recorded"}
                    {(o.items?.length || 0) > 3 && ` +${(o.items?.length || 0) - 3} more`}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(o.placed_at).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-brown">₹{o.total}</p>
                  {o.discount > 0 && (
                    <p className="text-[10px] text-indian-green">−₹{o.discount}</p>
                  )}
                </div>
              </div>
            </Link>
            <a
              href={`/invoice/${o.id}`}
              target="_blank"
              rel="noopener"
              aria-label="View invoice"
              title="View invoice"
              className="border-l border-gray-100 px-3 flex items-center text-gray-400 hover:text-saffron hover:bg-saffron-light/30"
            >
              <FileText size={14} />
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

function NotesCard({
  notes,
  value,
  onChange,
  onAdd,
  onPin,
  onRemove,
}: {
  notes: ReturnType<typeof useAdminNotesStore.getState>["notes"][string];
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onPin: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="flex items-center gap-2 font-bold text-brown mb-3">
        <Pin size={14} className="text-saffron" />
        Internal notes
        <span className="text-xs font-normal text-gray-500 ml-1">({notes.length})</span>
      </h3>

      <div className="flex gap-2 mb-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add an internal note — only visible to admins…"
          rows={2}
          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm resize-none focus:outline-none focus:border-saffron"
        />
        <Button size="sm" onClick={onAdd} disabled={!value.trim()}>
          <Plus size={14} />
          Add
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          No notes yet — add the first one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`p-3 rounded-xl border ${n.pinned ? "border-saffron bg-saffron-light/40" : "border-gray-100 bg-gray-50"}`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brown leading-snug whitespace-pre-wrap">
                    {n.body}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {n.authorName} ·{" "}
                    {new Date(n.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => onPin(n.id)}
                    className={`p-1.5 rounded ${n.pinned ? "text-saffron" : "text-gray-400 hover:text-saffron"}`}
                    aria-label={n.pinned ? "Unpin" : "Pin"}
                    title={n.pinned ? "Unpin" : "Pin to top"}
                  >
                    {n.pinned ? <Pin size={12} /> : <PinOff size={12} />}
                  </button>
                  <button
                    onClick={() => onRemove(n.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                    aria-label="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Helpers ─────────────────────────────────────

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-5 text-gray-400 mt-0.5">{icon}</div>
      <div className="text-xs text-gray-500 w-28 shrink-0 mt-0.5">{label}</div>
      <div className="flex-1 min-w-0 text-right">{children}</div>
    </div>
  );
}

function statusStyle(status: string): string {
  const map: Record<string, string> = {
    placed: "bg-gray-100 text-gray-600",
    confirmed: "bg-blue-50 text-blue-600",
    picking: "bg-yellow-50 text-yellow-700",
    picked: "bg-purple-50 text-purple-600",
    out_for_delivery: "bg-saffron-light text-saffron",
    delivered: "bg-green-light text-indian-green",
    cancelled: "bg-red-50 text-red-500",
  };
  return map[status] || "bg-gray-100 text-gray-600";
}
