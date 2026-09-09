/**
 * Server-side data for the home page (rendered at build / ISR time).
 *
 * The home used to be a static shell that fetched the catalogue in the
 * browser after hydration, so the first paint had no products and the LCP
 * waited for React + supabase-js. Fetching here lets the page ship real
 * rails, category thumbnails and cards in the HTML; the client hooks are
 * seeded with this data and only refetch when the visitor filters/searches.
 *
 * Anonymous (anon key) reads only, customer-safe columns only — never
 * cost_price / supplier. Responses are cached in Next's data cache for
 * HOME_REVALIDATE_SECONDS (the page itself revalidates on the same cadence).
 */

import { createClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/supabase/helpers";
import type { Category, Product } from "@/types";

export const HOME_REVALIDATE_SECONDS = 60;

// What the home page actually renders: cards (name/price/mrp/unit/stock/
// image/variants), rails (category, subcategory) and the "Coming soon"
// logic. Long-form fields (description, nutrition, seller block…) stay on
// the product page so the HTML/RSC payload stays lean.
// (No category join: the home resolves category names from the categories
// list by id, and the join alone repeated ~120 bytes per product in the
// payload. Ordering by created_at still happens server-side.)
const HOME_PRODUCT_SELECT =
  "id,name,category_id,subcategory,price,mrp,unit,image_url,stock,active," +
  "variants:product_variants(id,unit,price,mrp,stock,sort_order,is_default)";

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          next: { revalidate: HOME_REVALIDATE_SECONDS },
        } as RequestInit),
    },
  });
}

export interface HomeData {
  products: Product[];
  categories: Category[];
}

/**
 * Active catalogue + active categories for the home page, or null when the
 * server cannot read Supabase (demo mode, missing env, query error) — the
 * client hooks then fetch exactly as before.
 */
export async function getHomeData(): Promise<HomeData | null> {
  if (isDemoMode()) return null;
  const supabase = anonClient();
  if (!supabase) return null;

  const pageSize = 1000;
  const fetchAllProducts = async () => {
    const all: Product[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("products")
        .select(HOME_PRODUCT_SELECT)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as unknown as Product[]));
      if (data.length < pageSize) break;
    }
    return all;
  };

  try {
    const [products, cats] = await Promise.all([
      fetchAllProducts(),
      supabase.from("categories").select("*").eq("active", true).order("sort_order"),
    ]);
    if (cats.error) throw cats.error;
    return { products, categories: (cats.data as Category[]) ?? [] };
  } catch (err) {
    console.error("[home-data] falling back to client fetch:", err);
    return null;
  }
}
