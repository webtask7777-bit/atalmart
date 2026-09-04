"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft,
  Share2,
  Heart,
  Clock,
  ShieldCheck,
  Truck,
  Plus,
  Minus,
} from "lucide-react";
import { useProduct, useProducts } from "@/lib/hooks/use-products";
import { AgeGate } from "@/components/customer/age-gate";
import {
  useAgeGateStore,
  useAgeGateHydrated,
  isAgeRestricted,
} from "@/lib/store/age-gate";
import { useCartStore } from "@/lib/store/cart";
import { useWishlistStore } from "@/lib/store/wishlist";
import { toast } from "sonner";
import { ProductCard } from "@/components/customer/product-card";
import { CartBar } from "@/components/customer/cart-bar";
import { Button } from "@/components/ui/button";
import { ProductReviews } from "@/components/customer/product-reviews";
import { FREE_DELIVERY_ABOVE } from "@/lib/constants";
import { formatRupees } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import { shuffleForGrid } from "@/lib/product-order";
import type { ProductVariant } from "@/types";

// ── Sibling size detection ───────────────────────────────────────
// Extract base product name by stripping size/weight in parentheses,
// "Pack of N", AND trailing packaging-type words (Pouch, Bag, Tin, etc.)
// so siblings like "Pouch (1 kg)" and "Bag (5 kg)" group together.
const PACKAGING_RE = /\s+(Pouch|Bag|Pack|Box|Tin|Jar|Pet|Bottle|Carton|Can|Sachet|Refill|Tetrapack|Tetra Pack|Cup|Tub|Tray|Block)\s*$/i;

