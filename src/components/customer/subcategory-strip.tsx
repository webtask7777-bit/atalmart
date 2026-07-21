"use client";

import type { Product } from "@/types";
import { subcatsFor } from "@/lib/subcategories";

interface SubcategoryStripProps {
  categoryName: string;
  /** The already-loaded products for this category (used to hide empty chips). */
  products: Product[];
  selected: string | null;
  onSelect: (sub: string | null) => void;
}

/**
 * Horizontal chip-strip shown under the category header (Blinkit-style). Renders
 * an always-present "All" chip plus one chip per subcategory that actually has ≥1
 * product in the current list. Returns null when the category has no taxonomy or
 * no subcategory has products (so a flat category still looks unchanged).
 */
export function SubcategoryStrip({
  categoryName,
  products,
  selected,
  onSelect,
}: SubcategoryStripProps) {
  const subcats = subcatsFor(categoryName);
  if (!subcats.length) return null;

  // Count products per subcategory so we only show chips that lead somewhere.
  const counts = new Map<string, number>();
  for (const p of products) {
    if (p.subcategory) counts.set(p.subcategory, (counts.get(p.subcategory) || 0) + 1);
  }
  const visible = subcats.filter((sc) => (counts.get(sc.name) || 0) > 0);
  if (!visible.length) return null;

  return (
    <div className="overflow-x-auto scrollbar-hide py-2 -mx-4 px-4">
      <div className="flex gap-2 min-w-max">
        <SubPill label="All" active={selected === null} onClick={() => onSelect(null)} />
        {visible.map((sc) => (
          <SubPill
            key={sc.name}
            icon={sc.icon}
            label={sc.name}
            active={selected === sc.name}
            onClick={() => onSelect(selected === sc.name ? null : sc.name)}
          />
        ))}
      </div>
    </div>
  );
}

function SubPill({
  icon,
  label,
  active,
  onClick,
}: {
  icon?: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all shrink-0 text-[12px] font-semibold whitespace-nowrap ${
        active
          ? "bg-saffron text-white"
          : "bg-white text-brown border border-gray-200 hover:border-saffron hover:text-saffron"
      }`}
    >
      {icon && <span className="text-sm leading-none">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
