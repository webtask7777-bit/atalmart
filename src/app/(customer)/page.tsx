"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/customer/product-card";
import { CategoryBar } from "@/components/customer/category-bar";
import { CategoryGrid } from "@/components/customer/category-grid";
import { HeroCarousel } from "@/components/customer/hero-carousel";
import { ProductRail } from "@/components/customer/product-rail";
import { CartBar } from "@/components/customer/cart-bar";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { useProducts } from "@/lib/hooks/use-products";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useSettings } from "@/lib/store/settings";
import type { Product } from "@/types";

export default function HomePage() {
  return (
    <Suspense fallback={<ProductGridSkeleton count={10} />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get("search") || "";
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState(urlSearch);
  const debouncedSearch = useDebounce(localSearch, 300);
  const settings = useSettings();

  // Pass categoryName — the hook resolves to the right id internally
  // (sort_order in demo mode, UUID in live Supabase mode).
  const { products, loading } = useProducts({
    categoryName: selectedCategory,
    search: debouncedSearch || undefined,
  });

  // ── Curated collections (computed from product data) ──
  const rails = useMemo(() => buildRails(products), [products]);

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
        <PromiseTile icon={<Clock size={16} />} title={`${settings.deliveryTimeMins} minute`} subtitle="delivery" />
        <PromiseTile icon={<Truck size={16} />} title={`₹${settings.freeDeliveryAbove}+`} subtitle="free delivery" />
        <PromiseTile icon={<ShieldCheck size={16} />} title="100%" subtitle="genuine" />
      </section>

      {!isFiltered && (
        <CategoryGrid
          selected={selectedCategory}
          onSelect={setSelectedCategory}
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
              <span className="text-gray-400"> — {products.length} items</span>
            )}
          </p>
          <button
            onClick={() => setLocalSearch("")}
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
            <span className="text-xs text-gray-400">{products.length} items</span>
          </div>
          {products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState search={debouncedSearch} />
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
              title="Cold drinks & juices"
              subtitle="Garmi mein thandak"
              emoji="🥤"
              products={rails.beverages}
              accent="saffron"
            />
          )}

          {/* All products grid at bottom */}
          <section className="mt-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[18px] font-bold text-brown">All products</h2>
              <span className="text-xs text-gray-400">{products.length} items</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {products.map((p) => (
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

function buildRails(products: Product[]) {
  // Top deals: highest discount % first
  const withDiscount = products
    .filter((p) => p.mrp > p.price)
    .map((p) => ({
      ...p,
      _disc: ((p.mrp - p.price) / p.mrp) * 100,
    }))
    .sort((a, b) => b._disc - a._disc);

  return {
    topDeals: withDiscount.slice(0, 10),
    dailyEssentials: products
      .filter((p) => ["2", "3", "10", "11"].includes(p.category_id))
      .slice(0, 10),
    snacks: products
      .filter((p) => p.category_id === "5" && p.price <= 50)
      .slice(0, 10),
    dairy: products
      .filter((p) => p.category_id === "2")
      .slice(0, 10),
    beverages: products
      .filter((p) => p.category_id === "4")
      .slice(0, 10),
  };
}

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
    <div className="bg-saffron-light rounded-xl p-2.5 flex items-center gap-2 border border-orange-100">
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 text-saffron">
        {icon}
      </div>
      <div className="leading-tight min-w-0">
        <p className="text-[12px] font-bold text-brown truncate">{title}</p>
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
          <span className="mt-3 inline-block bg-white text-saffron text-xs font-bold px-3 py-1.5 rounded-lg">
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
