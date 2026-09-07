"use client";

import { CATEGORIES_SEED } from "@/lib/constants";

interface CategoryBarProps {
  selected: string | null;
  onSelect: (category: string | null) => void;
  /** Categories with no live products are left out of the strip. */
  emptyCategories?: Set<string>;
}

export function CategoryBar({ selected, onSelect, emptyCategories }: CategoryBarProps) {
  return (
    <div className="overflow-x-auto scrollbar-hide py-2 md:py-3 -mx-4 px-4">
      <div className="flex gap-2 min-w-max">
        <CategoryPill
          icon="🏪"
          label="All"
          active={selected === null}
          onClick={() => onSelect(null)}
        />
        {CATEGORIES_SEED.filter((cat) => !emptyCategories?.has(cat.name)).map((cat) => (
          <CategoryPill
            key={cat.name}
            icon={cat.icon}
            label={cat.name}
            active={selected === cat.name}
            onClick={() => onSelect(cat.name)}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryPill({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-full transition-all shrink-0 text-[12px] font-semibold whitespace-nowrap ${
        active
          ? "bg-saffron text-white"
          : "bg-white text-brown border border-gray-200 hover:border-saffron hover:text-saffron"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
