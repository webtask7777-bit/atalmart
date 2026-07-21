import type { MetadataRoute } from "next";

// Keep operational surfaces (admin, rider, checkout flow, per-user pages)
// out of search engines; everything customer-facing stays crawlable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/rider",
        "/checkout",
        "/account",
        "/invoice",
        "/track",
      ],
    },
    sitemap: "https://atalmart.com/sitemap.xml",
  };
}
