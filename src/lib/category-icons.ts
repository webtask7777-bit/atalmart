/**
 * Category → SVG icon mapping (atalmart-category-icons-svg-v1).
 *
 * The pack ships one 64×64 outline icon per storefront category under
 * public/icons/categories/<slug>.svg (deep green #0F5C3A strokes, orange
 * #FF6B00 accents, cream fills) plus an "all" icon. Slugs are the same ones
 * the category card art uses (public/categories/<slug>.webp).
 */

export const CATEGORY_SLUGS: Record<string, string> = {
  "Paan Corner": "paan-corner",
  Dairy: "dairy",
  "Fruits & Vegetables": "fruits-vegetables",
  "Cold Drinks & Juices": "cold-drinks-juices",
  "Snacks & Munchies": "snacks-munchies",
  "Breakfast & Instant Food": "breakfast-instant",
  "Chocolates & Sweets": "chocolates-sweets",
  "Bakery & Biscuits": "bakery-biscuits",
  "Tea, Coffee & Health Drink": "tea-coffee",
  "Atta, Rice & Dal": "atta-rice-dal",
  "Masala, Oil & More": "masala-oil",
  "Sauces & Spreads": "sauces-spreads",
  "Chicken, Meat & Fish": "chicken-meat-fish",
  "Baby Care": "baby-care",
  "Pharma & Wellness": "pharma-wellness",
  "Cleaning Essentials": "cleaning-essentials",
  "Stationery, Office & School": "stationery-office-school",
  "Personal Care": "personal-care",
  "Pet Care": "pet-care",
};

export const ALL_CATEGORIES_ICON = "/icons/categories/all.svg";

/** Icon URL for a category name, or null when the pack has no icon for it. */
export function categoryIconSrc(name: string): string | null {
  const slug = CATEGORY_SLUGS[name];
  return slug ? `/icons/categories/${slug}.svg` : null;
}
