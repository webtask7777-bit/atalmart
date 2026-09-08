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
  /** Category names with zero live products — shown dimmed as "Coming
   *  soon" and not clickable, so a tap never lands on an empty page. */
  emptyCategories?: Set<string>;
}

export function CategoryGrid({
  selected,
  onSelect,
  categoryThumbs,
  emptyCategories,
}: CategoryGridProps) {
  return (
    <section className="mt-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-[18px] font-bold text-brown leading-tight flex items-center gap-2">
            <span className="text-2xl">🛍️</span>
            Shop by category
          </h2>
          <p className="text-xs text-brown-light mt-0.5">
            {CATEGORIES_SEED.length} categories · sab kuch ek jagah
          </p>
        </div>
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
          const empty = emptyCategories?.has(cat.name) ?? false;
          return (
            <button
              key={cat.name}
              onClick={() => !empty && onSelect(active ? null : cat.name)}
              disabled={empty}
              aria-disabled={empty}
              title={empty ? `${cat.name} — coming soon` : cat.name}
              className={`group relative flex flex-col items-center text-center p-1.5 rounded-2xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 ${
                empty ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {empty && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 rounded-full bg-brown/85 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white whitespace-nowrap shadow-sm">
                  Coming soon
                </span>
              )}
              {/* "Shop window" frame. The art's own canvas is #F7F8F6, so the
                  tile uses the same colour and the frame is drawn ON TOP of the
                  art: a warm outer border, a thin brass inner line (echoing the
                  wood/brass in every shop) with a hairline bevel, and a soft
                  ground shadow under the shop. Hover lifts the card with a
                  green-tinted shadow; the selected tile turns the frame saffron.
                  object-contain + minimal padding: cropping would cut cart
                  wheels / roofs / the 18+ badge. */}
              <div
                className={`relative w-full aspect-square rounded-2xl overflow-hidden bg-[#F7F8F6] border transition-all duration-200 group-hover:-translate-y-0.5 ${
                  active
                    ? "border-saffron shadow-[0_8px_20px_rgba(255,107,0,0.18)]"
                    : "border-[#DED6C4] shadow-[0_1px_2px_rgba(60,40,20,0.06)] group-hover:border-[#C9A24A] group-hover:shadow-[0_10px_24px_rgba(22,101,52,0.16)]"
                }`}
              >
                {thumb ? (
                  <Image
                    src={thumb}
                    alt={`${cat.name} shop`}
                    fill
                    sizes="(max-width: 640px) 22vw, (max-width: 1024px) 12vw, 9vw"
                    className="object-contain p-1 group-hover:scale-[1.04] transition-transform duration-200"
                  />
                ) : (
                  <span className="text-3xl md:text-4xl group-hover:scale-105 transition-transform duration-200">
                    {cat.icon}
                  </span>
                )}
                {/* focus vignette: clear over the shop, warm cream at the edges */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,transparent_52%,rgba(246,242,232,0.55)_78%,rgba(240,234,220,0.95)_100%)]"
                />
                {/* ground shadow under the shop */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-[16%] bottom-[8%] h-[7%] rounded-[50%] bg-[#1F3A2A]/12 blur-[3px]"
                />
                {/* brass inner line + hairline bevel */}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-[4px] rounded-[12px] border-[1.5px] transition-colors duration-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9),0_0_0_1px_rgba(255,255,255,0.7)] ${
                    active
                      ? "border-saffron/80"
                      : "border-[#C9A24A]/60 group-hover:border-[#C9A24A]"
                  }`}
                />
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
