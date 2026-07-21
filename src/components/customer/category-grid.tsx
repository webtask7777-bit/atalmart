"use client";

import Image from "next/image";
import { CATEGORIES_SEED } from "@/lib/constants";

interface CategoryGridProps {
  selected: string | null;
  onSelect: (category: string | null) => void;
  /** category name → representative product image URL. When a category has a
   *  real photo here it renders instead of the seed emoji. Built from the
   *  live catalogue in the home page (see page.tsx → categoryThumbs). */
  categoryThumbs?: Record<string, string>;
}

export function CategoryGrid({
  selected,
  onSelect,
  categoryThumbs,
}: CategoryGridProps) {
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[16px] font-bold text-brown">Shop by category</h2>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="text-xs font-semibold text-saffron hover:underline"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 md:gap-3">
        {CATEGORIES_SEED.map((cat) => {
          const active = selected === cat.name;
          const thumb = categoryThumbs?.[cat.name];
          return (
            <button
              key={cat.name}
              onClick={() => onSelect(active ? null : cat.name)}
              className={`group relative flex flex-col items-center text-center p-1.5 rounded-2xl transition-all ${
                active ? "ring-2 ring-saffron ring-offset-2" : ""
              }`}
            >
              {/* Clean light tile (Blinkit/Zepto style). White-background
                  product photos sit flush on the near-white tile, so no
                  background removal is ever needed. */}
              <div className="relative w-full aspect-square rounded-2xl bg-[#f7f7f7] border border-gray-100 flex items-center justify-center overflow-hidden transition-all group-hover:shadow-md group-hover:-translate-y-0.5">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt={cat.name}
                    fill
                    sizes="(max-width: 640px) 22vw, (max-width: 1024px) 12vw, 9vw"
                    className="object-contain p-2 group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <span className="text-3xl md:text-4xl group-hover:scale-105 transition-transform duration-200">
                    {cat.icon}
                  </span>
                )}
              </div>
              {/* Reserved 2-line height (min-h) keeps every row even no matter
                  the word count — same proven trick as the product-card name.
                  Tighter tracking + medium weight reads more premium at the
                  small tile size; label echoes the saffron ring on
                  hover/active so the whole category system feels cohesive. */}
              <p
                className={`mt-1.5 w-full px-0.5 text-center text-[11px] md:text-[12px] font-medium tracking-[-0.01em] leading-[1.25] line-clamp-2 min-h-[2.6em] transition-colors duration-150 ${
                  active
                    ? "text-saffron-dark font-semibold"
                    : "text-brown group-hover:text-saffron"
                }`}
              >
                {cat.name}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
