"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { SHOPPABLE_BRANDS, type BrandCard } from "@/lib/brands-data";
import { useRailScroll } from "@/lib/hooks/use-rail-scroll";
import { RailArrow } from "@/components/customer/product-rail";

interface BrandRailProps {
  /** How many tiles to show (the manifest is sorted by live product count). */
  limit?: number;
  brands?: BrandCard[];
}

/**
 * "Shop by brand" — horizontal strip of logo tiles that open the brand's
 * search results. Tiles come from the generated manifest
 * (src/lib/brands-data.ts, built by scripts/build-brand-cards.py) and only
 * brands with live products are listed, so no tile leads to an empty page.
 */
export function BrandRail({ limit = 24, brands = SHOPPABLE_BRANDS }: BrandRailProps) {
  const railRef = useRef<HTMLUListElement>(null);
  const { canLeft, canRight, scrollByPage } = useRailScroll(railRef);
  const list = brands.slice(0, limit);
  if (list.length === 0) return null;
  return (
    <section className="mt-5" aria-labelledby="brand-rail-title">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2
            id="brand-rail-title"
            className="text-[18px] font-bold text-brown leading-tight flex items-center gap-2"
          >
            <span className="text-2xl" aria-hidden="true">
              🏷️
            </span>
            Shop by brand
          </h2>
          <p className="text-xs text-brown-light mt-0.5">Aapke bharose ke brands, ek tap par</p>
        </div>
      </div>

      <div className="relative">
        <RailArrow dir="left" visible={canLeft} onClick={() => scrollByPage("left")} />
        <RailArrow dir="right" visible={canRight} onClick={() => scrollByPage("right")} />
        <ul ref={railRef} className="rail-x flex gap-3 -mx-4 px-4 scroll-pl-4 pb-2 pt-1 list-none m-0">
        {list.map((b) => (
          <li key={b.slug} className="shrink-0 snap-start w-[88px] md:w-[104px]">
            <Link
              href={`/?search=${encodeURIComponent(b.search)}`}
              className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2"
              aria-label={`Shop ${b.name} products`}
            >
              <div className="aspect-square rounded-2xl bg-white border border-gray-200 group-hover:border-saffron group-hover:shadow-md transition-all p-3 flex items-center justify-center">
                <Image
                  src={b.logo}
                  alt=""
                  width={104}
                  height={104}
                  loading="lazy"
                  className="w-full h-full object-contain select-none"
                />
              </div>
              <p className="mt-1.5 text-[11px] md:text-xs font-semibold text-brown text-center truncate">
                {b.name}
              </p>
            </Link>
          </li>
        ))}
        </ul>
      </div>
    </section>
  );
}