function getBaseName(name: string): string {
  return name
    .replace(/\s*Pack of \d+\s*/gi, " ")
    .replace(/\s*\(.*?\)\s*$/, "")
    .replace(PACKAGING_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull packaging-type word out of the product name (e.g. "Pouch", "Bag")
// so the size selector can show "Pouch · 1 kg" instead of two identical
// "1 kg" buttons when only the packaging differs.
function getPackagingType(name: string): string | null {
  const stripped = name.replace(/\s*\(.*?\)\s*$/, "");
  const match = stripped.match(PACKAGING_RE);
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : null;
}

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

type SiblingProduct = {
  id: string;
  name: string;
  unit: string;
  price: number;
  mrp: number;
  image_url: string | null;
};

function useSiblingProducts(product: { id: string; name: string } | null) {
  const [siblings, setSiblings] = useState<SiblingProduct[]>([]);

  useEffect(() => {
    if (!product || isDemoMode()) {
      setSiblings([]);
      return;
    }

    const baseName = getBaseName(product.name);
    if (!baseName || baseName.length < 5) {
      setSiblings([]);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, unit, price, mrp, image_url")
        .ilike("name", `${escapeLike(baseName)}%`)
        .eq("active", true)
        .order("price");

      if (!cancelled && data && data.length > 1) {
        setSiblings(data);
      } else if (!cancelled) {
        setSiblings([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product?.id, product?.name]);

  return siblings;
}

export function ProductDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { product, loading } = useProduct(params.id);

  // Reset window scroll on every product navigation. Without this, switching
  // between products keeps the previous scroll position (Next 16 App Router
  // restores scroll for same-route id changes, which feels broken on a card
  // grid where you've scrolled deep before tapping a product).
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [params.id]);
  const { products: related } = useProducts({
    categoryId: product?.category_id ?? null,
  });

  const { items, addItem, updateQuantity, removeItem } = useCartStore();
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlistStore();

  // 18+ gate — block deep-links to tobacco (Paan Corner) products until confirmed.
  const ageVerified = useAgeGateStore((s) => s.verified);
  const ageHydrated = useAgeGateHydrated();

  // ── Sibling size products (same base name, different sizes) ────
  const siblings = useSiblingProducts(product);

  // ── Variant selection ───────────────────────────────────────────
  // Default to the variant flagged is_default, or the first (lowest sort) one.
  const variants = useMemo(() => {
    const list = product?.variants ?? [];
    return [...list].sort((a, b) => a.sort_order - b.sort_order);
  }, [product?.variants]);
  const hasVariants = variants.length > 0;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  useEffect(() => {
    if (!hasVariants) {
      setSelectedVariantId(null);
      return;
    }
    const def = variants.find((v) => v.is_default) ?? variants[0];
    setSelectedVariantId(def.id);
  }, [hasVariants, variants]);
  const selectedVariant: ProductVariant | null = useMemo(() => {
    if (!selectedVariantId) return null;
    return variants.find((v) => v.id === selectedVariantId) ?? null;
  }, [selectedVariantId, variants]);

  // ── Cart state for this specific (product, variant) ─────────────
  const cartItem = useMemo(() => {
    if (!product) return null;
    if (selectedVariant) {
      return items.find(
        (i) =>
          i.product.id === product.id && i.variant?.id === selectedVariant.id,
      );
    }
    return items.find((i) => i.product.id === product.id && !i.variant);
  }, [items, product, selectedVariant]);
  const quantity = cartItem?.quantity ?? 0;
  const wishlisted = product ? isWishlisted(product.id) : false;

  // ── Image gallery state (must be declared BEFORE any early returns
  //    to satisfy React's rule of hooks — even if `product` is null) ──
  const galleryImages = useMemo(() => {
    if (!product) return [] as string[];
    const all: string[] = [];
    if (selectedVariant?.image_url) all.push(selectedVariant.image_url);
    if (product.image_url) all.push(product.image_url);
    if (product.image_urls) all.push(...product.image_urls);
    return Array.from(new Set(all.filter(Boolean)));
  }, [product, selectedVariant]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  useEffect(() => {
    setActiveImageIdx(0);
  }, [product?.id, selectedVariant?.id]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="aspect-square bg-gray-100 rounded-2xl mb-6" />
          <div className="h-6 bg-gray-100 rounded w-3/4 mb-3" />
          <div className="h-4 bg-gray-100 rounded w-1/2 mb-6" />
          <div className="h-12 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-5xl mb-3">📦</p>
        <p className="text-brown font-bold">Product not found</p>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Hum is product ko nahi dhoondh paye
        </p>
        <Link href="/" className="text-saffron text-sm font-semibold hover:underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  // 18+ gate for tobacco products — shown in place of the whole detail view.
  if (isAgeRestricted(product.category?.name) && ageHydrated && !ageVerified) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <AgeGate onDecline={() => router.push("/")} />
      </div>
    );
  }

  // Active pricing source — variant overrides product when selected.
  const displayPrice = selectedVariant?.price ?? product.price;
  const displayMrp = selectedVariant?.mrp ?? product.mrp;
  const displayStock = selectedVariant?.stock ?? product.stock;
  const displayUnit = selectedVariant?.unit ?? product.unit;
  // (Image gallery hooks are declared earlier — before any early returns —
  // so React's hook order rule isn't violated.)
  const displayImage = galleryImages[activeImageIdx] ?? null;

  const discount = Math.round(((displayMrp - displayPrice) / displayMrp) * 100);
  const savings = displayMrp - displayPrice;
  const inStock = displayStock > 0;
  // Shuffle first, THEN slice — otherwise the top 6 in name-sorted order are
  // almost always sibling sizes of the same product (e.g. all the Aashirvaad
  // Rava Idli Mix sizes in a row). Stable shuffle keeps the order consistent
  // across reloads while scattering sizes apart.
  const relatedFiltered = shuffleForGrid(
    related.filter((p) => p.id !== product.id),
  ).slice(0, 6);

  return (
    <div className="pb-32 md:pb-12">
      {/* Sticky mini-header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between md:hidden">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-50"
          aria-label="back"
        >
          <ChevronLeft size={22} className="text-brown" />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              toggleWishlist(product.id);
              toast.success(wishlisted ? "Removed from wishlist" : "Added to wishlist");
            }}
            className="p-2 rounded-lg hover:bg-gray-50"
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart
              size={20}
              className={
                wishlisted ? "fill-red-500 text-red-500" : "text-brown-light"
              }
            />
          </button>
          <button
            className="p-2 rounded-lg hover:bg-gray-50"
            aria-label="share"
            onClick={async () => {
              if (navigator.share) {
                try {
                  await navigator.share({ title: product.name, url: window.location.href });
                } catch {
                  // user cancelled
                }
              } else {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast.success("Link copied to clipboard");
                } catch {
                  toast.error("Couldn't share");
                }
              }
            }}
          >
            <Share2 size={20} className="text-brown-light" />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-4 md:pt-6">
        <div className="grid md:grid-cols-2 gap-6 md:gap-10">
          {/* Image gallery */}
          <div className="relative">
            <div className="relative aspect-square bg-[#f7f7f7] rounded-2xl overflow-hidden">
              {discount > 0 && (
                <span className="absolute top-3 left-3 z-10 bg-indian-green text-white text-xs font-bold px-2 py-1 rounded">
                  {discount}% OFF
                </span>
              )}
              {displayImage ? (
                <Image
                  src={displayImage}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  className="object-contain p-6"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-7xl">
                  📦
                </div>
              )}
            </div>
            {galleryImages.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {galleryImages.slice(0, 5).map((src, idx) => (
                  <button
                    key={src}
                    onClick={() => setActiveImageIdx(idx)}
                    className={`relative aspect-square bg-[#f7f7f7] rounded-lg overflow-hidden border-2 transition-colors ${
                      idx === activeImageIdx
                        ? "border-saffron"
                        : "border-transparent hover:border-gray-200"
                    }`}
                  >
                    <Image
                      src={src}
                      alt={`${product.name} view ${idx + 1}`}
                      fill
                      sizes="80px"
                      className="object-contain p-1"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-brown leading-tight">
                  {product.name}
                </h1>
                {product.name_hi && (
                  <p className="text-sm text-brown-light mt-0.5">
                    {product.name_hi}
                  </p>
                )}
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-700">
                <Clock size={11} />
                QUICK
              </span>
            </div>

            <p className="text-sm text-gray-500 mt-3">{displayUnit}</p>

            {/* Sibling size picker (same product, different sizes) */}
            {siblings.length > 1 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-brown-light mb-2 uppercase tracking-wide">
                  Available Sizes
                </p>
                <div className="flex flex-wrap gap-2">
                  {siblings.map((s) => {
                    const isActive = s.id === product.id;
                    const pkg = getPackagingType(s.name);
                    const label = pkg ? `${pkg} · ${s.unit}` : s.unit;
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          if (!isActive) router.push(`/product/${s.id}`);
                        }}
                        className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          isActive
                            ? "border-indian-green bg-green-50 text-indian-green ring-1 ring-indian-green"
                            : "border-gray-200 text-brown hover:border-saffron"
                        }`}
                      >
                        <div className="text-xs font-bold">{label}</div>
                        <div className="text-[11px] font-normal mt-0.5">
                          {formatRupees(s.price)}
                          {s.mrp > s.price && (
                            <span className="text-gray-500 line-through ml-1">
                              {formatRupees(s.mrp)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Variant picker */}
            {hasVariants && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-brown-light mb-2 uppercase tracking-wide">
                  Select Unit
                </p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isSelected = v.id === selectedVariantId;
                    const oos = v.stock <= 0;
                    return (
                      <button
                        key={v.id}
                        disabled={oos}
                        onClick={() => setSelectedVariantId(v.id)}
                        className={`relative px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          isSelected
                            ? "border-indian-green bg-green-50 text-indian-green"
                            : "border-gray-200 text-brown hover:border-saffron"
                        } ${oos ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <div className="text-xs font-bold">{v.unit}</div>
                        <div className="text-[11px] font-normal mt-0.5">
                          {formatRupees(v.price)}
                          {v.mrp > v.price && (
                            <span className="text-gray-500 line-through ml-1">
                              {formatRupees(v.mrp)}
                            </span>
                          )}
                        </div>
                        {oos && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] px-1 rounded-full">
                            OUT
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Price */}
            <div className="mt-4 flex items-end gap-3 flex-wrap">
              <span className="text-3xl font-bold text-brown leading-none">
                {formatRupees(displayPrice)}
              </span>
              {discount > 0 && (
                <>
                  <span className="text-base text-gray-500 line-through leading-none">
                    {formatRupees(displayMrp)}
                  </span>
                  <span className="text-xs font-bold text-indian-green bg-green-light px-2 py-0.5 rounded">
                    You save {formatRupees(savings)}
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">(inclusive of all taxes)</p>

            {/* Add to cart */}
            <div className="mt-5">
              {!inStock ? (
                <div className="w-full text-center py-3.5 rounded-xl bg-gray-100 text-gray-500 font-semibold text-sm">
                  Out of stock
                </div>
              ) : quantity === 0 ? (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => addItem(product, selectedVariant)}
                >
                  Add to Cart — {formatRupees(displayPrice)}
                </Button>
              ) : (
                <div className="flex items-center justify-between bg-indian-green text-white rounded-xl overflow-hidden">
                  <button
                    onClick={() =>
                      quantity === 1
                        ? removeItem(product.id, selectedVariant?.id ?? null)
                        : updateQuantity(product.id, quantity - 1, selectedVariant?.id ?? null)
                    }
                    className="flex-1 py-3.5 hover:bg-green-700 transition-colors flex justify-center"
                  >
                    <Minus size={20} strokeWidth={3} />
                  </button>
                  <span className="text-lg font-bold px-4">{quantity}</span>
                  <button
                    onClick={() =>
                      updateQuantity(product.id, quantity + 1, selectedVariant?.id ?? null)
                    }
                    disabled={quantity >= displayStock}
                    className="flex-1 py-3.5 hover:bg-green-700 transition-colors flex justify-center disabled:opacity-50"
                  >
                    <Plus size={20} strokeWidth={3} />
                  </button>
                </div>
              )}
              {inStock && displayStock < 10 && (
                <p className="text-xs text-orange-600 mt-2 font-semibold">
                  Only {displayStock} left in stock — order soon!
                </p>
              )}
            </div>

            {/* Promise strip */}
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <PromiseChip icon={<Clock size={16} />} label="Quick" sub="delivery" />
              <PromiseChip
                icon={<Truck size={16} />}
                label={`Free above`}
                sub={`₹${FREE_DELIVERY_ABOVE}`}
              />
              <PromiseChip icon={<ShieldCheck size={16} />} label="100%" sub="genuine" />
            </div>
          </div>
        </div>

        {/* ─── Full product details (Blinkit-style) ─── */}
        <div className="mt-10 space-y-6">
          {/* Key Features */}
          {product.key_features && product.key_features.length > 0 && (
            <Section title="Key Features">
              <ul className="space-y-1.5 list-disc list-inside text-sm text-brown-light">
                {product.key_features.map((feat, i) => (
                  <li key={i}>{feat}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Description */}
          {product.description && (
            <Section title="Description">
              <p className="text-sm text-brown-light leading-relaxed">
                {product.description}
              </p>
            </Section>
          )}

          {/* Product Details (Fat profile, Processing, Source, etc.) */}
          {(product.fat_profile ||
            product.processing_type ||
            product.biological_source ||
            product.sugar_profile) && (
            <Section title="Product Details">
              <DefList
                rows={[
                  ["Fat Profile", product.fat_profile],
                  ["Processing Type", product.processing_type],
                  ["Biological Source", product.biological_source],
                  ["Sugar Profile", product.sugar_profile],
                ]}
              />
            </Section>
          )}

          {/* Nutrition */}
          {product.nutrition_per_100g && (
            <Section title="Nutrition (per 100 g)">
              <DefList
                rows={[
                  ["Protein", fmtG(product.nutrition_per_100g.protein)],
                  ["Total Carbohydrates", fmtG(product.nutrition_per_100g.carbs)],
                  ["Total Sugar", fmtG(product.nutrition_per_100g.total_sugar)],
                  ["Added Sugars", fmtG(product.nutrition_per_100g.added_sugars)],
                  ["Total Fat", fmtG(product.nutrition_per_100g.total_fat)],
                  ["Saturated Fat", fmtG(product.nutrition_per_100g.sat_fat)],
                  ["Trans Fat", fmtG(product.nutrition_per_100g.trans_fat)],
                  ["Calcium", fmtG(product.nutrition_per_100g.calcium)],
                  [
                    "Calories",
                    product.nutrition_per_100g.calories != null
                      ? `${product.nutrition_per_100g.calories} kcal`
                      : null,
                  ],
                ]}
              />
            </Section>
          )}

          {/* Regulatory + meta */}
          <Section title="Information">
            <DefList
              rows={[
                ["Unit", displayUnit],
                ["FSSAI License", product.fssai_license],
                ["Shelf Life", product.shelf_life],
                ["Country of Origin", product.country_of_origin || "India"],
                ["MRP", `₹${displayMrp} (incl. all taxes)`],
              ]}
            />
          </Section>

          {/* Seller */}
          {(product.seller_name || product.seller_fssai) && (
            <Section title="Seller">
              <DefList
                rows={[
                  ["Name", product.seller_name],
                  ["Address", product.seller_address],
                  ["FSSAI", product.seller_fssai],
                ]}
              />
            </Section>
          )}

          {/* Return Policy */}
          {product.return_policy && (
            <Section title="Return Policy">
              <p className="text-sm text-brown-light leading-relaxed">
                {product.return_policy}
              </p>
            </Section>
          )}

          {/* Customer Care */}
          {product.customer_care && (
            <Section title="Customer Care">
              <div className="text-sm text-brown-light space-y-1">
                {product.customer_care.email && (
                  <p>Email: <a href={`mailto:${product.customer_care.email}`} className="text-saffron hover:underline">{product.customer_care.email}</a></p>
                )}
                {product.customer_care.phone && (
                  <p>Phone: <a href={`tel:${product.customer_care.phone}`} className="text-saffron hover:underline">{product.customer_care.phone}</a></p>
                )}
                {product.customer_care.hours && <p>Hours: {product.customer_care.hours}</p>}
              </div>
            </Section>
          )}

          {/* Disclaimer */}
          {product.disclaimer && (
            <Section title="Disclaimer">
              <p className="text-xs text-gray-500 leading-relaxed italic">
                {product.disclaimer}
              </p>
            </Section>
          )}
        </div>

        {/* Reviews */}
        <ProductReviews productId={product.id} />

        {/* Related products */}
        {relatedFiltered.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-bold text-brown mb-3">You may also like</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {relatedFiltered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>

      <CartBar />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Inline helpers (page-local; tiny enough to not warrant a module)
// ───────────────────────────────────────────────────────────────

function PromiseChip({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="bg-saffron-light rounded-lg p-2 border border-orange-100">
      <div className="text-saffron mx-auto w-fit">{icon}</div>
      <p className="text-[11px] font-bold text-brown mt-1 leading-tight">{label}</p>
      <p className="text-[10px] text-brown-light leading-tight">{sub}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-gray-100 pt-5">
      <h2 className="text-sm font-bold text-brown mb-3 uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DefList({ rows }: { rows: [string, string | number | null | undefined][] }) {
  const visible = rows.filter(([, v]) => v != null && v !== "");
  if (visible.length === 0) return <p className="text-xs text-gray-500 italic">Not declared</p>;
  return (
    <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
      {visible.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-gray-500">{k}</dt>
          <dd className="text-brown font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function fmtG(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `${n} g`;
}
