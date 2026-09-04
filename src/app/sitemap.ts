import type { MetadataRoute } from "next";
import { listPublicProductIds } from "@/lib/server/public-product";

const BASE = "https://atalmart.com";

// Regenerate at most hourly so newly published SKUs show up without a deploy.
export const revalidate = 3600;

// Static public pages + every active product. Per-user pages (cart, orders,
// wallet…) are noindex and don't belong here.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/service-area`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/contact`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/refund-policy`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const products = await listPublicProductIds();
  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${BASE}/product/${p.id}`,
    lastModified: p.created_at ? new Date(p.created_at) : undefined,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...statics, ...productEntries];
}
