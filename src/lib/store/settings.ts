import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";

export type StoreStatus = "open" | "busy" | "opening_soon";

export type SiteSettings = {
  appName: string;
  tagline: string;
  storeAddress: string;
  contactEmail: string;
  contactPhone: string;
  deliveryFee: number;
  freeDeliveryAbove: number;
  minOrderAmount: number;
  deliveryRadiusKm: number;
  deliveryTimeMins: number;
  codEnabled: boolean;
  onlinePaymentEnabled: boolean;
  serviceablePincodes: string; // comma-separated
  notificationBanner: string; // global announcement, empty = none

  // Store availability — rush handling + pre-launch (migration 011)
  storeStatus: StoreStatus; // open = normal; busy = orders paused; opening_soon = pre-launch
  storeStatusMessage: string; // optional custom line shown on the board (empty = default copy)

  // Razorpay payment gateway
  razorpayEnabled: boolean;
  razorpayTestMode: boolean;
  razorpayKeyId: string; // public — sent to browser
  razorpayKeySecret: string; // sensitive — only used server-side
  razorpayWebhookSecret: string; // for verifying payment webhooks

  // Anthropic Claude (customer support chatbot)
  anthropicEnabled: boolean;
  anthropicApiKey: string; // sensitive — read server-side only via API route
  anthropicModel: string; // "claude-haiku-4-5" recommended for speed/cost

  // WhatsApp Business Cloud API (Meta)
  whatsappEnabled: boolean;
  whatsappAccessToken: string; // sensitive — server-side only
  whatsappPhoneNumberId: string; // Meta phone number ID
  whatsappBusinessAccountId: string; // for template management
  whatsappTestRecipient: string; // for testing — receive all events in demo
};

const DEFAULTS: SiteSettings = {
  appName: "Atalmart",
  tagline: "Atal Nagar ki Atal Delivery",
  storeAddress: "Sector 28, Nawagaon Parsatti, Atal Nagar-Nava Raipur, Chhattisgarh 492018",
  contactEmail: "support@atalmart.in",
  contactPhone: "+91 9876543210",
  deliveryFee: 25,
  freeDeliveryAbove: 299,
  minOrderAmount: 49,
  deliveryRadiusKm: 5,
  deliveryTimeMins: 10,
  codEnabled: true,
  onlinePaymentEnabled: true,
  serviceablePincodes: "492101, 492014, 492015, 492018, 492030",
  notificationBanner: "",
  storeStatus: "open",
  storeStatusMessage: "",
  razorpayEnabled: false,
  razorpayTestMode: true,
  razorpayKeyId: "",
  razorpayKeySecret: "",
  razorpayWebhookSecret: "",
  anthropicEnabled: false,
  anthropicApiKey: "",
  anthropicModel: "claude-haiku-4-5",
  whatsappEnabled: false,
  whatsappAccessToken: "",
  whatsappPhoneNumberId: "",
  whatsappBusinessAccountId: "",
  whatsappTestRecipient: "",
};

// ─── Operational (DB-backed) fields ↔ `settings` table columns ────
// Only these reach the database (migration 010). Everything else — the
// Razorpay / Anthropic / WhatsApp credentials — stays browser-local (dev) and
// is read from env server-side, so no secret ever lands in a public row.
const OPERATIONAL_COLUMNS: Partial<Record<keyof SiteSettings, string>> = {
  appName: "app_name",
  tagline: "tagline",
  storeAddress: "store_address",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  deliveryFee: "delivery_fee",
  freeDeliveryAbove: "free_delivery_above",
  minOrderAmount: "min_order_amount",
  deliveryRadiusKm: "delivery_radius_km",
  deliveryTimeMins: "delivery_time_mins",
  codEnabled: "cod_enabled",
  onlinePaymentEnabled: "online_payment_enabled",
  serviceablePincodes: "serviceable_pincodes",
  notificationBanner: "notification_banner",
  storeStatus: "store_status",
  storeStatusMessage: "store_status_message",
};

type SettingsRow = Record<string, string | number | boolean | null>;

