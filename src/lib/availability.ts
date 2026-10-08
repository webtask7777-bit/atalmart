/**
 * One store-availability state for every customer surface.
 *
 * The header ETA, the "QUICK" pill on cards, the PDP promise strip, the
 * busy strip and the checkout button each read settings on their own, so a
 * paused store still advertised "25–30 min" next to an "orders paused"
 * banner. deriveAvailability() is the single mapping from raw inputs to a
 * state + copy; useStoreAvailability() (src/lib/hooks/use-availability.ts)
 * feeds it from the live stores.
 *
 * The server gates (checkStoreOpen / resolveDeliveryZone in
 * src/lib/server/launch-gate.ts) stay authoritative — this is signage.
 */

import type { StoreStatus } from "@/lib/store/settings";

export type AvailabilityState =
  | "open"
  | "capacity_paused"
  | "closed"
  | "unserviceable"
  | "unknown";

export interface Availability {
  state: AvailabilityState;
  /** Short label for chips/strips ("Orders paused"). */
  title: string;
  /** One-line explanation safe to show verbatim. */
  body: string;
  /** Whether the storefront may offer a checkout CTA. */
  canOrder: boolean;
  /** Whether a delivery-time promise may be shown at all. */
  showEta: boolean;
  /** Whether the "paused / closed" signage applies (cart stays usable). */
  blocked: boolean;
}

export interface AvailabilityInput {
  storeStatus: StoreStatus;
  /** False until the settings row has been read (live mode). */
  settingsHydrated: boolean;
  /** Operator-supplied line (settings.storeStatusMessage). Never invented. */
  customMessage?: string;
  /** True / false once a pincode is known; null when none is set. */
  serviceable?: boolean | null;
}

export const AVAILABILITY_COPY: Record<AvailabilityState, { title: string; body: string }> = {
  open: { title: "Delivering now", body: "" },
  capacity_paused: {
    title: "Naye orders abhi paused hain",
    body: "Heavy rush ke kaaran naye orders kuch der ke liye paused hain. Aapka cart saved hai — thodi der baad try karein.",
  },
  closed: {
    title: "Store abhi band hai",
    body: "Atalmart abhi orders nahi le raha. Browse karein — cart saved rahega.",
  },
  unserviceable: {
    title: "Is address par delivery nahi",
    body: "Abhi hum is pincode par deliver nahi karte. Hum sirf Naya Raipur (Atal Nagar) mein deliver karte hain.",
  },
  unknown: {
    title: "Availability check nahi ho paayi",
    body: "Delivery availability abhi check nahi ho paa rahi. Page refresh karke phir try karein.",
  },
};

export function deriveAvailability(input: AvailabilityInput): Availability {
  const custom = (input.customMessage ?? "").trim();
  const make = (state: AvailabilityState, body?: string): Availability => {
    const copy = AVAILABILITY_COPY[state];
    const blocked = state !== "open";
    return {
      state,
      title: copy.title,
      body: body ?? copy.body,
      canOrder: state === "open",
      showEta: state === "open",
      blocked,
    };
  };

  if (!input.settingsHydrated) return make("unknown");
  if (input.storeStatus === "opening_soon") return make("closed", custom || undefined);
  if (input.storeStatus === "busy") return make("capacity_paused", custom || undefined);
  if (input.serviceable === false) return make("unserviceable");
  return make("open");
}
