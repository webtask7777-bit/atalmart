/**
 * Zone-based delivery-time estimate, shown ONLY on the header "DELIVER TO"
 * location chip once the customer has set a precise sector. Base store =
 * Sector 29. The customer's resolved sector arrives as the `area` label on
 * useUserPincodeStore (e.g. "Sector 24, Atal Nagar"); we parse the number out
 * and map it to a zone bracket.
 *
 * Deliberately NOT shown on the home promise-strip or checkout (owner wanted
 * minutes only at the location chip). Flip DELIVERY_ETA_ENABLED to hide it.
 */

export const DELIVERY_ETA_ENABLED = true;

export interface Eta {
  min: number;
  max: number;
  zone: string;
}

interface Zone {
  name: string;
  sectors: number[];
  min: number;
  max: number;
}

export const ZONES: Zone[] = [
  { name: "Immediate", sectors: [29, 27], min: 15, max: 20 },
  { name: "Medium", sectors: [28, 26, 25, 24, 23, 22, 21, 19], min: 25, max: 30 },
];

/** Resolved-but-far / out-of-list locations (e.g. IIIT, HNLU, IIM, Jungle Safari). */
export const OUTER_ETA: Eta = { min: 35, max: 45, zone: "Outer" };

/** Pull the sector number out of an area label like "Sector 24, Atal Nagar". */
export function sectorNumberFromArea(area: string | null | undefined): number | null {
  if (!area) return null;
  const m = /sector\s*(\d+)/i.exec(area);
  return m ? Number(m[1]) : null;
}

/**
 * ETA for a resolved area label. Returns null when the sector can't be
 * determined (bare pincode / no location) so the chip just shows the label.
 */
export function etaForArea(area: string | null | undefined): Eta | null {
  const sector = sectorNumberFromArea(area);
  if (sector == null) return null;
  const zone = ZONES.find((z) => z.sectors.includes(sector));
  if (zone) return { min: zone.min, max: zone.max, zone: zone.name };
  return OUTER_ETA;
}

/** "15–20 min" */
export function formatEta(eta: Eta): string {
  return `${eta.min}–${eta.max} min`;
}
