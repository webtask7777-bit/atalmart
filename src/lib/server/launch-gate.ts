import type { SupabaseClient } from "@supabase/supabase-js";
import { isServiceablePincode } from "@/lib/constants";

/**
 * Server-side launch and service-area gates.
 *
 * Both of these were previously enforced in the browser only: the "Opening
 * Soon" board and the checkout pincode check are UI, and a direct POST to
 * /api/orders/place bypassed both. These helpers are the server's copy, and
 * they are the authority.
 *
 * Both routes that can create money movement — /api/orders/price and
 * /api/orders/place — call them.
 */

export type StoreStatus = "open" | "busy" | "opening_soon";

export interface GateBlock {
  /** Customer-facing, Hinglish, safe to show verbatim. */
  error: string;
  status: 403 | 503;
  code: "store_closed" | "outside_service_area";
  storeStatus?: StoreStatus;
}

/**
 * A Postgres/PostgREST error meaning "that column or table isn't there".
 * Migrations are applied by hand from the Supabase dashboard, so code can
 * reach production before its migration does. When that happens we degrade
 * instead of breaking checkout: the new bookkeeping is skipped, the order
 * still goes through, and the miss is logged once per call.
 */
export function isMissingSchema(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "42703" || e.code === "42P01") return true; // undefined column/table
  if (e.code === "PGRST204" || e.code === "PGRST205") return true; // schema cache miss
  const m = (e.message || "").toLowerCase();
  return (
    m.includes("could not find the table") ||
    m.includes("could not find the") ||
    m.includes("does not exist")
  );
}

/** Log a skipped write without ever throwing into a checkout path. */
export function logSchemaSkip(where: string, err: unknown): void {
  const e = err as { message?: string } | null;
  console.warn(
    `[${where}] skipped — schema not migrated yet: ${e?.message ?? "unknown"}`,
  );
}

const CLOSED_COPY: Record<Exclude<StoreStatus, "open">, string> = {
  busy: "Abhi heavy rush hai — thodi der baad order karein 🙏",
  opening_soon:
    "Atalmart abhi launch nahi hua hai. Hum jaldi shuru kar rahe hain — tab tak browse karein!",
};

/**
 * Refuse to price or place an order unless the store is open.
 *
 * Fails OPEN on a read error: a transient settings-read failure must not take
 * checkout down. It fails CLOSED for a status that is explicitly not "open".
 */
export async function checkStoreOpen(
  db: SupabaseClient,
): Promise<GateBlock | null> {
  let status: StoreStatus = "open";
  try {
    const { data, error } = await db
      .from("settings")
      .select("store_status")
      .eq("id", 1)
      .maybeSingle();
    if (error) return null;
    const raw = (data as { store_status?: string } | null)?.store_status;
    if (raw === "busy" || raw === "opening_soon") status = raw;
  } catch {
    return null;
  }

  if (status === "open") return null;
  return {
    error: CLOSED_COPY[status],
    status: 403,
    code: "store_closed",
    storeStatus: status,
  };
}

export interface ResolvedZone {
  zoneId: string | null;
  zoneName: string | null;
  pincode: string;
  /** Coordinates to record on the order: the customer's own when supplied,
   *  otherwise the matched sector's centroid. Null when neither is known. */
  lat: number | null;
  lng: number | null;
  source: "point" | "pincode" | "unresolved";
}

export type ZoneResult =
  | { ok: true; zone: ResolvedZone }
  | { ok: false; block: GateBlock };

/**
 * Validate that a delivery is inside the service area, and resolve which
 * sector it falls in.
 *
 * Order of authority, matching the handoff spec: an address pin beats a
 * postcode. When coordinates are supplied they are tested against the sector
 * polygons directly. A postcode alone is accepted only if it is on the
 * configured serviceable list, and the sector centroid stands in for the
 * customer's coordinates.
 */
export async function resolveDeliveryZone(
  db: SupabaseClient,
  input: { pincode?: string | null; lat?: number | null; lng?: number | null },
): Promise<ZoneResult> {
  const pincode = String(input.pincode ?? "").replace(/\D/g, "");

  const outside = (msg: string): ZoneResult => ({
    ok: false,
    block: { error: msg, status: 403, code: "outside_service_area" },
  });

  // 1. A real pin wins. If it lands inside an active sector, that IS the answer
  //    regardless of what postcode the customer typed.
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const hasPoint =
    Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  if (hasPoint) {
    try {
      const { data } = await db.rpc("contains_point", { p_lat: lat, p_lng: lng });
      const hit = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (hit) {
        return {
          ok: true,
          zone: {
            zoneId: hit.sector_id ?? null,
            zoneName: hit.sector_name ?? null,
            pincode: hit.pincode ?? pincode,
            lat,
            lng,
            source: "point",
          },
        };
      }
      // A pin that resolves to no sector is outside the area, even when the
      // typed postcode is serviceable. This is the case the postcode check
      // alone has always missed.
      return outside(
        "Ye location hamare delivery area se bahar hai. Abhi hum sirf Naya Raipur mein deliver karte hain.",
      );
    } catch {
      // PostGIS unavailable — fall through to the postcode path rather than
      // blocking every checkout.
    }
  }

  // 2. Postcode path.
  if (!/^\d{6}$/.test(pincode)) {
    return outside("Delivery ke liye 6-digit pincode chahiye.");
  }

  let serviceableCsv = "";
  try {
    const { data } = await db
      .from("settings")
      .select("serviceable_pincodes")
      .eq("id", 1)
      .maybeSingle();
    serviceableCsv =
      (data as { serviceable_pincodes?: string } | null)?.serviceable_pincodes ?? "";
  } catch {
    serviceableCsv = "";
  }

  // An empty setting must not mean "everything is serviceable".
  const csv = serviceableCsv.trim() || "492101, 492014, 492015, 492018, 492030";
  if (!isServiceablePincode(pincode, csv)) {
    const list = csv
      .split(/[,\s]+/)
      .filter(Boolean)
      .join(", ");
    return outside(
      `Sorry, pincode ${pincode} abhi hamare service area mein nahi hai. Hum yahan deliver karte hain: ${list}`,
    );
  }

  // Serviceable postcode: attach the sector when one matches.
  try {
    const { data } = await db
      .from("sectors")
      .select("id, name, pincode, centroid_lat, centroid_lng")
      .eq("pincode", pincode)
      .eq("active", true)
      .limit(1);
    const row = Array.isArray(data) && data.length > 0
      ? (data[0] as {
          id: string;
          name: string;
          centroid_lat: number | string;
          centroid_lng: number | string;
        })
      : null;
    if (row) {
      return {
        ok: true,
        zone: {
          zoneId: row.id,
          zoneName: row.name,
          pincode,
          lat: Number(row.centroid_lat),
          lng: Number(row.centroid_lng),
          source: "pincode",
        },
      };
    }
  } catch {
    /* fall through to unresolved */
  }

  // Configured as serviceable but no sector row — allow it and flag it, so the
  // operator can see which orders were accepted without a mapped zone.
  return {
    ok: true,
    zone: {
      zoneId: null,
      zoneName: null,
      pincode,
      lat: null,
      lng: null,
      source: "unresolved",
    },
  };
}
