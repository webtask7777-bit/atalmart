import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-only code (API routes). Bypasses RLS
 * — NEVER import this into a client component. The service key is read from
 * SUPABASE_SERVICE_ROLE_KEY and stays on the server.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role not configured");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
