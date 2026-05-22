"use client";

import { useState } from "react";
import { Plus, Edit2, Trash2, Tag, RefreshCw } from "lucide-react";
import { useCouponCatalog } from "@/lib/store/coupon";
import { type Coupon } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

type Form = Coupon;
const empty: Form = {
  code: "",
  description: "",
  type: "flat",
  value: 50,
  minOrder: 199,
  maxDiscount: undefined,
  firstOrderOnly: false,
  maxUsesPerUser: undefined,
  totalUsageLimit: undefined,
  campaignSource: "",
  validForPincodes: "",
  expiresAt: "",
};

export default function CouponsAdminPage() {
  const { coupons, add, update, remove, reset } = useCouponCatalog();
  const [modalOpen, setModalOpen] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);

  const openCreate = () => {
    setEditCode(null);
    setForm(empty);
    setModalOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditCode(c.code);
    setForm({ ...c });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.code.trim()) return toast.error("Code is required");
    if (!/^[A-Z0-9]+$/.test(form.code)) return toast.error("Code must be uppercase letters + digits");
    if (!form.description.trim()) return toast.error("Description required");
    if (form.value <= 0) return toast.error("Value must be > 0");
    if (form.type === "percent" && form.value > 100) return toast.error("Percent can't exceed 100");
    if (form.minOrder < 0) return toast.error("Min order must be ≥ 0");

    if (editCode) {
      update(editCode, form);
      toast.success(`${form.code} updated`);
    } else {
      if (coupons.some((c) => c.code === form.code)) {
        return toast.error("A coupon with this code already exists");
      }
      add(form);
      toast.success(`${form.code} created`);
    }
    setModalOpen(false);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brown">Coupons & Promo Codes</h1>
          <p className="text-sm text-gray-500 mt-1">
            {coupons.length} active coupon{coupons.length !== 1 && "s"} — customers can apply at cart
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Reset to default coupons?",
                message: "This will discard your changes and restore the original 3 coupons.",
                confirmLabel: "Reset",
                destructive: true,
              });
              if (ok) {
                reset();
                toast.success("Reset");
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-brown rounded-lg border border-gray-200"
          >
            <RefreshCw size={12} />
            Reset
          </button>
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} />
            Add Coupon
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Discount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Min order</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-saffron-light rounded-lg flex items-center justify-center">
                        <Tag size={14} className="text-saffron" />
                      </div>
                      <span className="font-mono font-bold text-brown">{c.code}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-brown-light">{c.description}</td>
                  <td className="px-4 py-3 font-medium text-indian-green">
                    {c.type === "flat" ? `₹${c.value} off` : `${c.value}% off`}
                    {c.maxDiscount && (
                      <span className="text-xs text-gray-400 ml-1">(max ₹{c.maxDiscount})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">₹{c.minOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-saffron rounded-lg hover:bg-saffron-light"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: `Delete coupon ${c.code}?`,
                            message: "Customers will no longer be able to apply this code.",
                            confirmLabel: "Delete",
                            destructive: true,
                          });
                          if (ok) {
                            remove(c.code);
                            toast.success(`${c.code} deleted`);
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {coupons.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No coupons. Add one to enable promos.
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editCode ? `Edit ${editCode}` : "Create Coupon"}
      >
        <div className="space-y-4">
          <Input
            label="Code (uppercase, no spaces)"
            value={form.code}
            onChange={(e) =>
              setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))
            }
            placeholder="ATAL50"
            disabled={!!editCode}
            className="font-mono font-bold tracking-wide"
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="₹50 off on first order"
          />
          <div>
            <label className="block text-sm font-medium text-brown-light mb-2">Discount type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setForm((f) => ({ ...f, type: "flat" }))}
                className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                  form.type === "flat"
                    ? "border-saffron bg-saffron-light text-saffron"
                    : "border-gray-200 text-gray-500"
                }`}
              >
                Flat ₹ off
              </button>
              <button
                onClick={() => setForm((f) => ({ ...f, type: "percent" }))}
                className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                  form.type === "percent"
                    ? "border-saffron bg-saffron-light text-saffron"
                    : "border-gray-200 text-gray-500"
                }`}
              >
                Percentage %
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={form.type === "flat" ? "Discount (₹)" : "Discount (%)"}
              type="number"
              value={String(form.value)}
              onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) || 0 }))}
            />
            <Input
              label="Min order (₹)"
              type="number"
              value={String(form.minOrder)}
              onChange={(e) => setForm((f) => ({ ...f, minOrder: Number(e.target.value) || 0 }))}
            />
          </div>
          {form.type === "percent" && (
            <Input
              label="Max discount cap (₹) — optional"
              type="number"
              value={form.maxDiscount?.toString() || ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxDiscount: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
              placeholder="e.g. 100"
            />
          )}

          {/* Smart targeting */}
          <div className="border-t border-gray-100 pt-4 mt-2 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Smart targeting (optional)
            </p>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:border-saffron">
              <input
                type="checkbox"
                checked={!!form.firstOrderOnly}
                onChange={(e) =>
                  setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))
                }
                className="accent-saffron w-4 h-4"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-brown">First order only</p>
                <p className="text-[11px] text-gray-500">
                  Block reuse — for acquisition campaigns
                </p>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Max uses per customer"
                type="number"
                value={form.maxUsesPerUser?.toString() || ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxUsesPerUser: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  }))
                }
                placeholder="Unlimited"
              />
              <Input
                label="Global usage cap"
                type="number"
                value={form.totalUsageLimit?.toString() || ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    totalUsageLimit: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  }))
                }
                placeholder="No cap"
              />
            </div>

            <Input
              label="Campaign source (links to a campaign)"
              value={form.campaignSource || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, campaignSource: e.target.value }))
              }
              placeholder="e.g. sector27_lift, iiit_fest"
            />

            <Input
              label="Valid for pincodes (comma-separated)"
              value={form.validForPincodes || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, validForPincodes: e.target.value }))
              }
              placeholder="Leave empty for all serviceable"
            />

            <Input
              label="Expires (ISO date — YYYY-MM-DD)"
              type="date"
              value={form.expiresAt?.slice(0, 10) || ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expiresAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : "",
                }))
              }
            />
          </div>

          <Button className="w-full" onClick={save}>
            {editCode ? "Update Coupon" : "Create Coupon"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
