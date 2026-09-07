import type { Product, Category } from "@/types";
import { FEATURED_IDS } from "./featured";

/**
 * Demo product catalogue — split into 20 per-category files that the catalogue
 * hook lazy-loads on demand.
 *
 * **Why split?** With ~1500 SKUs the single-file demoProducts array bloats the
 * customer's initial JS bundle by ~200KB. Splitting + lazy-loading means:
 *
 * - Homepage render: ships ONLY the small FEATURED set + categories metadata.
 * - Category browse: fetches that one category's chunk on click.
 * - Search: pulls the full catalogue in parallel on first keystroke (cached
 *   thereafter — `loadAll()` is memoized).
 *
 * Each `cat-NN-slug.ts` file exports a `products: Product[]` array. The
 * loaders map below points at them via dynamic import so Turbopack/webpack
 * creates a separate chunk per category.
 */

export const demoCategories: Category[] = [
  { id: "1",  name: "Paan Corner",                 name_hi: "पान कॉर्नर",          icon: "🥥", sort_order: 1,  active: true },
  { id: "2",  name: "Dairy",                       name_hi: "डेयरी",              icon: "🥛", sort_order: 2,  active: true },
  { id: "3",  name: "Fruits & Vegetables",         name_hi: "फल और सब्जी",         icon: "🥬", sort_order: 3,  active: true },
  { id: "4",  name: "Cold Drinks & Juices",        name_hi: "कोल्ड ड्रिंक्स और जूस", icon: "🥤", sort_order: 4,  active: true },
  { id: "5",  name: "Snacks & Munchies",           name_hi: "स्नैक्स",             icon: "🍿", sort_order: 5,  active: true },
  { id: "6",  name: "Breakfast & Instant Food",    name_hi: "ब्रेकफास्ट और इंस्टेंट फूड", icon: "🍜", sort_order: 6, active: true },
  { id: "7",  name: "Chocolates & Sweets",         name_hi: "मीठा",               icon: "🍫", sort_order: 7,  active: true },
  { id: "8",  name: "Bakery & Biscuits",           name_hi: "बेकरी और बिस्किट",     icon: "🍪", sort_order: 8,  active: true },
  { id: "9",  name: "Tea, Coffee & Health Drink",  name_hi: "चाय, कॉफी और हेल्थ ड्रिंक", icon: "☕", sort_order: 9, active: true },
  { id: "10", name: "Atta, Rice & Dal",            name_hi: "आटा, चावल और दाल",    icon: "🌾", sort_order: 10, active: true },
  { id: "11", name: "Masala, Oil & More",          name_hi: "मसाले, तेल और बहुत कुछ", icon: "🌶️", sort_order: 11, active: true },
  { id: "12", name: "Sauces & Spreads",            name_hi: "सॉस और स्प्रेड",      icon: "🍯", sort_order: 12, active: true },
  { id: "13", name: "Chicken, Meat & Fish",        name_hi: "चिकन, मांस और मछली",  icon: "🍗", sort_order: 13, active: true },
  { id: "15", name: "Baby Care",                   name_hi: "बेबी केयर",          icon: "🍼", sort_order: 15, active: true },
  { id: "16", name: "Pharma & Wellness",           name_hi: "दवाई और स्वास्थ्य",   icon: "💊", sort_order: 16, active: true },
  { id: "17", name: "Cleaning Essentials",         name_hi: "सफाई",               icon: "🧹", sort_order: 17, active: true },
  { id: "18", name: "Stationery, Office & School",  name_hi: "स्टेशनरी, ऑफिस और स्कूल", icon: "✏️", sort_order: 18, active: true },
  { id: "19", name: "Personal Care",               name_hi: "पर्सनल केयर",        icon: "🧴", sort_order: 19, active: true },
  { id: "20", name: "Pet Care",                    name_hi: "पेट केयर",           icon: "🐶", sort_order: 20, active: true },
];

/** Dynamic import → chunked by bundler. One key per category id. */
const loaders: Record<string, () => Promise<{ products: Product[] }>> = {
  "1":  () => import("./cat-01-paan-corner"),
  "2":  () => import("./cat-02-dairy-bread-eggs"),
  "3":  () => import("./cat-03-fruits-vegetables"),
  "4":  () => import("./cat-04-cold-drinks-juices"),
  "5":  () => import("./cat-05-snacks-munchies"),
  "6":  () => import("./cat-06-breakfast-instant"),
  "7":  () => import("./cat-07-sweet-tooth"),
  "8":  () => import("./cat-08-bakery-biscuits"),
  "9":  () => import("./cat-09-tea-coffee"),
  "10": () => import("./cat-10-atta-rice-dal"),
  "11": () => import("./cat-11-masala-oil"),
  "12": () => import("./cat-12-sauces-spreads"),
  "13": () => import("./cat-13-meat-fish"),
  "15": () => import("./cat-15-baby-care"),
  "16": () => import("./cat-16-pharma-wellness"),
  "17": () => import("./cat-17-cleaning"),
  "18": () => import("./cat-18-home-office"),
  "19": () => import("./cat-19-personal-care"),
  "20": () => import("./cat-20-pet-care"),
};

/** Cache: category id → loaded products. Survives across renders. */
const categoryCache = new Map<string, Product[]>();
let allCache: Product[] | null = null;
let allPromise: Promise<Product[]> | null = null;

/** Lazy-load one category. Cached after first call. */
export async function loadCategory(id: string): Promise<Product[]> {
  if (categoryCache.has(id)) return categoryCache.get(id)!;
  const loader = loaders[id];
  if (!loader) return [];
  const mod = await loader();
  const { paintDemoImages } = await import("./paint-images");
  const painted = await paintDemoImages(mod.products);
  categoryCache.set(id, painted);
  return painted;
}

/**
 * Lazy-load every category in parallel. Cached after first call; subsequent
 * callers share the in-flight promise so we never double-fetch.
 *
 * On rejection we clear `allPromise` so the next caller retries instead of
 * receiving the same cached rejection forever.
 */
export async function loadAllDemoProducts(): Promise<Product[]> {
  if (allCache) return allCache;
  if (allPromise) return allPromise;
  allPromise = Promise.all(
    Object.entries(loaders).map(async ([id, loader]) => {
      const mod = await loader();
      const { paintDemoImages } = await import("./paint-images");
      const painted = await paintDemoImages(mod.products);
      categoryCache.set(id, painted);
      return painted;
    }),
  )
    .then((arrays) => {
      allCache = arrays.flat();
      return allCache;
    })
    .catch((err) => {
      // Clear the cached failure so subsequent callers retry from scratch
      // rather than re-throwing this same rejection forever.
      allPromise = null;
      throw err;
    });
  return allPromise;
}

/** Featured list for homepage initial render — eagerly imported, tiny chunk. */
export { featuredProducts } from "./featured";
export { FEATURED_IDS };

/**
 * Sync lookup against the in-memory cache. Returns null if the product's
 * category hasn't been loaded yet — caller should fall back to async lookup.
 */
export function getCachedProduct(id: string): Product | null {
  if (allCache) return allCache.find((p) => p.id === id) ?? null;
  for (const products of categoryCache.values()) {
    const hit = products.find((p) => p.id === id);
    if (hit) return hit;
  }
  return null;
}
