import type { NextConfig } from "next";

/**
 * Production safety check — refuses to build if demo mode is enabled
 * (explicitly or via missing Supabase config) in a NODE_ENV=production build.
 *
 * Demo mode bypasses auth and writes to localStorage instead of Supabase,
 * which is fine for local dev but catastrophic in production (anyone gets
 * admin access, no real persistence). This fast-fails at build time so
 * misconfigured deploys never start.
 *
 * For local "verify it compiles" builds, set ATALMART_ALLOW_DEMO_BUILD=true.
 * Real deploys should never set this — the auth-guard.ts runtime check is
 * the second line of defense.
 */
if (
  process.env.NODE_ENV === "production" &&
  process.env.ATALMART_ALLOW_DEMO_BUILD !== "true"
) {
  const explicitFlag = process.env.NEXT_PUBLIC_DEMO_MODE?.toLowerCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const demoActive =
    explicitFlag === "true" ||
    (explicitFlag !== "false" &&
      (!url ||
        !url.startsWith("http") ||
        url.includes("your_supabase") ||
        url.includes("example")));
  if (demoActive) {
    throw new Error(
      "[atalmart] Refusing to build in production with demo mode enabled. " +
        "Set NEXT_PUBLIC_DEMO_MODE=false AND a valid NEXT_PUBLIC_SUPABASE_URL " +
        "before deploying, OR set ATALMART_ALLOW_DEMO_BUILD=true for local " +
        "verification builds only (never on real deploys).",
    );
  }
}

const nextConfig: NextConfig = {
  // Security headers applied to every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
          },
          {
            // HSTS only meaningful over HTTPS, but harmless over HTTP — production
            // load balancer will be HTTPS. 1 year, include subdomains, preloadable.
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  // Allow Supabase storage images + the leaflet tile pattern used by the
  // tracking map. Tighten this further once production CDN is decided.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "tile.openstreetmap.org",
      },
    ],
  },
};

export default nextConfig;
