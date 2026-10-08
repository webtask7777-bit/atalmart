/**
 * Product-name helpers shared by the storefront (PDP, cards, cart, checkout)
 * and the server (order lines, metadata).
 *
 * Catalogue names carry the pack size in a trailing bracket — "Amul Taaza
 * Milk (500 ml)". When that product also has pack-size variants (migration
 * 004), the bracket no longer describes what the customer selected: a 1 L
 * variant on the "(500 ml)" product rendered as "Amul Taaza Milk (500 ml)
 * · 1 L" in the cart and "(500 ml) (1 L)" on the order. Every surface now
 * builds its label from a size-free family name + the selected pack.
 */

/** Trailing packaging-type word ("Pouch", "Tetra Pack") — used only to group
 *  sibling catalogue rows that differ by packaging. */
export const PACKAGING_RE =
  /\s+(Pouch|Bag|Pack|Box|Tin|Jar|Pet|Bottle|Carton|Can|Sachet|Refill|Tetrapack|Tetra Pack|Cup|Tub|Tray|Block)\s*$/i;

/** "(500 ml)", "(1 kg)", "(Pack of 2)", "(2 x 500 ml)" at the end of a name. */
const TRAILING_SIZE_RE =
  /\s*\(\s*(?:pack of\s*)?[\d.,]+\s*(?:x\s*[\d.,]+\s*)?[a-zA-Z]*\s*(?:x\s*\d+)?\s*\)\s*$/i;
const PACK_OF_RE = /\s*Pack of \d+\s*/gi;

/** Size-free product family name: "Amul Taaza Milk (500 ml)" → "Amul Taaza Milk".
 *  Packaging words are kept ("Amul Taaza Tetrapack" stays distinct from
 *  "Amul Taaza Milk") because they describe a different sellable format. */
export function familyName(name: string): string {
  const stripped = name.replace(PACK_OF_RE, " ").replace(TRAILING_SIZE_RE, "").replace(/\s+/g, " ").trim();
  return stripped || name.trim();
}

/** Grouping key for sibling catalogue rows: family name minus packaging word,
 *  so "… Pouch (1 kg)" and "… Bag (5 kg)" land in one group. */
export function siblingKey(name: string): string {
  return familyName(name).replace(PACKAGING_RE, "").replace(/\s+/g, " ").trim();
}

/** Packaging-type word from the name ("Pouch", "Bag"), capitalised, or null. */
export function packagingType(name: string): string | null {
  const m = familyName(name).match(PACKAGING_RE);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
}

/** "Family (pack)" — the one label used for a sellable line everywhere.
 *  Appends the pack only when the family name doesn't already end with it. */
export function sellableName(productName: string, pack: string | null | undefined): string {
  const family = familyName(productName);
  const unit = (pack ?? "").trim();
  if (!unit) return family;
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return norm(family).endsWith(norm(unit)) ? family : `${family} (${unit})`;
}
