"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { Plus, Minus, Heart } from "lucide-react";
import { useCartStore } from "@/lib/store/cart";
import { useWishlistStore } from "@/lib/store/wishlist";
import { useReviewsStore, getProductRating } from "@/lib/store/reviews";
import { StarRating } from "@/components/customer/star-rating";
import type { Product } from "@/types";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { items, addItem, updateQuantity, removeItem } = useCartStore();
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlistStore();
  const reviews = useReviewsStore((s) => s.reviews);
  const rating = useMemo(() => getProductRating(reviews, product.id), [reviews, product.id]);

  // When a product has variants, the card represents the DEFAULT pack-size.
  // Picking a different size requires opening the detail page. ADD on the
  // card adds the default; the cart treats (product + variant) as the key.
  const defaultVariant = useMemo(() => {
    const vs = product.variants ?? [];
    if (vs.length === 0) return null;
    return vs.find((v) => v.is_default) ?? vs.sort((a, b) => a.sort_order - b.sort_order)[0];
  }, [product.variants]);
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const otherVariantCount = hasVariants ? (product.variants!.length - 1) : 0;

  const displayPrice = defaultVariant?.price ?? product.price;
  const displayMrp = defaultVariant?.mrp ?? product.mrp;
  const displayStock = defaultVariant?.stock ?? product.stock;
  const displayUnit = defaultVariant?.unit ?? product.unit;

  const cartItem = items.find(
    (i) =>
      i.product.id === product.id &&
      (defaultVariant ? i.variant?.id === defaultVariant.id : !i.variant),
  );
  const quantity = cartItem?.quantity || 0;
  const wishlisted = isWishlisted(product.id);

  const discount = Math.round(((displayMrp - displayPrice) / displayMrp) * 100);
  const outOfStock = displayStock <= 0;
  const lowStock = !outOfStock && displayStock < 10;
  const limitReached = quantity >= displayStock;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="h-full bg-white rounded-2xl border border-gray-200 hover:border-saffron/40 transition-all group overflow-hidden flex flex-col relative">
      <Link
        href={`/product/${product.id}`}
        aria-label={product.name}
        className="absolute inset-0 z-0"
      />

      {/* Image area */}
      <div className="relative aspect-square bg-[#f7f7f7] pointer-events-none">
        {/* One top-left badge: OUT wins over the discount (a discount on an
            unavailable item is noise). Top-right belongs to the heart. */}
        {outOfStock ? (
          <span className="absolute top-2 left-2 z-10 bg-gray-800/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            OUT
          </span>
        ) : discount > 0 ? (
          <span className="absolute top-2 left-2 z-10 bg-indian-green text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {discount}% OFF
          </span>
        ) : null}
        {/* Delivery pill lives inside the image (Blinkit-style) instead of
            taking its own row below it. */}
        {!outOfStock && (
          <span className="absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-0.5 bg-white/95 border border-gray-200 px-1.5 py-[3px] rounded-md text-[9px] font-bold tracking-wide text-gray-700">
            <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06L10.75 9.69V5z" />
            </svg>
            QUICK
          </span>
        )}
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            // Fixed size (not `fill` + sizes): cards render at 150–190 CSS px,
            // and a fixed size emits a 2-candidate srcset instead of 12 —
            // ~1.5 KB less HTML per card when the home is server-rendered.
            width={320}
            height={320}
            fetchPriority="low"
            className={`absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-200 ${outOfStock ? "opacity-50" : ""}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            📦
          </div>
        )}
      </div>

      {/* Wishlist heart — floats above card link */}
      <button
        onClick={(e) => {
          stop(e);
          toggleWishlist(product.id);
        }}
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute top-2 right-2 z-20 w-7 h-7 bg-white/95 rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
      >
        <Heart
          size={14}
          className={
            wishlisted
              ? "fill-red-500 text-red-500"
              : "text-gray-500 hover:text-red-500"
          }
        />
      </button>

      {/* Info area — kept to ~40% of the card: 2-line name, one unit line,
          price + MRP inline beside the ADD control. */}
      <div className="px-2.5 pt-2 pb-2.5 flex flex-col flex-1 relative z-10 pointer-events-none">
        {/* Product name — up to 2 lines, no reserved blank line: the unit hugs
            the name and any slack sits above the price row (mt-auto), while
            the flex/grid parents stretch cards to equal height. */}
        <h3 className="text-[12.5px] font-semibold text-brown line-clamp-2 leading-[1.3]">
          {product.name}
        </h3>

        {/* Unit + rating */}
        <div className="mt-0.5 flex items-center justify-between gap-1.5 min-h-[15px]">
          <p className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
            {displayUnit}
            {otherVariantCount > 0 && (
              <span className="text-saffron-deep font-semibold text-[10px] shrink-0">
                +{otherVariantCount} sizes
              </span>
            )}
          </p>
          {rating.count > 0 && (
            <StarRating
              rating={rating.average}
              size={10}
              showNumber
              count={rating.count}
            />
          )}
        </div>

        {/* Price + Add button row */}
        <div className="mt-auto pt-1.5 flex items-center justify-between gap-2 pointer-events-auto">
          <div className="min-w-0 flex items-baseline gap-1 flex-wrap">
            <span className="text-[14px] font-bold text-brown leading-none">
              ₹{displayPrice}
            </span>
            {discount > 0 && (
              <span className="text-[10.5px] text-gray-500 line-through leading-none">
                ₹{displayMrp}
              </span>
            )}
          </div>

          {outOfStock ? (
            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1.5 rounded-lg uppercase shrink-0">
              Sold out
            </span>
          ) : quantity === 0 ? (
            <button
              onClick={(e) => {
                stop(e);
                addItem(product, defaultVariant);
              }}
              className="min-h-[28px] px-3.5 py-1 border border-indian-green text-indian-green text-[12px] font-bold rounded-lg hover:bg-green-light transition-colors uppercase tracking-wide shrink-0"
            >
              ADD
            </button>
          ) : (
            <div className="flex items-center min-h-[28px] bg-indian-green rounded-lg overflow-hidden shadow-sm shrink-0">
              <button
                onClick={(e) => {
                  stop(e);
                  quantity === 1
                    ? removeItem(product.id, defaultVariant?.id ?? null)
                    : updateQuantity(product.id, quantity - 1, defaultVariant?.id ?? null);
                }}
                aria-label="decrease"
                className="px-2 py-1 text-white hover:bg-green-700 transition-colors"
              >
                <Minus size={14} strokeWidth={3} />
              </button>
              <span className="text-white text-[13px] font-bold px-1 min-w-[16px] text-center">
                {quantity}
              </span>
              <button
                onClick={(e) => {
                  stop(e);
                  if (!limitReached) updateQuantity(product.id, quantity + 1, defaultVariant?.id ?? null);
                }}
                disabled={limitReached}
                aria-label="increase"
                className="px-2 py-1 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            </div>
          )}
        </div>
        {lowStock && (
          <p className="mt-1 text-[10px] text-orange-600 font-semibold pointer-events-none leading-none">
            Only {displayStock} left
          </p>
        )}
      </div>
    </div>
  );
}
