"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import { CUSTOMER_PRODUCT_SELECT } from "@/lib/supabase/product-columns";
import {
  demoCategories,
  featuredProducts,
  FEATURED_IDS,
  loadCategory,
  loadAllDemoProducts,
  getCachedProduct,
} from "@/lib/demo-products";
import { getAllDemoProducts, getDemoProduct } from "@/lib/store/demo-products";
import type { Product, Category } from "@/types";

/**
 * Merge runtime-imported products (admin Excel uploads) with a base array
 * (runtime takes priority on id collision). Used to combine the local
 * mutable runtime store with whichever seed slice we just lazy-loaded.
 */
function mergeRuntime(base: Product[]): Product[] {
  const runtime = getAllDemoProducts();
  if (runtime.length === 0) return base;
  const seen = new Set(runtime.map((p) => p.id));
  return [...runtime, ...base.filter((p) => !seen.has(p.id))];
}

export function useProducts(options?: {
  /** Filter by exact category name (e.g. "Personal Care"). Resolves to the
   *  right backend id internally — sort_order string in demo, UUID in live. */
  categoryName?: string | null;
  /** @deprecated Use categoryName. Kept for legacy callers. */
  categoryId?: string | null;
  search?: string;
}) {
  const [products, setProducts] = useState<Product[]>(() => {
    // Render featured immediately for the homepage / "All" mode so the grid
    // doesn't flash empty while the lazy chunks load.
    if (isDemoMode() && !options?.categoryName && !options?.categoryId && !options?.search) {
      return mergeRuntime(featuredProducts);
    }
    return [];
  });
  const [categories, setCategories] = useState<Category[]>(
    isDemoMode() ? demoCategories : [],
  );
  const [loading, setLoading] = useState(true);

  // Latest-only guard: when categoryId or search changes mid-fetch, we want
  // the older awaiter to drop its result instead of overwriting the newer
  // one. Bumping a counter on each invocation and checking inside the async
  // body covers both lazy-load and Supabase paths.
  const reqIdRef = useRef(0);

  const fetchProducts = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);

    // Resolve categoryName → demo sort_order id ("1".."20"). Live mode does
    // the same resolution against the Supabase categories table below.
    const resolvedDemoCatId = options?.categoryName
      ? demoCategories.find((c) => c.name === options.categoryName)?.id ?? null
      : options?.categoryId ?? null;

    if (isDemoMode()) {
      let base: Product[];
      if (options?.search) {
        // Search ALWAYS wins over categoryId — users typing in search expect
        // global matches, not "no results" because they happened to be on
        // Personal Care when they searched for "haldiram". loadAll() caches
        // after first call so subsequent keystrokes are instant.
        base = await loadAllDemoProducts();
      } else if (resolvedDemoCatId) {
        // Single-category browse: lazy-load just that chunk.
        base = await loadCategory(resolvedDemoCatId);
      } else {
        // Homepage "All": load full catalogue so featured isn't all the user sees.
        base = await loadAllDemoProducts();
      }
      if (myReqId !== reqIdRef.current) return; // a newer call superseded us
      let filtered = mergeRuntime(base);
      if (options?.search) {
        const q = options.search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.name_hi.includes(q) ||
            (p.description || "").toLowerCase().includes(q),
        );
      }
      setProducts(filtered);
      setCategories(demoCategories);
      setLoading(false);
      return;
    }

    const supabase = createClient();

    // Categories first so we can resolve categoryName → UUID before the
    // product query fires (in parallel with it still — we just use the
    // resolved id when building the filter).
    const catPromise = supabase
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order");

    let categoryUuid: string | null = options?.categoryId ?? null;
    if (options?.categoryName) {
      const catRows = (await catPromise).data as Category[] | null;
      categoryUuid =
        catRows?.find((c) => c.name === options.categoryName)?.id ?? null;
    }

    // PostgREST caps a response at 1000 rows (supabase/config.toml max_rows)
    // and the catalogue is 1300+ SKUs, so page explicitly — otherwise the home
    // grid, the "Coming soon" category logic and the item counts silently
    // stop at the newest 1000 products.
    const pageSize = 1000;
    const buildQuery = (from: number) => {
      let q = supabase
        .from("products")
        // Customer-facing: cost_price / supplier_id are excluded (admin-only).
        .select(CUSTOMER_PRODUCT_SELECT)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (categoryUuid) q = q.eq("category_id", categoryUuid);
      if (options?.search) {
        // Catalogue names mix accented and plain spellings ("NESCAFÉ" vs
        // "Nescafe", "Lakmé" vs "Lakme"). An accented letter in the query
        // becomes a single-character ILIKE wildcard so either spelling hits.
        const term = options.search.replace(/[^\x00-\x7F]/gu, "_");
        q = q.or(
          `name.ilike.%${term}%,name_hi.ilike.%${term}%,description.ilike.%${term}%`,
        );
      }
      return q;
    };
    const fetchAllPages = async () => {
      const all: Product[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery(from);
        if (error || !data || data.length === 0) break;
        all.push(...(data as unknown as Product[]));
        if (data.length < pageSize) break;
      }
      return all;
    };

    const [allProducts, catResult] = await Promise.all([fetchAllPages(), catPromise]);

    if (myReqId !== reqIdRef.current) return;
    setProducts(allProducts);
    setCategories((catResult.data as Category[]) || []);
    setLoading(false);
  }, [options?.categoryId, options?.categoryName, options?.search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, categories, loading, refetch: fetchProducts };
}