function rowToOperational(row: SettingsRow): Partial<SiteSettings> {
  const out: Partial<SiteSettings> = {};
  for (const [key, col] of Object.entries(OPERATIONAL_COLUMNS)) {
    const v = row[col!];
    if (v == null) continue;
    const k = key as keyof SiteSettings;
    // Coerce numeric columns (PostgREST may stringify numeric).
    if (typeof DEFAULTS[k] === "number") {
      (out as Record<string, unknown>)[k] = Number(v);
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** Pick only the operational keys present in a patch and map to a DB row. */
function operationalRow(patch: Partial<SiteSettings>): SettingsRow {
  const row: SettingsRow = {};
  for (const [key, col] of Object.entries(OPERATIONAL_COLUMNS)) {
    if (key in patch) {
      row[col!] = patch[key as keyof SiteSettings] as string | number | boolean;
    }
  }
  return row;
}

interface SettingsStore {
  settings: SiteSettings;
  hydrated: boolean;
  /** Load operational settings from Supabase (no-op in demo mode). */
  hydrate: () => Promise<void>;
  update: (patch: Partial<SiteSettings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULTS,
      hydrated: false,
      hydrate: async () => {
        if (isDemoMode()) {
          set({ hydrated: true });
          return;
        }
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("settings")
            .select("*")
            .eq("id", 1)
            .maybeSingle();
          // On error (table missing) keep local/defaults — graceful before
          // migration 010 is applied. Secret fields are never touched here.
          if (error || !data) return;
          set((s) => ({
            settings: { ...s.settings, ...rowToOperational(data as SettingsRow) },
            hydrated: true,
          }));
        } catch {
          /* keep local */
        }
      },
      update: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
        if (isDemoMode()) return;
        const row = operationalRow(patch);
        if (Object.keys(row).length === 0) return; // patch was secrets-only
        const supabase = createClient();
        Promise.resolve(
          supabase
            .from("settings")
            .upsert({ id: 1, ...row, updated_at: new Date().toISOString() }, {
              onConflict: "id",
            }),
        ).then(({ error }) => {
          if (error && typeof window !== "undefined") {
            console.warn("[settings] save failed", error);
          }
        });
      },
      reset: () => set({ settings: DEFAULTS }),
    }),
    { name: "atalmart-settings" },
  ),
);

/** Convenience hook: returns just the settings object. */
export const useSettings = () => useSettingsStore((s) => s.settings);

/**
 * Authoritative store-availability check for the order-placement path. Reads
 * the live DB row (not the possibly-stale hydrated store) so a "pause orders"
 * toggle takes effect even for a customer whose tab loaded before the flip.
 * Falls back to the hydrated store on any error / in demo mode.
 */
export async function getLiveStoreStatus(): Promise<{
  status: StoreStatus;
  message: string;
}> {
  const local = useSettingsStore.getState().settings;
  if (isDemoMode()) {
    return { status: local.storeStatus, message: local.storeStatusMessage };
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("settings")
      .select("store_status, store_status_message")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return { status: local.storeStatus, message: local.storeStatusMessage };
    }
    const row = data as { store_status: StoreStatus; store_status_message: string };
    return {
      status: row.store_status ?? "open",
      message: row.store_status_message ?? "",
    };
  } catch {
    return { status: local.storeStatus, message: local.storeStatusMessage };
  }
}

/** Default board copy when the admin hasn't set a custom message. */
export const STORE_STATUS_COPY: Record<
  StoreStatus,
  { title: string; body: string }
> = {
  open: { title: "", body: "" },
  busy: {
    title: "Abhi heavy rush hai 🌪️",
    body: "Hamari team orders ke load se busy hai. Naye orders kuch der ke liye paused hain — thodi der baad wapas try karein.",
  },
  opening_soon: {
    title: "Opening Soon 🚧",
    body: "Atalmart jaldi hi Nava Raipur mein live ho raha hai. Hum abhi delivery shuru nahi kar rahe — bahut jald aa rahe hain!",
  },
};
