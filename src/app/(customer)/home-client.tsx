"use client";

import { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Clock, ShieldCheck, Truck, Search, ChevronDown } from "lucide-react";
import { ProductCard } from "@/components/customer/product-card";
import { CategoryBar } from "@/components/customer/category-bar";
import { CategoryGrid } from "@/components/customer/category-grid";
import { SubcategoryStrip } from "@/components/customer/subcategory-strip";
import { AgeGate } from "@/components/customer/age-gate";
import {
  useAgeGateStore,
  useAgeGateHydrated,
  isAgeRestricted,
} from "@/lib/store/age-gate";
import { HeroCarousel } from "@/components/customer/hero-carousel";
import { ProductRail } from "@/components/customer/product-rail";
import { CartBar } from "@/components/customer/cart-bar";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { useProducts, useCategories } from "@/lib/hooks/use-products";
import { useOrders } from "@/lib/hooks/use-orders";
import { useAuth } from "@/lib/hooks/use-auth";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useSettings } from "@/lib/store/settings";
import { CATEGORIES_SEED } from "@/lib/constants";
import { shuffleForGrid, hashId } from "@/lib/product-order";
import type { Product, Category } from "@/types";

// Preferred hero keywords per category for the "Shop by category" tiles.
// When an in-stock product name matches one of these, it becomes the
// category's cover photo — so the tile shows something representative
// instead of whatever SKU happened to be newest. Categories not listed
// here just use the newest in-stock product with an image.
const CATEGORY_HERO_KEYWORDS: Record<string, string[]> = {
  "Paan Corner": ["paan", "supari", "mukhwas", "saunf", "elaichi", "mouth fresh", "rajnigandha", "pass pass"],
  "Snacks & Munchies": ["lays", "kurkure", "bhujia", "chips", "namkeen", "popcorn", "mixture", "aloo bhujia"],
  "Cold Drinks & Juices": ["coca", "pepsi", "sprite", "thums", "maaza", "frooti", "juice", "tropicana", "cola", "mountain dew", "sting", "mirinda", "7up"],
  "Chocolates & Sweets": ["dairy milk", "chocolate", "kitkat", "5 star", "perk", "gulab jamun", "rasgulla", "mithai", "ladoo", "barfi", "soan"],
  "Breakfast & Instant Food": ["maggi", "oats", "cornflakes", "kellogg", "poha", "upma", "noodles", "vermicelli", "chocos", "muesli"],
  "Tea, Coffee & Health Drink": ["tea", "chai", "nescafe", "coffee", "bournvita", "horlicks", "boost", "red label", "tata tea", "bru"],
  "Masala, Oil & More": ["oil", "masala", "everest", "mdh", "haldi", "turmeric", "mirch", "fortune", "saffola", "ghee", "garam masala"],
  "Atta, Rice & Dal": ["atta", "aashirvaad", "rice", "basmati", "dal", "toor", "moong", "chana", "chakki"],
  "Cleaning Essentials": ["surf", "vim", "harpic", "lizol", "rin", "ariel", "tide", "cleaner", "detergent", "phenyl"],
  "Personal Care": ["soap", "shampoo", "toothpaste", "colgate", "dove", "lux", "dettol", "lifebuoy", "face wash", "lotion"],
  "Baby Care": ["pampers", "huggies", "diaper", "johnson", "cerelac", "lactogen", "baby"],
  "Pharma & Wellness": ["dolo", "crocin", "vicks", "band-aid", "bandaid", "paracetamol", "sanitizer", "volini", "moov", "strepsils"],
};

