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
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/constants";
import { formatRupees } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import { shuffleForGrid } from "@/lib/product-order";
import { familyName, packagingType, siblingKey } from "@/lib/product-name";
import { effectiveReturnPolicy, formatReportWindow } from "@/lib/policy";
import { useStoreAvailability } from "@/lib/hooks/use-availability";
import { useSettings } from "@/lib/store/settings";
import type { CustomerCare, ProductVariant } from "@/types";

// ── Sibling size detection ───────────────────────────────────────
// Separate catalogue rows that share a family name ("… Pouch (1 kg)" and
// "… Bag (5 kg)") are offered as sizes of one product. Name helpers live in
// src/lib/product-name.ts so cart/checkout/order labels use the same split.
const getBaseName = siblingKey;
const getPackagingType = packagingType;

// Seed data stamped most products with a support contact that doesn't exist
// (support@atalmart.in / +91-91120-00000). Never render it; the real order
// support comes from constants. Anything else is a genuine brand contact.
function isPlaceholderCare(cc: CustomerCare | null | undefined): boolean {
  if (!cc) return true;
  return /@atalmart\.in$/i.test(cc.email ?? "") || /91120.?00000/.test(cc.phone ?? "");
}
// "Hours" must contain hours — seed rows put an organisation/location there.
function looksLikeHours(s: string | undefined): s is string {
  return !!s && /(\d\s*(am|pm|baje)|\d{1,2}:\d{2}|24\s*[x×/]\s*7|\d\s*[-–]\s*\d)/i.test(s);
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

      // The ILIKE prefix is loose ("Amul Taaza" also matches "Amul Taaza
      // Tetrapack"); keep only rows with the SAME family key, so a different
      // format never masquerades as a size of this product.
      const same = (data ?? []).filter((s) => getBaseName(s.name) === baseName);
      if (!cancelled && same.length > 1) {
        setSiblings(same);
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
  const availability = useStoreAvailability();
  const { freeDeliveryAbove } = useSettings();

  // 18+ gate — block deep-links to tobacco (Paan Corner) products until confirmed.
  const ageVerified = useAgeGateStore((s) => s.verified);
  const ageHydrated = useAgeGateHydrated();

  // ── Sibling size products (same base name, different sizes) ────
  // Only consulted when the product has NO pack-size variants: a product
  // with variants is its own size picker, and showing both selectors put
  // two different prices for "1 L" on one page (launch audit AM-01).
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
  const displayPrice = Math.round(selectedVariant?.price ?? product.price);
  const displayMrp = Math.max(displayPrice, Math.round(selectedVariant?.mrp ?? product.mrp));
  const displayStock = selectedVariant?.stock ?? product.stock;
  const displayUnit = selectedVariant?.unit ?? product.unit;
  // With variants the catalogue name's own "(500 ml)" would contradict a
  // selected 1 L pack — show the size-free family name and let the selector
  // + unit line carry the pack. Single-pack products keep their full name.
  const titleName = hasVariants ? familyName(product.name) : product.name;
  const sellableLabel = hasVariants ? `${titleName} (${displayUnit})` : product.name;
  const showSiblingPicker = !hasVariants && siblings.length > 1;
  const policy = effectiveReturnPolicy(product.category?.name);
  const brandCare = isPlaceholderCare(product.customer_care) ? null : product.customer_care;
  // (Image gallery hooks are declared earlier — before any early returns —
  // so React's hook order rule isn't violated.)
  const displayImage = galleryImages[activeImageIdx] ?? null;

  const discount = displayMrp > 0 ? Math.round(((displayMrp - displayPrice) / displayMrp) * 100) : 0;
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
          aria-label="Go back"
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
            aria-label="Share this product"
            onClick={async () => {
              if (navigator.share) {
                try {
                  await navigator.share({ title: sellableLabel, url: window.location.href });
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
                  alt={sellableLabel}
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  className="object-contain p-6"
                  preload
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
                    aria-label={`Show image ${idx + 1} of ${Math.min(galleryImages.length, 5)}`}
                    aria-pressed={idx === activeImageIdx}
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
                  {titleName}
                </h1>
                {product.name_hi && (
                  <p className="text-sm text-brown-light mt-0.5">
                    {product.name_hi}
                  </p>
                )}
              </div>
              {availability.state === "open" ? (
                <span className="shrink-0 inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-700">
                  <Clock size={11} aria-hidden="true" />
                  QUICK
                </span>
              ) : availability.blocked ? (
                <span className="shrink-0 inline-flex items-center gap-1 bg-amber-100 px-2 py-0.5 rounded text-[10px] font-bold text-amber-900">
                  {availability.title}
                </span>
              ) : null}
            </div>

            <p className="text-sm text-gray-500 mt-3">
              {hasVariants ? (
                <>
                  Selected pack: <span className="font-semibold text-brown">{displayUnit}</span>
                </>
              ) : (
                displayUnit
              )}
            </p>

            {/* Sibling size picker — separate catalogue rows of one family.
                Shown only when this product has no variants of its own, so
                a page never carries two pack selectors (AM-01). */}
            {showSiblingPicker && (
              <div className="mt-4" role="group" aria-labelledby="size-picker-label">
                <p id="size-picker-label" className="text-xs font-semibold text-brown-light mb-2 uppercase tracking-wide">
                  Select size
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
                        aria-pressed={isActive}
                        aria-label={`${label}, ${formatRupees(s.price)}`}
                        className={`min-h-[44px] px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
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

            {/* Variant picker — the ONE pack selector for products with
                pack-size variants. Every price/label on the page follows it. */}
            {hasVariants && (
              <div className="mt-4" role="group" aria-labelledby="pack-picker-label">
                <p id="pack-picker-label" className="text-xs font-semibold text-brown-light mb-2 uppercase tracking-wide">
                  Select pack
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
                        aria-pressed={isSelected}
                        aria-label={`${v.unit}, ${formatRupees(v.price)}${oos ? ", out of stock" : ""}`}
                        className={`relative min-h-[44px] px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
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

            {/* Price — always for the selected pack; the unit sits beside it */}
            <div className="mt-4 flex items-end gap-3 flex-wrap" aria-live="polite">
              <span className="text-3xl font-bold text-brown leading-none">
                {formatRupees(displayPrice)}
                <span className="text-sm font-semibold text-gray-500 ml-1.5">/ {displayUnit}</span>
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
                  {hasVariants && <span className="font-normal opacity-90"> · {displayUnit}</span>}
                </Button>
              ) : (
                <div
                  className="flex items-center justify-between bg-indian-green text-white rounded-xl overflow-hidden"
                  role="group"
                  aria-label={`${sellableLabel} quantity`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      quantity === 1
                        ? removeItem(product.id, selectedVariant?.id ?? null)
                        : updateQuantity(product.id, quantity - 1, selectedVariant?.id ?? null)
                    }
                    aria-label={`Decrease ${sellableLabel} quantity`}
                    className="flex-1 py-3.5 hover:bg-green-700 transition-colors flex justify-center"
                  >
                    <Minus size={20} strokeWidth={3} aria-hidden="true" />
                  </button>
                  <span className="text-lg font-bold px-4" aria-live="polite" aria-atomic="true">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(product.id, quantity + 1, selectedVariant?.id ?? null)
                    }
                    disabled={quantity >= displayStock}
                    aria-label={`Increase ${sellableLabel} quantity`}
                    className="flex-1 py-3.5 hover:bg-green-700 transition-colors flex justify-center disabled:opacity-50"
                  >
                    <Plus size={20} strokeWidth={3} aria-hidden="true" />
                  </button>
                </div>
              )}
              {availability.blocked && inStock && (
                <p role="status" className="text-xs text-amber-800 mt-2 font-medium">
                  {availability.title} — {availability.body}
                </p>
              )}
              {inStock && displayStock < 10 && (
                <p className="text-xs text-orange-600 mt-2 font-semibold">
                  Only {displayStock} left in stock — order soon!
                </p>
              )}
            </div>

            {/* Promise strip — no delivery promise while orders are paused */}
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {availability.state === "open" ? (
                <PromiseChip icon={<Clock size={16} />} label="Quick" sub="delivery" />
              ) : (
                <PromiseChip icon={<Clock size={16} />} label="Orders" sub="paused" muted />
              )}
              <PromiseChip
                icon={<Truck size={16} />}
                label="Free delivery"
                sub={`₹${freeDeliveryAbove}+ orders`}
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

          {/* Return policy — rendered from the single policy configuration
              (src/lib/policy.ts), the same source as the FAQ, the refund page
              and the return-window check. The product row's free-text
              return_policy is NOT shown: seed rows disagreed with it (AM-07). */}
          <Section title="Return Policy">
            <div className="text-sm text-brown-light leading-relaxed space-y-1.5">
              <p>
                Delivery ke <strong className="text-brown">{formatReportWindow(policy.reportWindowHours)}</strong> ke
                andar damaged, galat, expired ya missing item report karein — replacement ya full refund.
              </p>
              {policy.note && <p>{policy.note}</p>}
              <p className="text-xs text-gray-500">
                Refund: {policy.refundTimeline}{" "}
                <Link href="/refund-policy" className="text-saffron hover:underline">
                  Poori policy
                </Link>
              </p>
            </div>
          </Section>

          {/* Order support (Atalmart) vs brand contact (manufacturer) */}
          <Section title="Customer Care">
            <div className="text-sm text-brown-light space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Atalmart order support</p>
                <p>
                  Phone:{" "}
                  <a href={`tel:+91${SUPPORT_PHONE}`} className="text-saffron hover:underline">
                    +91 {SUPPORT_PHONE}
                  </a>
                </p>
                <p>
                  Email:{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-saffron hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                </p>
              </div>
              {brandCare && (brandCare.email || brandCare.phone) && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Brand / manufacturer contact
                  </p>
                  {brandCare.email && (
                    <p>Email: <a href={`mailto:${brandCare.email}`} className="text-saffron hover:underline">{brandCare.email}</a></p>
                  )}
                  {brandCare.phone && (
                    <p>Phone: <a href={`tel:${brandCare.phone}`} className="text-saffron hover:underline">{brandCare.phone}</a></p>
                  )}
                  {looksLikeHours(brandCare.hours) && <p>Hours: {brandCare.hours}</p>}
                </div>
              )}
            </div>
          </Section>

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
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-lg p-2 border ${muted ? "bg-amber-50 border-amber-200" : "bg-saffron-light border-orange-100"}`}>
      <div className={`${muted ? "text-amber-700" : "text-saffron"} mx-auto w-fit`} aria-hidden="true">{icon}</div>
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
