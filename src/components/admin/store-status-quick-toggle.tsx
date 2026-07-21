"use client";

import { useSettings, useSettingsStore, type StoreStatus } from "@/lib/store/settings";
import { Power, Zap, Clock } from "lucide-react";
import { toast } from "sonner";

const OPTS: {
  value: StoreStatus;
  label: string;
  icon: typeof Power;
  activeCls: string;
  toast: string;
}[] = [
  {
    value: "open",
    label: "Open",
    icon: Power,
    activeCls: "border-indian-green bg-green-light text-indian-green",
    toast: "Store live — orders chalu ✅",
  },
  {
    value: "busy",
    label: "Busy",
    icon: Zap,
    activeCls: "border-amber-500 bg-amber-50 text-amber-600",
    toast: "Rush mode on — naye orders paused ⏸️",
  },
  {
    value: "opening_soon",
    label: "Opening Soon",
    icon: Clock,
    activeCls: "border-saffron bg-saffron-light text-saffron",
    toast: "Opening Soon board live 🚧",
  },
];

/**
 * One-click store-availability control for rush handling — flips
 * settings.storeStatus and writes through to the DB immediately (no Save step),
 * so the customer board + order block update live everywhere.
 */
export function StoreStatusQuickToggle() {
  const { storeStatus } = useSettings();
  const update = useSettingsStore((s) => s.update);

  const pick = (opt: (typeof OPTS)[number]) => {
    if (opt.value === storeStatus) return;
    update({ storeStatus: opt.value });
    toast.success(opt.toast);
  };

  return (
    <section className="bg-white rounded-2xl p-4 border border-gray-100 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Store status
        </h2>
        {storeStatus !== "open" && (
          <span className="text-[11px] font-semibold text-amber-600">
            Naye orders paused
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTS.map((opt) => {
          const active = storeStatus === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => pick(opt)}
              className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-sm font-bold transition-colors ${
                active ? opt.activeCls : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <Icon size={15} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
