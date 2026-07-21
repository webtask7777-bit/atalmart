"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, MapPin, Home, Briefcase, Edit2, Trash2, Check } from "lucide-react";
import { useAddressStore, type SavedAddress } from "@/lib/store/addresses";
import { useAuth } from "@/lib/hooks/use-auth";
import { useUserPincodeStore } from "@/lib/store/user-pincode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PinDropPicker } from "@/components/customer/pin-drop-picker";
import { validatePhone10 } from "@/lib/validators";
import { toast } from "sonner";

const LABEL_ICON: Record<SavedAddress["label"], React.ComponentType<{ size?: number; className?: string }>> = {
  Home: Home,
  Work: Briefcase,
  Other: MapPin,
};

export default function AddressesPage() {
  const { addresses, selectedId, add, update, remove, select } = useAddressStore();
  const { profile } = useAuth();
  const storedPincode = useUserPincodeStore((s) => s.pincode);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<SavedAddress, "id" | "createdAt">>({
    label: "Home",
    recipient: "",
    phone: "",
    line: "",
    landmark: "",
    pincode: "",
  });

  const openCreate = () => {
    setEditId(null);
    // Prefill from the logged-in profile (name + phone from OTP login) and the
    // already-selected delivery pincode, so the customer only types the street.
    setForm({
      label: "Home",
      recipient: profile?.name ?? "",
      phone: profile?.phone ? profile.phone.replace(/\D/g, "").slice(-10) : "",
      line: "",
      landmark: "",
      pincode: storedPincode ?? "",
    });
    setModalOpen(true);
  };

  const openEdit = (a: SavedAddress) => {
    setEditId(a.id);
    setForm({
      label: a.label,
      customLabel: a.customLabel,
      recipient: a.recipient,
      phone: a.phone,
      line: a.line,
      landmark: a.landmark,
      pincode: a.pincode,
      lat: a.lat,
      lng: a.lng,
    });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.recipient.trim()) return toast.error("Recipient name required");
    const phoneErr = validatePhone10(form.phone);
    if (phoneErr) return toast.error(phoneErr);
    if (!form.line.trim()) return toast.error("Address required");
    if (!/^\d{6}$/.test(form.pincode)) return toast.error("Valid 6-digit pincode required");

    if (editId) {
      update(editId, form);
      toast.success("Address updated");
    } else {
      add(form);
      toast.success("Address added");
    }
    setModalOpen(false);
  };

  const onDelete = (a: SavedAddress) => {
    if (!confirm(`Delete "${a.label}" address?`)) return;
    remove(a.id);
    toast.success("Address removed");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32 md:pb-12">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-full hover:bg-gray-50">
            <ArrowLeft size={20} className="text-brown" />
          </Link>
          <h1 className="text-xl font-bold text-brown">My Addresses</h1>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          Add New
        </Button>
      </div>

      {addresses.length === 0 ? (
        <div className="text-center py-16">
          <MapPin size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-brown font-bold mb-1">No saved addresses</p>
          <p className="text-sm text-gray-500 mb-6">
            Save your Home, Work, or Other addresses for faster checkout
          </p>
          <Button onClick={openCreate}>
            <Plus size={16} />
            Add First Address
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((a) => {
            const Icon = LABEL_ICON[a.label];
            const isSelected = selectedId === a.id;
            return (
              <div
                key={a.id}
                className={`bg-white rounded-2xl border-2 p-4 transition-colors ${
                  isSelected ? "border-saffron" : "border-gray-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                      isSelected ? "bg-saffron text-white" : "bg-saffron-light text-saffron"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-brown">
                        {a.label === "Other" && a.customLabel ? a.customLabel : a.label}
                      </p>
                      {isSelected && (
                        <span className="text-[10px] font-bold text-indian-green bg-green-light px-1.5 py-0.5 rounded">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-brown-light mt-0.5">
                      {a.recipient} • {a.phone}
                    </p>
                    <p className="text-sm text-brown-light mt-1 leading-snug">
                      {a.line}
                      {a.landmark && `, ${a.landmark}`}
                      <span className="text-gray-500"> — {a.pincode}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  {!isSelected && (
                    <button
                      onClick={() => {
                        select(a.id);
                        toast.success(`${a.label} set as default`);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-saffron hover:bg-saffron-light rounded-lg transition-colors"
                    >
                      <Check size={12} strokeWidth={3} />
                      Set as default
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(a)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-brown-light hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={12} />
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(a)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Address" : "Add New Address"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brown-light mb-2">
              Save as
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["Home", "Work", "Other"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setForm((f) => ({ ...f, label: l }))}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${
                    form.label === l
                      ? "border-saffron bg-saffron-light text-saffron"
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {(() => {
                    const I = LABEL_ICON[l];
                    return <I size={16} />;
                  })()}
                  <span className="text-xs font-semibold">{l}</span>
                </button>
              ))}
            </div>
          </div>
          {form.label === "Other" && (
            <Input
              label="Custom label (e.g. Mom's house)"
              value={form.customLabel || ""}
              onChange={(e) => setForm((f) => ({ ...f, customLabel: e.target.value }))}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Recipient name"
              value={form.recipient}
              onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
              placeholder="Vivek Kumar"
            />
            <Input
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))
              }
              placeholder="98765 43210"
              maxLength={10}
            />
          </div>
          <Input
            label="Address (flat, building, street)"
            value={form.line}
            onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))}
            placeholder="A-204, Sector 21, Atal Nagar"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Landmark (optional)"
              value={form.landmark || ""}
              onChange={(e) => setForm((f) => ({ ...f, landmark: e.target.value }))}
              placeholder="Near MG School"
            />
            <Input
              label="Pincode"
              value={form.pincode}
              onChange={(e) =>
                setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))
              }
              placeholder="492101"
              maxLength={6}
            />
          </div>

          {/* Pin-drop on map — saves lat/lng + validates service area live */}
          <div>
            <label className="block text-sm font-medium text-brown-light mb-2">
              Map pe pin drop karein <span className="text-gray-400 font-normal">(optional, but recommended)</span>
            </label>
            <PinDropPicker
              value={
                form.lat != null && form.lng != null
                  ? { lat: form.lat, lng: form.lng }
                  : null
              }
              onChange={({ lat, lng }) => setForm((f) => ({ ...f, lat, lng }))}
            />
          </div>

          <Button className="w-full" onClick={save}>
            {editId ? "Update Address" : "Save Address"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
