"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { ProductCard } from "@/components/customer/product-card";
import type { Product } from "@/types";

interface ProductRailProps {
  title: string;
  subtitle?: string;
  emoji?: string;
  products: Product[];
  seeAllHref?: string;
  /** Client-side "see all" (e.g. select a category on the home page). When
   *  given, a "See all" tile is appended at the end of the rail too. */
  onSeeAll?: () => void;
  seeAllLabel?: string;
  accent?: "saffron" | "green" | "purple" | "blue";
}

const ACCENT: Record<
  NonNullable<ProductRailProps["accent"]>,
  { from: string; to: string }
> = {
  saffron: { from: "from-saffron/10", to: "to-transparent" },
  green: { from: "from-green-light", to: "to-transparent" },
  purple: { from: "from-purple-100", to: "to-transparent" },
  blue: { from: "from-blue-50", to: "to-transparent" },
};

export function ProductRail({
  title,
  subtitle,
  emoji,
  products,
  seeAllHref,
  onSeeAll,
  seeAllLabel = "See all",
  accent = "saffron",
}: ProductRailProps) {
  const railRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    const el = railRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  const colors = ACCENT[accent];

  return (
    <section
      className={`mt-6 relative rounded-3xl bg-gradient-to-b ${colors.from} ${colors.to} pt-4 pb-2 px-3 md:px-4`}
    >
      <div className="flex items-end justify-between mb-3 px-1">
        <div>
          <h2 className="text-[18px] font-bold text-brown leading-tight flex items-center gap-2">
            {emoji && <span className="text-2xl">{emoji}</span>}
            {title}
          </h2>
          {subtitle && <p className="text-xs text-brown-light mt-0.5">{subtitle}</p>}
        </div>
        {seeAllHref ? (
          <Link
            href={seeAllHref}
            className="text-xs font-bold text-saffron-deep hover:underline flex items-center gap-0.5 shrink-0"
          >
            {seeAllLabel} <ChevronRight size={14} />
          </Link>
        ) : onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs font-bold text-saffron-deep hover:underline flex items-center gap-0.5 shrink-0"
          >
            {seeAllLabel} <ChevronRight size={14} />
          </button>
        ) : null}
      </div>

      {/* Scroll arrows (desktop) */}
      <button
        onClick={() => scroll("left")}
        aria-label="scroll left"
        className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white rounded-full shadow-md items-center justify-center hover:bg-gray-50 -translate-x-1/2"
      >
        <ChevronLeft size={18} className="text-brown" />
      </button>
      <button
        onClick={() => scroll("right")}
        aria-label="scroll right"
        className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white rounded-full shadow-md items-center justify-center hover:bg-gray-50 translate-x-1/2"
      >
        <ChevronRight size={18} className="text-brown" />
      </button>

      <div
        ref={railRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 -mx-3 px-3 md:-mx-1 md:px-1"
      >
        {products.map((p) => (
          <div
            key={p.id}
            className="snap-start shrink-0 w-[150px] sm:w-[170px] md:w-[180px]"
          >
            <ProductCard product={p} />
          </div>
        ))}
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="snap-start shrink-0 w-[110px] sm:w-[130px] self-stretch rounded-2xl border-2 border-dashed border-saffron/40 bg-white/70 hover:bg-saffron-light hover:border-saffron flex flex-col items-center justify-center gap-2 text-saffron-deep transition-colors"
          >
            <span className="w-10 h-10 rounded-full bg-saffron-light flex items-center justify-center">
              <ChevronRight size={20} />
            </span>
            <span className="text-xs font-bold px-2 text-center leading-tight">{seeAllLabel}</span>
          </button>
        )}
      </div>
    </section>
  );
}
