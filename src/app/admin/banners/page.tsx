"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { useBannerStore, GRADIENTS, type Banner } from "@/lib/store/banners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const EMOJIS = ["🛒","🎁","🚚","🌾","🥛","🍎","🍔","🥤","🍫","🍪","🧴","🌶️","🍯","🥗","💊","🪔","☕","🏷️","💸","⚡","🔥","✨","🎉"];

type Form = Omit<Banner, "id" | "sortOrder">;

const empty: Form = {
  badge: "OFFER",
  title: "",
  subtitle: "",
  ctaLabel: "Shop now",
  ctaHref: "/",
  gradient: GRADIENTS[0].value,
  illo: "🛒",
  enabled: true,
};

export default function BannersAdminPage() {
  const { banners, add, update, remove, reorder, reset } = useBannerStore();
  const sorted = [...banners].sort((a, b) => a.sortOrder - b.sortOrder);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);

  const openCreate = () => {
    setEditId(null);
    setForm(empty);
    setModalOpen(true);
  };

  const openEdit = (b: Banner) => {
    setEditId(b.id);
    const { id: _id, sortOrder: _so, ...rest } = b;
    void _id; void _so;
    setForm(rest);
    setModalOpen(true);
  };

  const save = () => {
    if (!form.title.trim()) return toast.error("Title required");
    if (!form.ctaHref.trim()) return toast.error("CTA link required");
    if (editId) {
      update(editId, form);
      toast.success("Banner updated");
    } else {
      add(form);
      toast.success("Banner added");
    }
    setModalOpen(false);
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brown">Hero Banners</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-rotating banners on the customer homepage. {sorted.length}{" "}
            total, {sorted.filter((b) => b.enabled).length} active.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Reset to default banners?",
                message: "This will discard your changes and restore the original 4 hero banners.",
                confirmLabel: "Reset",
                destructive: true,
              });
              if (ok) {
                reset();
                toast.success("Reset to defaults");
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-brown rounded-lg border border-gray-200"
          >
            <RefreshCw size={12} />
            Reset
          </button>
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} />
            Add Banner
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((b, idx) => (
          <div
            key={b.id}
            className={`rounded-2xl border-2 overflow-hidden bg-white ${
              b.enabled ? "border-gray-200" : "border-dashed border-gray-300 opacity-60"
            }`}
          >
            {/* Preview */}
            <Link href={b.ctaHref} className={`block bg-gradient-to-br ${b.gradient} text-white relative`}>
              <div className="px-4 py-5 min-h-[120px] flex items-center justify-between gap-3">
                <div className="max-w-[60%]">
                  <span className="inline-block bg-white/20 text-[9px] font-bold px-1.5 py-0.5 rounded">
                    {b.badge}
                  </span>
                  <h3 className="text-base font-bold leading-tight mt-1">{b.title}</h3>
                  <p className="text-[11px] opacity-90 mt-0.5 line-clamp-2">{b.subtitle}</p>
                </div>
                <div className="text-5xl select-none opacity-90 shrink-0">{b.illo}</div>
              </div>
            </Link>

            {/* Controls */}
            <div className="p-3 flex items-center justify-between border-t border-gray-100 bg-gray-50">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => reorder(b.id, "up")}
                  disabled={idx === 0}
                  aria-label="move up"
                  className="p-1.5 rounded hover:bg-white text-gray-500 disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => reorder(b.id, "down")}
                  disabled={idx === sorted.length - 1}
                  aria-label="move down"
                  className="p-1.5 rounded hover:bg-white text-gray-500 disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <span className="text-xs text-gray-400 ml-1">#{idx + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => update(b.id, { enabled: !b.enabled })}
                  className={`p-1.5 rounded ${b.enabled ? "text-indian-green" : "text-gray-400"} hover:bg-white`}
                  aria-label={b.enabled ? "Disable" : "Enable"}
                  title={b.enabled ? "Click to disable" : "Click to enable"}
                >
                  {b.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  onClick={() => openEdit(b)}
                  className="p-1.5 text-gray-500 hover:text-saffron hover:bg-white rounded"
                  aria-label="edit"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Delete "${b.title}"?`,
                      message: "This banner will be removed from the home page.",
                      confirmLabel: "Delete",
                      destructive: true,
                    });
                    if (ok) {
                      remove(b.id);
                      toast.success("Banner deleted");
                    }
                  }}
                  className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-white rounded"
                  aria-label="delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center">
          <p className="text-gray-400 mb-3">No banners. Add one to show the hero carousel.</p>
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} />
            Add First Banner
          </Button>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Banner" : "Add Banner"}
      >
        <div className="space-y-4">
          {/* Live preview */}
          <div className={`bg-gradient-to-br ${form.gradient} text-white rounded-xl overflow-hidden`}>
            <div className="px-4 py-5 flex items-center justify-between gap-3 min-h-[110px]">
              <div className="max-w-[60%]">
                <span className="inline-block bg-white/20 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  {form.badge || "BADGE"}
                </span>
                <p className="text-base font-bold leading-tight mt-1">
                  {form.title || "Title goes here"}
                </p>
                <p className="text-[11px] opacity-90 mt-0.5 line-clamp-2">
                  {form.subtitle || "Subtitle"}
                </p>
              </div>
              <div className="text-5xl">{form.illo}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Badge text"
              value={form.badge}
              onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value.toUpperCase() }))}
              placeholder="FLASH DEAL"
            />
            <Input
              label="CTA label"
              value={form.ctaLabel}
              onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
              placeholder="Shop now"
            />
          </div>
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="10-minute delivery"
          />
          <Input
            label="Subtitle"
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            placeholder="Free delivery on orders above ₹299"
          />
          <Input
            label="Link (CTA href)"
            value={form.ctaHref}
            onChange={(e) => setForm((f) => ({ ...f, ctaHref: e.target.value }))}
            placeholder="/ or /product/p31 or /cart"
          />

          <div>
            <label className="block text-sm font-medium text-brown-light mb-2">
              Color theme
            </label>
            <div className="grid grid-cols-4 gap-2">
              {GRADIENTS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setForm((f) => ({ ...f, gradient: g.value }))}
                  className={`h-10 rounded-lg bg-gradient-to-br ${g.value} border-2 ${
                    form.gradient === g.value ? "border-brown" : "border-transparent"
                  }`}
                  aria-label={g.label}
                  title={g.label}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brown-light mb-2">
              Emoji illustration
            </label>
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setForm((f) => ({ ...f, illo: e }))}
                  className={`w-10 h-10 rounded-lg text-2xl flex items-center justify-center border-2 ${
                    form.illo === e ? "border-saffron bg-saffron-light" : "border-gray-200"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="accent-saffron w-4 h-4"
            />
            <span className="text-sm text-brown">Enabled (visible on homepage)</span>
          </label>

          <Button className="w-full" onClick={save}>
            {editId ? "Update Banner" : "Create Banner"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
