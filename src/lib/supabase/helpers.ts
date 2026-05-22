/**
 * Demo mode disables Supabase calls and falls back to local demo data.
 *
 * Priority:
 *   1. NEXT_PUBLIC_DEMO_MODE = "true" / "false" → explicit override
 *   2. Auto-detect when Supabase URL is missing or placeholder
 *
 * Logs a one-time console warning in the browser when auto-detection falls
 * back to demo so misconfigured production deploys are loud, not silent.
 */
let warnedOnce = false;

export function isDemoMode(): boolean {
  const flag = process.env.NEXT_PUBLIC_DEMO_MODE?.toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const auto =
    !url ||
    !url.startsWith("http") ||
    url.includes("your_supabase") ||
    url.includes("example");

  if (auto && !warnedOnce && typeof window !== "undefined") {
    warnedOnce = true;
    console.warn(
      "[atalmart] Demo mode auto-detected (Supabase URL missing/placeholder). " +
        "Set NEXT_PUBLIC_DEMO_MODE=false + valid NEXT_PUBLIC_SUPABASE_URL for real DB.",
    );
  }

  return auto;
}

