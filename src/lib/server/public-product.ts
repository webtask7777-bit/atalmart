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
import { familyName, sellableName } from "@/lib/product-name";

export interface PublicVariant {
  id: string;
  unit: string;
  price: number;
  mrp: number;
  stock: number;
  is_default: boolean;
  sort_order: number;
}

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
  /** Pack-size variants (migration 004). Empty for single-pack products. */
  variants?: PublicVariant[] | null;
}

const PUBLIC_PRODUCT_SELECT =
  "id,name,name_hi,description,price,mrp,unit,image_url,image_urls,stock,active,created_at,category:categories(name)," +
  "variants:product_variants(id,unit,price,mrp,stock,is_default,sort_order)";

/** The pack the page represents: the default variant when the product has
 *  variants (the PDP, card and cart all start from it), else the product
 *  row. The <title>, meta description and JSON-LD must quote THIS price —
 *  the audit found the title saying ₹28 while the page sold the pack for ₹30. */
export interface PrimaryOffer {
  price: number;
  mrp: number;
  unit: string;
  stock: number;
  /** All sellable packs, for AggregateOffer. */
  packs: { unit: string; price: number; stock: number }[];
}

export function primaryOffer(product: PublicProduct): PrimaryOffer {
  const vs = (product.variants ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  if (vs.length === 0) {
    return {
      price: Math.round(product.price),
      mrp: Math.round(product.mrp),
      unit: product.unit,
      stock: product.stock,
      packs: [{ unit: product.unit, price: Math.round(product.price), stock: product.stock }],
    };
  }
  const def = vs.find((v) => v.is_default) ?? vs[0];
  return {
    price: Math.round(def.price),
    mrp: Math.round(def.mrp),
    unit: def.unit,
    stock: def.stock,
    packs: vs.map((v) => ({ unit: v.unit, price: Math.round(v.price), stock: v.stock })),
  };
}

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

export interface PublicProductResult {
  product: PublicProduct | null;
  /** true when the lookup could not run (missing env, Supabase error) —
   *  callers must NOT treat that as "no such product". */
  failed: boolean;
}

/** Active product by id. `product` is null for demo mode / bad id / no row. */
export async function getPublicProductResult(id: string): Promise<PublicProductResult> {
  if (isDemoMode() || !UUID_RE.test(id)) return { product: null, failed: false };
  const supabase = publicClient();
  if (!supabase) {
    console.error("[public-product] Supabase env missing on the server — product SEO disabled");
    return { product: null, failed: true };
  }
  const { data, error } = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("[public-product] lookup failed", id, error.message);
    return { product: null, failed: true };
  }
  return { product: (data as unknown as PublicProduct) ?? null, failed: false };
}

/** Convenience wrapper — null on both "not found" and "failed". */
export async function getPublicProduct(id: string): Promise<PublicProduct | null> {
  return (await getPublicProductResult(id)).product;
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
    if (error) {
      // Throw rather than return a partial list: the sitemap route caches
      // its result for an hour, and an empty/partial product list would be
      // served to crawlers with no signal. A thrown error keeps the stale one.
      throw new Error(`[public-product] sitemap product list failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
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
 * "Family (pack)" for the primary offer. Most catalogue names already end in
 * the pack size ("… Pouch (1 kg)"); for a product with variants the bracket
 * in the name is replaced by the default pack so the title matches the page.
 */
export function productDisplayName(product: PublicProduct): string {
  const offer = primaryOffer(product);
  const hasVariants = (product.variants?.length ?? 0) > 0;
  if (hasVariants) return sellableName(product.name, offer.unit);
  const unit = product.unit?.trim();
  if (!unit) return product.name;
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return norm(product.name).includes(norm(unit))
    ? product.name
    : `${product.name} (${unit})`;
}

/** Size-free name for JSON-LD `name` when packs are listed separately. */
export function productFamilyName(product: PublicProduct): string {
  return (product.variants?.length ?? 0) > 0 ? familyName(product.name) : product.name;
}

/** Short, honest description for meta tags when the catalogue has none. */
export function productMetaDescription(product: PublicProduct): string {
  const custom = product.description?.trim();
  if (custom && custom.length > 30) return custom.slice(0, 160);
  const offer = primaryOffer(product);
  const off =
    offer.mrp > offer.price
      ? ` MRP ₹${offer.mrp}, ${Math.round(((offer.mrp - offer.price) / offer.mrp) * 100)}% off.`
      : "";
  return `${productDisplayName(product)} sirf ₹${offer.price} mein.${off} Naya Raipur (Atal Nagar) mein Atalmart se quick delivery.`;
}
