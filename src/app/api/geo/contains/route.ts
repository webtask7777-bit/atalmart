import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/geo/contains
 *
 * Body: { lat: number, lng: number }
 * Returns:
 *   200 { in_service: true,  sector: { id, name, pincode } }
 *   200 { in_service: false, nearest?: { id, name, pincode, distance_m } }
 *   400 on bad input
 *
 * Use cases:
 *   - Checkout pin-drop validation ("aap service area ke baahar ho")
 *   - Future apps wanting "is this point in Atal Nagar's residential zone?"
 *
 * Public route. Lat/lng IN, sector OUT — no PII. Edge-cacheable for
 * specific (lat, lng) pairs but the volume of unique pairs makes that
 * pointless, so we don't set Cache-Control.
 */
export const runtime = "nodejs";

interface Body {
  lat: number;
  lng: number;
}

function parseLatLng(input: unknown): Body | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseLatLng(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Provide numeric `lat` and `lng` within valid ranges" },
      { status: 400 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Geo backbone not configured" },
      { status: 503 },
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // First: is the point inside any active sector?
  const { data: hit, error: hitErr } = await supabase.rpc("contains_point", {
    p_lat: parsed.lat,
    p_lng: parsed.lng,
  });
  if (hitErr) {
    return NextResponse.json(
      { error: "Lookup failed", detail: hitErr.message },
      { status: 500 },
    );
  }
  const inside = Array.isArray(hit) && hit.length > 0 ? hit[0] : null;
  if (inside) {
    return NextResponse.json({
      in_service: true,
      sector: {
        id: inside.sector_id,
        name: inside.sector_name,
        pincode: inside.pincode,
      },
    });
  }

  // Outside: surface the nearest sector for a useful "did you mean?" hint.
  const { data: near } = await supabase.rpc("nearest_sector", {
    p_lat: parsed.lat,
    p_lng: parsed.lng,
  });
  const nearest = Array.isArray(near) && near.length > 0 ? near[0] : null;
  return NextResponse.json({
    in_service: false,
    ...(nearest && {
      nearest: {
        id: nearest.sector_id,
        name: nearest.sector_name,
        pincode: nearest.pincode,
        distance_m: Number(nearest.distance_m),
      },
    }),
  });
}
