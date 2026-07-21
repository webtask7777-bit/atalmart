import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/geo/sectors
 *
 * Returns the active service area as a GeoJSON FeatureCollection.
 * Single PostGIS RPC call — designed to be consumed by:
 *   - Atalmart's own ServiceAreaMap component
 *   - future Naya Raipur apps (rideshare, civic-services, etc.)
 *
 * Public route. Polygon geometry IS the answer; no auth needed.
 * Edge-cached for 1 hour since the sector set rarely changes.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Geo backbone not configured" },
      { status: 503 },
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("list_sectors_geojson");

  if (error) {
    return NextResponse.json(
      { error: "Failed to load sectors", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? { type: "FeatureCollection", features: [] }, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
