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

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * Every third party the browser talks to must be listed here — a missing
 * origin silently breaks that feature (login, payment, maps), so when adding
 * an integration add its origins in the same PR:
 *   • Supabase       — data/auth/storage/realtime (connect)
 *   • Razorpay       — Checkout.js (script), payment modal (frame), API (connect)
 *   • MSG91/phone91  — OTP widget script + its iframe/API
 *   • unpkg.com      — Leaflet JS/CSS for the service-area + rider maps
 *   • OpenStreetMap  — map tiles (img)
 *   • Vercel         — Analytics + Speed Insights beacons
 *
 * `'unsafe-inline'` for scripts is required by Next.js's inline bootstrap
 * (no nonce plumbing yet); styles need it for Tailwind's inline vars.
 * `'unsafe-eval'` is dev-only (React Refresh).
 *
 * Roll-out switch: set CSP_REPORT_ONLY=true to log violations without
 * blocking (useful right after adding a new integration), then remove it.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com https://*.razorpay.com https://verify.msg91.com https://verify.phone91.com https://*.msg91.com https://unpkg.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} https://*.supabase.co wss://*.supabase.co https://*.razorpay.com https://*.msg91.com https://*.phone91.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://tile.openstreetmap.org`,
  "frame-src 'self' https://*.razorpay.com https://*.msg91.com https://*.phone91.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const cspHeaderName =
  process.env.CSP_REPORT_ONLY === "true"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

const nextConfig: NextConfig = {
  // A stray ~/package-lock.json makes Next infer the wrong workspace root
  // (build warning + wrong file tracing). Pin it to this project.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  // pdf.js loads its worker/fonts relative to its own package files; bundling
  // it breaks that. Keep it as a runtime require from node_modules.
  serverExternalPackages: ["pdfjs-dist"],

  // Security headers applied to every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: cspHeaderName, value: csp },
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

  images: {
    // Vercel's image optimizer quota was exhausted (402s broke every <Image>
    // site-wide), so we don't use it at all. Instead a custom loader routes
    // Supabase Storage URLs through Supabase's own transform endpoint
    // (resize + WebP), and returns every other src untouched. See
    // src/lib/image-loader.ts.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Widths next/image may request. Product cards are ~124–200 px, the
    // detail hero ≤ 500 px; keep the list short so srcset stays sane.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 192, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/**",
      },
      {
        protocol: "https",
        hostname: "tile.openstreetmap.org",
      },
    ],
  },
};

export default nextConfig;
