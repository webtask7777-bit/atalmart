"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Clock, ShieldCheck, Truck } from "lucide-react";
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
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useSettings } from "@/lib/store/settings";
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
        <CategoryBar selected={selectedCategory} onSelect={setSelectedCategory} />
      </div>

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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {viewProducts.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              ) : (
                <EmptyState search={debouncedSearch} />
              )}
            </>
          )}
        </section>
      ) : (
        // Modern home view: rails + grid
        <>
          {rails.topDeals.length > 0 && (
            <ProductRail
              title="Top deals today"
              subtitle="Biggest discounts, hand-picked for you"
              emoji="🔥"
              products={rails.topDeals}
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
              accent="purple"
            />
          )}

          {rails.dairy.length > 0 && (
            <ProductRail
              title="Dairy & breakfast"
              subtitle="Fresh from the farm"
              emoji="🥛"
              products={rails.dairy}
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
              accent="saffron"
            />
          )}

          {rails.sweet.length > 0 && (
            <ProductRail
              title="Sweet tooth"
              subtitle="Meetha kuch ho jaaye"
              emoji="🍫"
              products={rails.sweet}
              accent="purple"
            />
          )}

          {rails.personalCare.length > 0 && (
            <ProductRail
              title="Personal care & wellness"
              subtitle="Roz ki self-care"
              emoji="🧴"
              products={rails.personalCare}
              accent="green"
            />
          )}

          {/* All products grid at bottom — grouped by category, in-stock first */}
          <section className="mt-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[18px] font-bold text-brown">All products</h2>
              <span className="text-xs text-gray-500">{shuffledAll.length} items</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {shuffledAll.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        </>
      )}

      <CartBar />
    </div>
  );
}

// ───────────── Helpers ─────────────

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

  return {
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
