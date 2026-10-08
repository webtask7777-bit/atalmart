/**
 * Search intent + ranking for the storefront.
 *
 * The catalogue query is an ILIKE over name / name_hi / description. For a
 * generic product type that is far too wide: "milk" matched 90 rows and the
 * first screen was tea, chocolate, ghee and lassi (their descriptions
 * mention milk) while the Hindi "दूध" found 13 ordinary milks. This module
 *   • expands a query with product-type aliases so "milk", "doodh" and
 *     "दूध" fetch the same rows, and
 *   • ranks results so name / product-type matches sit above rows that only
 *     match in their description. Exact named-product queries are unaffected
 *     (a name match is always tier 1).
 *
 * Pure: no React, no Supabase — covered by tests/search-rank.test.ts.
 */

import { hashId } from "@/lib/product-order";

export interface ProductType {
  /** Canonical key. */
  key: string;
  /** Query spellings that mean this type (lower-case; Hindi as typed). */
  aliases: readonly string[];
  /** `products.subcategory` labels that ARE this type (see subcategories.ts). */
  subcategories: readonly string[];
  /** Name words that mark a derivative/flavoured item to rank after the
   *  plain product for a generic query. Still shown — just later. */
  derivative?: RegExp;
}

export const PRODUCT_TYPES: readonly ProductType[] = [
  {
    key: "milk",
    aliases: ["milk", "दूध", "doodh", "dudh", "dood"],
    subcategories: ["Milk"],
    derivative:
      /flavou?red|chocolate|badam|kesar|elaichi|rose|vanilla|strawberry|pineapple|coffee|powder|condensed|milkmaid|chhach|chaas|buttermilk|shake/i,
  },
  { key: "curd", aliases: ["curd", "दही", "dahi", "yogurt", "yoghurt"], subcategories: ["Curd & Yogurt"] },
  { key: "paneer", aliases: ["paneer", "पनीर"], subcategories: ["Paneer & Tofu"] },
  { key: "ghee", aliases: ["ghee", "घी"], subcategories: ["Ghee", "Ghee & Vanaspati"] },
  { key: "butter", aliases: ["butter", "मक्खन", "makkhan"], subcategories: ["Butter & Cheese"] },
  { key: "atta", aliases: ["atta", "आटा", "wheat flour"], subcategories: ["Atta", "Fresh Atta"] },
  { key: "rice", aliases: ["rice", "चावल", "chawal"], subcategories: ["Rice"] },
  { key: "bread", aliases: ["bread", "ब्रेड", "pav"], subcategories: ["Bread"] },
  { key: "eggs", aliases: ["egg", "अंडा", "eggs", "anda", "ande", "अंडे"], subcategories: ["Eggs"] },
  { key: "oil", aliases: ["oil", "तेल", "tel"], subcategories: ["Cooking Oil"] },
  { key: "tea", aliases: ["tea", "चाय", "chai"], subcategories: ["Tea", "Green & Herbal Tea"] },
  { key: "coffee", aliases: ["coffee", "कॉफी"], subcategories: ["Coffee"] },
  { key: "noodles", aliases: ["maggi", "मैगी", "noodles", "noodle"], subcategories: ["Noodles"] },
  { key: "sugar", aliases: ["sugar", "चीनी", "cheeni", "shakkar"], subcategories: ["Salt & Sugar"] },
  { key: "salt", aliases: ["salt", "नमक", "namak"], subcategories: ["Salt & Sugar"] },
];

export function normalizeQuery(q: string): string {
  return q.normalize("NFC").replace(/[,()]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The product type a whole query names ("milk", "दूध"), else null. */
export function matchProductType(q: string): ProductType | null {
  const n = normalizeQuery(q);
  if (!n) return null;
  return PRODUCT_TYPES.find((t) => t.aliases.includes(n)) ?? null;
}

/**
 * Terms to OR together in the catalogue query. A generic type query expands
 * to its aliases (capped so the PostgREST filter stays small); anything else
 * is searched as typed.
 */
export function expandQueryTerms(q: string, max = 4): string[] {
  const n = normalizeQuery(q);
  if (!n) return [];
  const type = matchProductType(n);
  if (!type) return [n];
  const out = [n, ...type.aliases.filter((a) => a !== n)];
  return Array.from(new Set(out)).slice(0, max);
}

export interface Searchable {
  id: string;
  name: string;
  name_hi?: string | null;
  description?: string | null;
  subcategory?: string | null;
  stock: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isLatin = (s: string) => /^[\x00-\x7FÀ-ɏ\s'".-]+$/.test(s);

/** Lower is better. Exported for tests. */
export function searchScore(p: Searchable, q: string): number {
  const terms = expandQueryTerms(q, 8);
  if (terms.length === 0) return 0;
  const type = matchProductType(q);
  const name = p.name.toLowerCase();
  const nameHi = (p.name_hi ?? "").toLowerCase();
  const desc = (p.description ?? "").toLowerCase();

  let tier = 4; // no match at all (shouldn't happen for fetched rows)
  for (const t of terms) {
    const word = isLatin(t) ? new RegExp(`(^|[^a-z0-9])${escapeRe(t)}(?=$|[^a-z0-9])`, "i") : null;
    if (word ? word.test(name) : name.includes(t)) tier = Math.min(tier, 1);
    else if (name.includes(t)) tier = Math.min(tier, 2);
    if (nameHi && nameHi.includes(t)) tier = Math.min(tier, 1.5);
    if (desc.includes(t)) tier = Math.min(tier, 3);
  }

  let score = tier;
  if (type) {
    const isType = !!p.subcategory && type.subcategories.includes(p.subcategory);
    if (isType && tier <= 2) score = 0;
    if (score === 0 && type.derivative && type.derivative.test(p.name)) score += 0.5;
  }
  if (p.stock <= 0) score += 10;
  return score;
}

/** Stable ranking: score, then id hash (so sibling sizes spread out). */
export function rankSearchResults<T extends Searchable>(products: T[], q: string): T[] {
  if (!normalizeQuery(q)) return products;
  return products
    .map((p, i) => ({ p, s: searchScore(p, q), i }))
    .sort((a, b) => a.s - b.s || hashId(a.p.id) - hashId(b.p.id) || a.i - b.i)
    .map((x) => x.p);
}

/** Client-side filter for demo mode / in-memory lists: same terms as the
 *  server query (name, name_hi, description). */
export function matchesQuery(p: Searchable, q: string): boolean {
  const terms = expandQueryTerms(q, 8);
  if (terms.length === 0) return true;
  const hay = [p.name, p.name_hi ?? "", p.description ?? ""].join("\n").toLowerCase();
  return terms.some((t) => hay.includes(t));
}