export function useAllProducts() {
  const [products, setProducts] = useState<Product[]>(() =>
    isDemoMode() ? mergeRuntime(featuredProducts) : [],
  );
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    if (isDemoMode()) {
      const base = await loadAllDemoProducts();
      // Demo sandbox: synthesise wholesale costs so the Pricing & P&L pages
      // have margins to show. No-op in live mode (real costs come from the DB).
      const { withDemoCosts } = await import("@/lib/demo-costs");
      setProducts(withDemoCosts(mergeRuntime(base)));
      setLoading(false);
      return;
    }
    const supabase = createClient();
    // Paginate explicitly — Supabase/PostgREST caps a single response at 1000
    // rows. The admin catalogue exceeds that (1300+ SKUs), so without paging
    // ~300 products were silently invisible in the admin (couldn't be edited
    // or re-published). Fetch in 1000-row pages until a short page arrives.
    const pageSize = 1000;
    const all: Product[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("products")
        .select("*, category:categories(*), variants:product_variants(*), supplier:suppliers(id,name)")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as Product[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setProducts(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { products, loading, refetch: fetchAll };
}

export function useProduct(id: string | undefined) {
  // Synchronous initial state: try runtime store first, then cache, then
  // featured. If the product lives in a not-yet-loaded category we render
  // null on first paint and resolve to the real product after the lazy load.
  const initial = useMemo(() => {
    if (!id || !isDemoMode()) return null;
    return (
      getDemoProduct(id) ||
      getCachedProduct(id) ||
      featuredProducts.find((p) => p.id === id) ||
      null
    );
  }, [id]);
  const [product, setProduct] = useState<Product | null>(initial);
  // Loading is true unless we already have a synchronous hit. Previous logic
  // (`!isDemoMode() && !initial`) was inverted in demo mode — showed
  // "not found" empty state for a tick before the lazy chunk resolved.
  const [loading, setLoading] = useState(!id ? false : !initial);

  useEffect(() => {
    if (!id) return;
    if (isDemoMode()) {
      if (initial) return; // Already resolved synchronously
      // Lazy-load the whole catalogue to find it; in practice the user has
      // usually browsed a category first so this hits the cache.
      let cancelled = false;
      (async () => {
        const all = await loadAllDemoProducts();
        if (!cancelled) {
          setProduct(all.find((p) => p.id === id) || null);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("products")
        // Customer-facing: cost_price / supplier_id are excluded (admin-only).
        .select(CUSTOMER_PRODUCT_SELECT)
        .eq("id", id)
        .eq("active", true)
        .maybeSingle();
      if (!cancelled) {
        setProduct((data as unknown as Product) || null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, initial]);

  return { product, loading };
}

export async function createProduct(
  product: Omit<Product, "id" | "created_at" | "category">,
) {
  if (isDemoMode())
    return {
      data: {
        ...product,
        id: `demo-${Date.now()}`,
        created_at: new Date().toISOString(),
      },
      error: null,
    };
  const supabase = createClient();
  return supabase.from("products").insert(product).select().single();
}

export async function updateProduct(id: string, updates: Partial<Product>) {
  if (isDemoMode()) return { data: updates, error: null };
  const supabase = createClient();
  // If stock is being changed, prefer the audited RPC (migration 006) so the
  // stock-movement ledger row gets a real reason + actor instead of
  // 'unspecified'. The non-stock fields still go through a plain UPDATE.
  //
  // The RPC may not be installed yet (e.g. migration 006 hasn't been applied
  // to a particular environment). In that case PostgREST returns a "function
  // does not exist" error (code PGRST202 / 42883) and we silently fall back
  // to the plain UPDATE so admins aren't blocked — the trigger from 006
  // (when it lands) will still capture the change, just labeled
  // 'unspecified'.
  if (typeof updates.stock === "number") {
    const { stock, ...rest } = updates;
    const adjustResult = await supabase.rpc("admin_adjust_stock", {
      p_product_id: id,
      p_new_stock: stock,
      p_reason: "admin_edit",
      p_notes: null,
    });
    const rpcMissing =
      adjustResult.error &&
      (adjustResult.error.code === "PGRST202" ||
        adjustResult.error.code === "42883" ||
        /admin_adjust_stock/i.test(adjustResult.error.message || ""));
    if (adjustResult.error && !rpcMissing) return adjustResult;
    if (rpcMissing) {
      // Fall back to plain UPDATE with all fields including stock.
      return supabase.from("products").update(updates).eq("id", id).select().single();
    }
    if (Object.keys(rest).length === 0) {
      return supabase.from("products").select().eq("id", id).single();
    }
    return supabase.from("products").update(rest).eq("id", id).select().single();
  }
  return supabase.from("products").update(updates).eq("id", id).select().single();
}

export async function deleteProduct(id: string) {
  if (isDemoMode()) return { error: null };
  const supabase = createClient();
  return supabase.from("products").delete().eq("id", id);
}

/**
 * useCategories — returns the canonical category list with **real** IDs.
 * In demo mode this is the seeded `demoCategories` ("1".."20"). In live
 * mode it fetches the Supabase `categories` table so consumers get true
 * UUIDs that match `products.category_id`.
 *
 * Used by the admin products page (sidebar + per-row label) where matching
 * against `String(i+1)` instead of the real UUID was silently producing
 * 0-count badges and a blank Category column.
 */
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(() =>
    isDemoMode() ? demoCategories : [],
  );
  const [loading, setLoading] = useState<boolean>(!isDemoMode());

  const fetchCategories = useCallback(async () => {
    if (isDemoMode()) {
      setCategories(demoCategories);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    setCategories((data as Category[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return { categories, loading, refetch: fetchCategories };
}

/**
 * Stock-movement ledger row, mirrors `public.stock_movements` from
 * migration 006_stock_movements.sql.
 */
export interface StockMovement {
  id: number;
  product_id: string;
  delta: number;
  before_stock: number;
  after_stock: number;
  reason: string;
  source: string;
  order_id: string | null;
  batch_code: string | null;
  expiry_date: string | null;
  store_id: string | null;
  notes: string | null;
  actor_id: string | null;
  created_at: string;
}

/**
 * useStockMovements — most-recent audit-log entries for a single product.
 * Returns [] in demo mode (the ledger lives in Supabase, not localStorage).
 */
export function useStockMovements(productId: string | undefined, limit = 25) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchMovements = useCallback(async () => {
    if (!productId || isDemoMode()) {
      setMovements([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(limit);
    setMovements((data as StockMovement[]) || []);
    setLoading(false);
  }, [productId, limit]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  return { movements, loading, refetch: fetchMovements };
}

// Re-exports for any caller that previously imported the flat seed.
// `FEATURED_IDS` is exported in case admin code wants to know what's featured.
export { FEATURED_IDS };
