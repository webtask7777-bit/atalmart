import { createClient } from "./server";
import { isDemoMode } from "./helpers";
import type { UserRole } from "@/types";

export type GuardResult =
  | { ok: true; userId: string; role: UserRole; isDemo: boolean }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Server-side role check for API route handlers.
 *
 * In demo mode (no Supabase), allows the request through with role="admin"
 * so the local dev experience keeps working — but real deployments MUST
 * disable demo mode via NEXT_PUBLIC_DEMO_MODE=false.
 *
 * Defense-in-depth: refuses to grant admin in NODE_ENV=production even if
 * demo mode somehow slips through next.config.ts's build-time check.
 *
 * Usage:
 *   const guard = await requireRole("admin");
 *   if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });
 */
export async function requireRole(role: UserRole): Promise<GuardResult> {
  if (isDemoMode()) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 403,
        error: "Demo mode is not permitted in production",
      };
    }
    return { ok: true, userId: "demo-user", role, isDemo: true };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, status: 403, error: "Profile not found" };
  }

  if ((profile as { role: UserRole }).role !== role) {
    return { ok: false, status: 403, error: `Requires ${role} role` };
  }

  return { ok: true, userId: user.id, role, isDemo: false };
}
