/**
 * Delivery-time estimate for a resolved area label, shown on the header
 * "DELIVER TO" chip once the customer has a precise sector. ETAs come from
 * the generated service-area data (src/lib/sectors-data.ts): straight-line
 * distance from the Sector 27 dark store, bucketed into zones. Regenerate
 * that file (scripts/generate-sectors-seed.mjs) when the store moves or a
 * sector is added — nothing here needs editing.
 *
 * Deliberately NOT shown on the home promise-strip or checkout (owner wanted
 * minutes only at the location chip). Flip DELIVERY_ETA_ENABLED to hide it.
 */

import { SECTOR_AREAS, findSectorArea, type Eta } from "@/lib/sectors-data";

export type { Eta };

export const DELIVERY_ETA_ENABLED = true;

/** Resolved-but-far / out-of-list locations (e.g. Jungle Safari, IIM). */
export const OUTER_ETA: Eta = { min: 35, max: 45, zone: "Outer" };

/** Pull the sector number out of an area label like "Sector 24, Atal Nagar". */
export function sectorNumberFromArea(area: string | null | undefined): number | null {
  if (!area) return null;
  const m = /sector\s*(\d+)/i.exec(area);
  return m ? Number(m[1]) : null;
}

/**
 * ETA for a resolved area label. Returns null when the area can't be matched
 * to a known sector/landmark (bare pincode / no location) so the chip just
 * shows the label.
 */
export function etaForArea(area: string | null | undefined): Eta | null {
  if (!area) return null;
  const n = sectorNumberFromArea(area);
  const match = n != null
    ? SECTOR_AREAS.find((s) => s.name === `Sector ${n}`)
    : findSectorArea(area.replace(/,.*$/, ""));
  if (match) return match.eta;
  // Unknown but sector-shaped ("Sector 35") → still give a conservative number.
  return n != null ? OUTER_ETA : null;
}

/** "15–20 min" */
export function formatEta(eta: Eta): string {
  return `${eta.min}–${eta.max} min`;
}
