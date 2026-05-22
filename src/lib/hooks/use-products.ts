"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
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

    let query = supabase
      .from("products")
      .select("*, category:categories(*), variants:product_variants(*)")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (categoryUuid) {
      query = query.eq("category_id", categoryUuid);
    }
    if (options?.search) {
      query = query.or(
        `name.ilike.%${options.search}%,name_hi.ilike.%${options.search}%,description.ilike.%${options.search}%`,
      );
    }

    const [prodResult, catResult] = await Promise.all([query, catPromise]);

    if (myReqId !== reqIdRef.current) return;
    setProducts((prodResult.data as Product[]) || []);
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
      setProducts(mergeRuntime(base));
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("products")
      .select("*, category:categories(*), variants:product_variants(*)")
      .order("created_at", { ascending: false });
    setProducts((data as Product[]) || []);
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
        .select("*, category:categories(*), variants:product_variants(*)")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setProduct((data as Product) || null);
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
  return supabase.from("products").update(updates).eq("id", id).select().single();
}

export async function deleteProduct(id: string) {
  if (isDemoMode()) return { error: null };
  const supabase = createClient();
  return supabase.from("products").delete().eq("id", id);
}

// Re-exports for any caller that previously imported the flat seed.
// `FEATURED_IDS` is exported in case admin code wants to know what's featured.
export { FEATURED_IDS };
