"use client";

import { useSettingsStore } from "@/lib/store/settings";

export type WhatsAppTemplate =
  | "order_placed"
  | "order_confirmed"
  | "order_out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "return_requested"
  | "return_approved"
  | "return_rejected";

/**
 * Fire-and-forget WhatsApp notification. Never throws — notification
 * failures must not break the order flow.
 *
 * In production, the server reads WHATSAPP_ACCESS_TOKEN + PHONE_NUMBER_ID
 * from env. In dev/demo, sends the store values as a fallback so local
 * testing works without env setup. The server ignores body credentials
 * entirely when NODE_ENV=production.
 */
export async function sendWhatsApp(
  to: string | null | undefined,
  template: WhatsAppTemplate,
  params: string[] = [],
): Promise<void> {
  if (!to) return;

  // Only attach dev fallback credentials when not in production. Production
  // builds always have NODE_ENV=production so this branch is dead-stripped.
  const isDev = process.env.NODE_ENV !== "production";
  const settings = isDev ? useSettingsStore.getState().settings : null;

  try {
    await fetch("/api/notifications/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to,
        template,
        params,
        ...(settings && {
          settings: {
            enabled: settings.whatsappEnabled,
            accessToken: settings.whatsappAccessToken,
            phoneNumberId: settings.whatsappPhoneNumberId,
          },
        }),
      }),
    });
  } catch (err) {
    // Log but don't throw — notification failures shouldn't break the user flow
    console.warn("[WhatsApp]", err);
  }
}

/**
 * Convenience: derive the right template + params from an order status.
 * Returns null if no notification should be sent for this status.
 */
export function templateForStatus(
  status: string,
): { template: WhatsAppTemplate; needsItems?: boolean } | null {
  switch (status) {
    case "placed":
      return { template: "order_placed" };
    case "confirmed":
      return { template: "order_confirmed" };
    case "out_for_delivery":
      return { template: "order_out_for_delivery" };
    case "delivered":
      return { template: "order_delivered" };
    case "cancelled":
      return { template: "order_cancelled" };
    case "return_requested":
      return { template: "return_requested" };
    case "return_approved":
      return { template: "return_approved" };
    case "return_rejected":
      return { template: "return_rejected" };
    default:
      return null;
  }
}
