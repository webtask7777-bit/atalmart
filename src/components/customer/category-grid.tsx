"use client";

import { useMemo } from "react";
import { CATEGORIES_SEED } from "@/lib/constants";

// Soft pastel backgrounds for each category tile
const TILE_COLORS = [
  "bg-amber-50",
  "bg-blue-50",
  "bg-green-50",
  "bg-pink-50",
  "bg-purple-50",
  "bg-orange-50",
  "bg-rose-50",
  "bg-teal-50",
  "bg-indigo-50",
  "bg-yellow-50",
];

interface CategoryGridProps {
  selected: string | null;
  onSelect: (category: string | null) => void;
}

export function CategoryGrid({ selected, onSelect }: CategoryGridProps) {
  const tiles = useMemo(
    () =>
      CATEGORIES_SEED.map((c, i) => ({
        ...c,
        bg: TILE_COLORS[i % TILE_COLORS.length],
      })),
    [],
  );

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
        {tiles.map((cat) => {
          const active = selected === cat.name;
          return (
            <button
              key={cat.name}
              onClick={() => onSelect(active ? null : cat.name)}
              className={`group relative flex flex-col items-center text-center p-1.5 rounded-2xl transition-all ${
                active ? "ring-2 ring-saffron ring-offset-2" : ""
              }`}
            >
              <div
                className={`w-full aspect-square ${cat.bg} rounded-2xl flex items-center justify-center text-3xl md:text-4xl group-hover:scale-105 transition-transform`}
              >
                {cat.icon}
              </div>
              <p className="mt-1.5 text-[11px] md:text-[12px] font-semibold text-brown leading-tight line-clamp-2">
                {cat.name}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
