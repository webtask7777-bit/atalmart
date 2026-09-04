/**
 * Server-side, anonymous (public) product reads for SEO surfaces —
 * generateMetadata, JSON-LD and the sitemap.
 *
 * Uses a plain supabase-js client with the anon key (no cookies, no session)
 * so the responses are cacheable: every fetch is tagged with
 * `next.revalidate` so Next's data cache serves repeat hits for 5 minutes.
 * Only the customer-safe columns are selected — never cost_price/supplier.
 */

import { createClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/supabase/helpers";
import { supabaseTransformUrl } from "@/lib/supabase-image-url";

export interface PublicProduct {
  id: string;
  name: string;
  name_hi: string | null;
  description: string | null;
  price: number;
  mrp: number;
  unit: string;
  image_url: string | null;
  image_urls: string[] | null;
  stock: number;
  active: boolean;
  created_at: string;
  category: { name: string } | null;
}

const PUBLIC_PRODUCT_SELECT =
  "id,name,name_hi,description,price,mrp,unit,image_url,image_urls,stock,active,created_at,category:categories(name)";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REVALIDATE_SECONDS = 300;

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          // Next.js-extended fetch option: cache in the data cache for 5 min.
          next: { revalidate: REVALIDATE_SECONDS },
        } as RequestInit),
    },
  });
}

/** Active product by id, or null (also null in demo mode / bad id). */
export async function getPublicProduct(
  id: string,
): Promise<PublicProduct | null> {
  if (isDemoMode() || !UUID_RE.test(id)) return null;
  const supabase = publicClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PublicProduct;
}

/** Every active product's id + created_at (paginated past the 1000-row cap). */
export async function listPublicProductIds(): Promise<
  { id: string; created_at: string }[]
> {
  if (isDemoMode()) return [];
  const supabase = publicClient();
  if (!supabase) return [];
  const pageSize = 1000;
  const all: { id: string; created_at: string }[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select("id,created_at")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

/** Square 800px social-preview version of the product's front-of-pack image. */
export function productOgImage(product: PublicProduct): string | null {
  return supabaseTransformUrl(product.image_url, {
    width: 800,
    height: 800,
    quality: 80,
  });
}

/**
 * "Name (unit)" — but most catalogue names already end in the pack size
 * ("… Pouch (1 kg)"), so only append the unit when it isn't in the name.
 */
export function productDisplayName(product: PublicProduct): string {
  const unit = product.unit?.trim();
  if (!unit) return product.name;
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return norm(product.name).includes(norm(unit))
    ? product.name
    : `${product.name} (${unit})`;
}

/** Short, honest description for meta tags when the catalogue has none. */
export function productMetaDescription(product: PublicProduct): string {
  const custom = product.description?.trim();
  if (custom && custom.length > 30) return custom.slice(0, 160);
  const off =
    product.mrp > product.price
      ? ` MRP ₹${product.mrp}, ${Math.round(((product.mrp - product.price) / product.mrp) * 100)}% off.`
      : "";
  return `${productDisplayName(product)} sirf ₹${product.price} mein.${off} Naya Raipur (Atal Nagar) mein Atalmart se quick delivery.`;
}
