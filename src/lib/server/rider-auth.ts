import { NextResponse } from "next/server";
import { verifyRiderToken, bearerFrom } from "@/lib/server/rider-session";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RiderContext {
  riderId: string;
  supabase: SupabaseClient;
}

/**
 * Authenticate a /api/rider/* request. On success returns { ctx }, on failure
 * returns { response } with the appropriate 401/503 so the caller can early-out:
 *
 *   const { ctx, response } = await requireRider(req);
 *   if (response) return response;
 *   // ...use ctx.riderId / ctx.supabase
 */
export async function requireRider(
  req: Request,
): Promise<{ ctx?: RiderContext; response?: NextResponse }> {
  const riderId = verifyRiderToken(bearerFrom(req));
  if (!riderId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient();
  } catch {
    return {
      response: NextResponse.json(
        { error: "Server not configured" },
        { status: 503 },
      ),
    };
  }
  return { ctx: { riderId, supabase } };
}