// Custom per-category tile images (1:1, white bg) live in public/categories/.
// An entry here OVERRIDES the auto-picked product photo for that category.
// Collage covers were removed — drop each custom image into public/categories/
// and add its slug below. Omit a slug → that tile falls back to the auto
// product photo, then the seed emoji.
// Only the clean 2-product covers are wired. The old multi-product collages
// (Atta/Rice/Dal, Bakery & Biscuits, Snacks & Munchies, Cold Drinks & Juices)
// were removed — those tiles fall back to an auto-picked product photo until a
// 2-product cover is provided.
const CATEGORY_COVERS: Record<string, string> = {
  "Atta, Rice & Dal": "/categories/atta-rice-dal.webp",
  Dairy: "/categories/dairy.webp",
  "Cold Drinks & Juices": "/categories/cold-drinks-juices.webp",
  "Snacks & Munchies": "/categories/snacks-munchies.webp",
  "Bakery & Biscuits": "/categories/bakery-biscuits.webp",
  "Chicken, Meat & Fish": "/categories/chicken-meat-fish.webp",
  "Personal Care": "/categories/personal-care.webp",
  "Pet Care": "/categories/pet-care.webp",
  "Tea, Coffee & Health Drink": "/categories/tea-coffee.webp",
  "Chocolates & Sweets": "/categories/chocolates-sweets.webp",
  "Breakfast & Instant Food": "/categories/breakfast-instant.webp",
  "Sauces & Spreads": "/categories/sauces-spreads.webp",
  "Masala, Oil & More": "/categories/masala-oil.webp",
  "Baby Care": "/categories/baby-care.webp",
  "Cleaning Essentials": "/categories/cleaning-essentials.webp",
  "Paan Corner": "/categories/paan-corner.webp",
  "Fruits & Vegetables": "/categories/fruits-vegetables.webp",
  "Stationery, Office & School": "/categories/stationery-office-school.webp",
  "Pharma & Wellness": "/categories/pharma-wellness.webp",
};

// Chips under the search bar — the things people actually type first.
const QUICK_SEARCHES = ["Milk", "Atta", "Maggi", "Eggs", "Bread", "Oil", "Rice", "Dahi"];

/** "All products" renders in pages so the DOM (and image count) stays sane. */
const GRID_PAGE = 30;

