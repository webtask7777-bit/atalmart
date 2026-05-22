import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  storeAddress: "Sector 21, Atal Nagar, Naya Raipur",
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

interface SettingsStore {
  settings: SiteSettings;
  update: (patch: Partial<SiteSettings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULTS,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: DEFAULTS }),
    }),
    { name: "atalmart-settings" },
  ),
);

/** Convenience hook: returns just the settings object. */
export const useSettings = () => useSettingsStore((s) => s.settings);