export default function HomeClient() {
  // HomeContent reads useSearchParams, which bails static prerendering out
  // to this Suspense fallback. So the fallback IS the server-rendered HTML:
  // it must contain the above-the-fold layout (category strip, hero, promise
  // tiles, category grid) or the first paint is a bare skeleton and the LCP
  // waits for hydration + the catalogue fetch. Same components, same
  // classes — after hydration HomeContent swaps in without a visual jump.
  return (
    <Suspense fallback={<HomeStaticShell />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeStaticShell() {
  const settings = useSettings();
  const noop = () => {};
  return (
    <div className="max-w-7xl mx-auto px-4 pb-32">
      <div className="sticky top-16 z-30 -mx-4 px-4 bg-white border-b border-gray-100">
        <CategoryBar selected={null} onSelect={noop} />
      </div>
      <QuickSearches />
      <HeroCarousel />
      <section className="mt-4 grid grid-cols-3 gap-2 md:gap-3">
        <PromiseTile icon={<Clock size={16} />} title="Quick" subtitle="delivery" />
        <PromiseTile icon={<Truck size={16} />} title={`₹${settings.freeDeliveryAbove}+`} subtitle="free delivery" />
        <PromiseTile icon={<ShieldCheck size={16} />} title="100%" subtitle="genuine" />
      </section>
      <CategoryGrid selected={null} onSelect={noop} categoryThumbs={CATEGORY_COVERS} />
      <div className="mt-6">
        <ProductGridSkeleton count={10} />
      </div>
    </div>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSearch = searchParams.get("search") || "";
  // ?category=<name> deep-links straight into a category (used by the
  // /delivery/<sector> landing pages). Only seeds the initial state — the
  // strip/grid keep owning it afterwards.
  // ?category= deep links (sector pages, shared URLs). Derived-state pattern:
  // the URL value wins whenever it changes; a tap on the strip overrides it
  // until the URL changes again. No effect needed, so back/forward and
  // in-page links to /?category=X all stay in sync.
  const rawUrlCategory = searchParams.get("category");
  const urlCategory =
    rawUrlCategory && CATEGORIES_SEED.some((c) => c.name === rawUrlCategory) ? rawUrlCategory : null;
  const [catState, setCatState] = useState<{ url: string | null; value: string | null }>({
    url: urlCategory,
    value: urlCategory,
  });
  const selectedCategory = catState.url === urlCategory ? catState.value : urlCategory;
  const setSelectedCategory = useCallback(
    (value: string | null) => setCatState({ url: urlCategory, value }),
    [urlCategory],
  );
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  // Reset the subcategory whenever the parent category changes (or clears).
  useEffect(() => {
    setSelectedSub(null);
  }, [selectedCategory]);
  const [localSearch, setLocalSearch] = useState(urlSearch);
  // Keep the search box in sync with the ?search= URL param. Without this the
  // header search did nothing when you were *already* on the home page (the URL
  // updated but this local state, seeded only at mount, never caught up).
  useEffect(() => {
    setLocalSearch(urlSearch);
  }, [urlSearch]);
  const debouncedSearch = useDebounce(localSearch, 300);
  const settings = useSettings();

  // 18+ gate for tobacco categories (Paan Corner). Block the products until
  // the customer confirms — COTPA 2003 §6.
  const ageVerified = useAgeGateStore((s) => s.verified);
  const ageHydrated = useAgeGateHydrated();
  const needsAgeGate =
    isAgeRestricted(selectedCategory) && ageHydrated && !ageVerified;

  // Pass categoryName — the hook resolves to the right id internally
  // (sort_order in demo mode, UUID in live Supabase mode).
  const { products, loading } = useProducts({
    categoryName: selectedCategory,
    search: debouncedSearch || undefined,
  });
  const { categories } = useCategories();

  const { user } = useAuth();

  // ── Grid pagination ── keyed by the current view so switching category or
  // search naturally starts at the first page (no reset effect needed).
  const gridKey = `${selectedCategory ?? ""}|${debouncedSearch}`;
  const [gridLimits, setGridLimits] = useState<Record<string, number>>({});
  const gridLimit = gridLimits[gridKey] ?? GRID_PAGE;
  const setGridLimit = (fn: (n: number) => number) =>
    setGridLimits((m) => ({ ...m, [gridKey]: fn(m[gridKey] ?? GRID_PAGE) }));

  // ── Curated collections (computed from product data) ──
  const rails = useMemo(
    () => buildRails(products, categories),
    [products, categories],
  );

  // Real-product thumbnails for the category grid: one representative photo
  // per category. Prefer an in-stock SKU whose name matches the category's
  // hero keywords (so Paan Corner shows supari, not the newest random SKU),
  // then any in-stock SKU, then any SKU with an image. Categories with no
  // usable image keep their seed emoji.
  const categoryThumbs = useMemo(() => {
    const idToName = new Map(categories.map((c) => [c.id, c.name]));
    const inStockByCat = new Map<string, Product[]>();
    const anyImage: Record<string, string> = {};
    for (const p of products) {
      if (!p.image_url) continue;
      const name = p.category?.name ?? idToName.get(p.category_id);
      if (!name) continue;
      if (!anyImage[name]) anyImage[name] = p.image_url; // newest-with-image fallback
      if (p.stock > 0) {
        const arr = inStockByCat.get(name);
        if (arr) arr.push(p);
        else inStockByCat.set(name, [p]);
      }
    }
    const thumbs: Record<string, string> = { ...anyImage };
    for (const [name, list] of inStockByCat) {
      const hints = CATEGORY_HERO_KEYWORDS[name];
      const hero =
        (hints &&
          list.find((p) =>
            hints.some((h) => p.name.toLowerCase().includes(h)),
          )) ||
        list[0]; // list[0] = newest in-stock (products arrive created_at desc)
      thumbs[name] = hero.image_url!;
    }
    // Hand-built collage covers override the auto-picked single photo.
    Object.assign(thumbs, CATEGORY_COVERS);
    return thumbs;
  }, [products, categories]);

  // Categories with no in-stock/active product in the full catalogue. Only
  // computed on the unfiltered home load (products = whole catalogue there);
  // while loading or filtering we don't hide anything.
  const emptyCategories = useMemo(() => {
    if (loading || selectedCategory || debouncedSearch) return undefined;
    const idToName = new Map(categories.map((c) => [c.id, c.name]));
    const seen = new Set<string>();
    for (const p of products) {
      const name = p.category?.name ?? idToName.get(p.category_id);
      if (name) seen.add(name);
    }
    if (seen.size === 0) return undefined;
    return new Set(CATEGORIES_SEED.map((c) => c.name).filter((n) => !seen.has(n)));
  }, [loading, selectedCategory, debouncedSearch, products, categories]);

  const shuffledAll = useMemo(() => shuffleForGrid(products), [products]);
  // Category browsing also benefits from shuffle (so 3 Amul Butter sizes
  // don't appear in a row), but search results stay in API order — when a
  // user typed a query they expect matches grouped/relevance-ordered, not
  // scrambled across the screen.
  const filteredView = useMemo(
    () => (debouncedSearch ? products : shuffleForGrid(products)),
    [products, debouncedSearch],
  );

  // Blinkit-style subcategory narrowing — client-side over the already-loaded
  // category products (no extra fetch). "All" (selectedSub === null) = no narrow.
  // Only narrow by subcategory while the strip is actually visible (i.e. not
  // searching — see the strip's `!debouncedSearch` guard below). Otherwise a
  // stale sub filter would silently drop search results to zero with no chip
  // on screen to clear it.
  const viewProducts = useMemo(
    () =>
      selectedSub && !debouncedSearch
        ? filteredView.filter((p) => p.subcategory === selectedSub)
        : filteredView,
    [filteredView, selectedSub, debouncedSearch],
  );

  const isFiltered = !!selectedCategory || !!debouncedSearch;

  return (
    <div className="max-w-7xl mx-auto px-4 pb-32">
      {/* Sticky category strip (compact) */}
      <div className="sticky top-16 z-30 -mx-4 px-4 bg-white border-b border-gray-100">
        <CategoryBar
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          emptyCategories={emptyCategories}
        />
      </div>

      {!isFiltered && <QuickSearches />}

      {/* Hero carousel — only when not filtering */}
      {!isFiltered && <HeroCarousel />}

      {/* Promise strip (compact) */}
      <section className="mt-4 grid grid-cols-3 gap-2 md:gap-3">
        <PromiseTile icon={<Clock size={16} />} title="Quick" subtitle="delivery" />
        <PromiseTile icon={<Truck size={16} />} title={`₹${settings.freeDeliveryAbove}+`} subtitle="free delivery" />
        <PromiseTile icon={<ShieldCheck size={16} />} title="100%" subtitle="genuine" />
      </section>

      {!isFiltered && (
        <CategoryGrid
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          categoryThumbs={categoryThumbs}
          emptyCategories={emptyCategories}
        />
      )}

      {/* Search results header */}
      {debouncedSearch && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-sm text-gray-500">
            Results for{" "}
            <span className="font-semibold text-brown">
              &ldquo;{debouncedSearch}&rdquo;
            </span>
            {!loading && (
              <span className="text-gray-500"> — {products.length} items</span>
            )}
          </p>
          <button
            onClick={() => {
              setLocalSearch("");
              // Also drop ?search= from the URL, else the sync effect above
              // would immediately repopulate the box from the stale param.
              if (urlSearch) router.replace("/");
            }}
            className="text-xs font-semibold text-saffron hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6">
          <ProductGridSkeleton count={10} />
        </div>
      ) : isFiltered ? (
        // Filtered view: simple grid
        <section className="mt-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[18px] font-bold text-brown">
              {selectedCategory || "Search Results"}
            </h2>
            {!needsAgeGate && (
              <span className="text-xs text-gray-500">{viewProducts.length} items</span>
            )}
          </div>
          {needsAgeGate ? (
            <AgeGate onDecline={() => setSelectedCategory(null)} />
          ) : (
            <>
              {/* Subcategory chips — only for a picked category (not search) */}
              {selectedCategory && !debouncedSearch && (
                <SubcategoryStrip
                  categoryName={selectedCategory}
                  products={filteredView}
                  selected={selectedSub}
                  onSelect={setSelectedSub}
                />
              )}
              {viewProducts.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {viewProducts.slice(0, gridLimit).map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                  {gridLimit < viewProducts.length && (
  <ShowMoreButton remaining={viewProducts.length - gridLimit} onClick={() => setGridLimit((n) => n + GRID_PAGE * 2)} />
)}
                </>
              ) : (
                <EmptyState search={debouncedSearch} />
              )}
            </>
          )}
        </section>
      ) : (
        // Modern home view: rails + grid
        <>
          {user && <BuyAgainRail products={products} />}

          {rails.freshVeg.length > 0 && (
            <ProductRail
              title="Fresh sabzi & fruits"
              subtitle="Roz subah ki taazi sabzi — weight ke hisaab se"
              emoji="🥬"
              products={rails.freshVeg}
              onSeeAll={() => setSelectedCategory("Fruits & Vegetables")}
              seeAllLabel="All sabzi"
              accent="green"
            />
          )}

          {rails.topDeals.length > 0 && (
            <ProductRail
              title="Top deals today"
              subtitle="Biggest discounts, hand-picked for you"
              emoji="🔥"
              products={rails.topDeals}
              accent="saffron"
            />
          )}

          {rails.popat.length > 0 && (
            <ProductRail
              title="Popat Namkeen"
              subtitle="Chhattisgarh ka apna crunchy brand — sev, gathiya, mixture"
              emoji="🥨"
              products={rails.popat}
              seeAllHref="/?search=popat"
              seeAllLabel="All Popat"
              accent="saffron"
            />
          )}

          {rails.dailyEssentials.length > 0 && (
            <ProductRail
              title="Daily essentials"
              subtitle="Roz ki zarurat ka saamaan"
              emoji="🛒"
              products={rails.dailyEssentials}
              accent="green"
            />
          )}

          {rails.snacks.length > 0 && (
            <ProductRail
              title="Munchies under ₹50"
              subtitle="Chai pe charcha ke saath"
              emoji="🍿"
              products={rails.snacks}
              onSeeAll={() => setSelectedCategory("Snacks & Munchies")}
              seeAllLabel="All snacks"
              accent="purple"
            />
          )}

          {rails.dairy.length > 0 && (
            <ProductRail
              title="Dairy & breakfast"
              subtitle="Fresh from the farm"
              emoji="🥛"
              products={rails.dairy}
              onSeeAll={() => setSelectedCategory("Dairy")}
              seeAllLabel="All dairy"
              accent="blue"
            />
          )}

          <FeatureBanner />

          {rails.beverages.length > 0 && (
            <ProductRail
              title="Drinks & beverages"
              subtitle="Chai, coffee, juices — sab kuch"
              emoji="🥤"
              products={rails.beverages}
              onSeeAll={() => setSelectedCategory("Cold Drinks & Juices")}
              seeAllLabel="All drinks"
              accent="saffron"
            />
          )}

          {rails.sweet.length > 0 && (
            <ProductRail
              title="Sweet tooth"
              subtitle="Meetha kuch ho jaaye"
              emoji="🍫"
              products={rails.sweet}
              onSeeAll={() => setSelectedCategory("Chocolates & Sweets")}
              seeAllLabel="All sweets"
              accent="purple"
            />
          )}

          {rails.personalCare.length > 0 && (
            <ProductRail
              title="Personal care & wellness"
              subtitle="Roz ki self-care"
              emoji="🧴"
              products={rails.personalCare}
              onSeeAll={() => setSelectedCategory("Personal Care")}
              seeAllLabel="All personal care"
              accent="green"
            />
          )}

          {/* All products grid at bottom — grouped by category, in-stock first */}
          <section className="mt-8">
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 className="text-[18px] font-bold text-brown leading-tight flex items-center gap-2">
                  <span className="text-2xl">🧺</span>
                  All products
                </h2>
                <p className="text-xs text-brown-light mt-0.5">
                  Showing {Math.min(gridLimit, shuffledAll.length)} of {shuffledAll.length}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {shuffledAll.slice(0, gridLimit).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            {gridLimit < shuffledAll.length && (
  <ShowMoreButton remaining={shuffledAll.length - gridLimit} onClick={() => setGridLimit((n) => n + GRID_PAGE * 2)} />
)}
          </section>
        </>
      )}

      <CartBar />
    </div>
  );
}

// ───────────── Helpers ─────────────

/** "Buy again" rail — mounted only for logged-in customers so anonymous
 *  visits never touch the orders table. Pulls just the latest 20 orders. */
function BuyAgainRail({ products }: { products: Product[] }) {
  const { orders } = useOrders({ limit: 20 });
  const buyAgain = useMemo(() => {
    if (orders.length === 0 || products.length === 0) return [] as Product[];
    const byId = new Map(products.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const out: Product[] = [];
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      for (const it of o.items ?? []) {
        const p = byId.get(it.product_id);
        if (!p || seen.has(p.id) || p.stock <= 0) continue;
        seen.add(p.id);
        out.push(p);
        if (out.length >= 12) return out;
      }
    }
    return out;
  }, [orders, products]);
  if (buyAgain.length === 0) return null;
  return (
    <ProductRail
      title="Buy again"
      subtitle="Aapke pichhle orders se"
      emoji="🔁"
      products={buyAgain}
      seeAllHref="/orders"
      seeAllLabel="My orders"
      accent="green"
    />
  );
}

function ShowMoreButton({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  return (
    <div className="mt-5 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-saffron/40 bg-white text-saffron-deep font-bold text-sm hover:bg-saffron-light hover:border-saffron transition-colors"
      >
        Show more
        <ChevronDown size={16} />
        <span className="text-xs font-semibold text-gray-500">({remaining} more)</span>
      </button>
    </div>
  );
}

/** One-tap searches under the category strip. Plain links so they work in
 *  the server-rendered shell too. */
function QuickSearches() {
  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
        <Search size={12} /> Quick
      </span>
      {QUICK_SEARCHES.map((q) => (
        <Link
          key={q}
          href={`/?search=${encodeURIComponent(q.toLowerCase())}`}
          className="shrink-0 px-3 py-1.5 rounded-full bg-gray-100 text-[12px] font-semibold text-brown hover:bg-saffron-light hover:text-saffron-deep transition-colors"
        >
          {q}
        </Link>
      ))}
    </div>
  );
}

function buildRails(products: Product[], categories: Category[]) {
  // name → id map, resilient to demo ("1".."20") vs live (UUID) modes.
  const idFor = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? null;

  const inStock = (p: Product) => p.stock > 0;
  // Filter + stable shuffle so sibling sizes of the same product don't
  // cluster (e.g. Sunfeast YiPPee 70g/140g/280g/.../560g all in a row).
  const byCat = (names: string[]) => {
    const ids = new Set(names.map(idFor).filter(Boolean) as string[]);
    if (ids.size === 0) return [];
    return shuffleForGrid(
      products.filter((p) => inStock(p) && ids.has(p.category_id)),
    );
  };

  // Top deals: highest discount % first. Same family often shares the same
  // discount %, so hashId is the tiebreaker — keeps the headline product on
  // top but spreads its sibling sizes through the rail instead of stacking
  // them all at the same discount.
  const topDeals = products
    .filter((p) => inStock(p) && p.mrp > p.price)
    .map((p) => ({ p, disc: (p.mrp - p.price) / p.mrp }))
    .sort((a, b) => {
      if (b.disc !== a.disc) return b.disc - a.disc;
      return hashId(a.p.id) - hashId(b.p.id);
    })
    .slice(0, 12)
    .map((x) => x.p);

  const snacksAll = byCat(["Snacks & Munchies", "Bakery & Biscuits"]);

  // Local-first rails: fresh produce (daily need) and Popat, Chhattisgarh's
  // own namkeen brand — both lead the page ahead of national-brand deals.
  const freshVeg = byCat(["Fruits & Vegetables"]).slice(0, 12);
  const popat = shuffleForGrid(
    products.filter((p) => inStock(p) && /^popat\b/i.test(p.name)),
  ).slice(0, 12);

  return {
    freshVeg,
    popat,
    topDeals,
    dailyEssentials: byCat([
      "Dairy",
      "Fruits & Vegetables",
      "Atta, Rice & Dal",
      "Masala, Oil & More",
    ]).slice(0, 12),
    snacks: snacksAll.filter((p) => p.price <= 50).slice(0, 12),
    dairy: byCat(["Dairy", "Breakfast & Instant Food"]).slice(0, 12),
    beverages: byCat(["Cold Drinks & Juices", "Tea, Coffee & Health Drink"]).slice(0, 12),
    sweet: byCat(["Chocolates & Sweets"]).slice(0, 12),
    personalCare: byCat(["Personal Care", "Pharma & Wellness"]).slice(0, 12),
  };
}

// Stable shuffle helper lives in src/lib/product-order.ts so the product
// detail page can reuse the same ordering for its "You may also like" list.

function PromiseTile({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="bg-saffron-light rounded-xl p-2 md:p-2.5 flex items-center gap-1.5 md:gap-2 border border-orange-100">
      <div className="w-7 h-7 md:w-8 md:h-8 bg-white rounded-lg flex items-center justify-center shrink-0 text-saffron">
        {icon}
      </div>
      <div className="leading-tight min-w-0">
        <p className="text-[11px] md:text-[12px] font-bold text-brown whitespace-nowrap">
          {title}
        </p>
        <p className="text-[10px] text-brown-light truncate">{subtitle}</p>
      </div>
    </div>
  );
}

function FeatureBanner() {
  return (
    <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="bg-gradient-to-br from-indian-green via-green-600 to-emerald-700 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="relative z-10 max-w-xs">
          <p className="text-[10px] font-bold bg-white/20 inline-block px-2 py-0.5 rounded mb-2 tracking-wide">
            FIRST ORDER
          </p>
          <h3 className="text-lg font-bold leading-tight">₹50 off your first order</h3>
          <p className="text-xs opacity-90 mt-1">Use code ATAL50 on ₹199+ orders</p>
          <span className="mt-3 inline-block bg-white text-indian-green text-xs font-bold px-3 py-1.5 rounded-lg">
            Apply now →
          </span>
        </div>
        <div className="absolute -right-4 -bottom-4 text-7xl opacity-30 select-none">
          🎁
        </div>
      </div>

      <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="relative z-10 max-w-xs">
          <p className="text-[10px] font-bold bg-white/20 inline-block px-2 py-0.5 rounded mb-2 tracking-wide">
            FREE DELIVERY
          </p>
          <h3 className="text-lg font-bold leading-tight">Spend ₹299, save ₹25</h3>
          <p className="text-xs opacity-90 mt-1">Free delivery on every order above ₹299</p>
          <span className="mt-3 inline-block bg-white text-saffron-deep text-xs font-bold px-3 py-1.5 rounded-lg">
            Browse →
          </span>
        </div>
        <div className="absolute -right-4 -bottom-4 text-7xl opacity-30 select-none">
          🚚
        </div>
      </div>
    </section>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-5xl mb-3">🔍</p>
      <p className="text-brown font-semibold">No products found</p>
      {search && (
        <p className="text-sm text-gray-500 mt-1">
          Try searching for something else
        </p>
      )}
    </div>
  );
}
