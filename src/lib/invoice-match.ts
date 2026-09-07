/**
 * Match wholesale-invoice line descriptions to catalogue products.
 *
 * Pure functions, no I/O. Used by the Purchases "Import invoice" flow: a
 * Flipkart Wholesale bill says "AASHIRVAAD SHUDH CHAKKI ATTA 10KG" and the
 * catalogue says "Aashirvaad Select Sharbati Atta (10 kg)" — we tokenise
 * both, compare word overlap, and weight pack size heavily (same brand but
 * a different size is a DIFFERENT SKU — the bulk image pipeline learned that
 * the hard way, see AGENTS.md).
 */

import type { Product } from "@/types";

export type MatchConfidence = "high" | "medium" | "low" | "none";

export interface LineMatch {
  /** Best candidate, or null when nothing scored above the floor. */
  product: Product | null;
  confidence: MatchConfidence;
  score: number;
  /** Top alternatives (best first) for a manual pick. */
  candidates: { product: Product; score: number }[];
}

const STOP = new Set([
  "the", "and", "of", "with", "pack", "packet", "pouch", "bottle", "box", "jar",
  "tin", "can", "combo", "new", "pcs", "pc", "nos", "no", "x", "pack of",
  "flavour", "flavor", "premium", "special",
]);

/** "10kg" / "10 kg" / "1000 g" / "1 l" / "500ml" → canonical grams/ml number. */
function sizeTokens(s: string): Set<string> {
  const out = new Set<string>();
  const re = /(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|gram|grams|l|ltr|litre|liter|ml|pcs|pc|pieces|units?|n)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u.startsWith("kg")) out.add(`w${Math.round(n * 1000)}`);
    else if (u.startsWith("g")) out.add(`w${Math.round(n)}`);
    else if (u === "l" || u.startsWith("lt") || u.startsWith("li")) out.add(`v${Math.round(n * 1000)}`);
    else if (u === "ml") out.add(`v${Math.round(n)}`);
    else out.add(`c${Math.round(n)}`);
  }
  return out;
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
}

const wordCache = new WeakMap<Product, { words: Set<string>; sizes: Set<string> }>();
function productIndex(p: Product) {
  let idx = wordCache.get(p);
  if (!idx) {
    const text = `${p.name} ${p.unit ?? ""}`;
    idx = { words: new Set(words(text)), sizes: sizeTokens(text) };
    wordCache.set(p, idx);
  }
  return idx;
}

interface DescTokens {
  words: string[];
  sizes: Set<string>;
}
function tokenizeDescription(description: string): DescTokens {
  return { words: words(description), sizes: sizeTokens(description) };
}

/** Score in [0, 1]-ish: word overlap, boosted/penalised by pack size. */
export function scoreMatch(description: string, product: Product): number {
  return scoreTokens(tokenizeDescription(description), product);
}

function scoreTokens({ words: dWords, sizes: dSizes }: DescTokens, product: Product): number {
  if (dWords.length === 0) return 0;
  const { words: pWords, sizes: pSizes } = productIndex(product);
  if (pWords.size === 0) return 0;

  let hit = 0;
  for (const w of dWords) {
    if (pWords.has(w)) hit += 1;
    else {
      // Prefix match handles "chakki"/"chakkie" and singular/plural.
      for (const pw of pWords) {
        if (pw.length > 3 && (pw.startsWith(w) || w.startsWith(pw))) { hit += 0.6; break; }
      }
    }
  }
  // Recall of invoice words in product name, tempered by product name length
  // so a 12-word product doesn't win on 2 generic words.
  const recall = hit / dWords.length;
  const precision = hit / pWords.size;
  let score = 0.65 * recall + 0.35 * precision;

  if (dSizes.size > 0 && pSizes.size > 0) {
    const same = [...dSizes].some((s) => pSizes.has(s));
    score += same ? 0.25 : -0.35;
  }
  // First word is almost always the brand — strong signal both ways.
  if (dWords[0] && pWords.has(dWords[0])) score += 0.1;
  return Math.max(0, Math.min(1.2, score));
}

export function matchLine(description: string, products: Product[], limit = 5): LineMatch {
  // Tokenise the bill line once, not once per catalogue product.
  const tokens = tokenizeDescription(description);
  const scored: { product: Product; score: number }[] = [];
  for (const p of products) {
    if (p.active === false) continue;
    const s = scoreTokens(tokens, p);
    if (s > 0.2) scored.push({ product: p, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const candidates = scored.slice(0, limit);
  if (!best) return { product: null, confidence: "none", score: 0, candidates };
  // Ambiguity guard: a close runner-up (e.g. sibling size) downgrades "high".
  const runnerUp = scored[1]?.score ?? 0;
  const clear = best.score - runnerUp >= 0.12;
  let confidence: MatchConfidence = "low";
  if (best.score >= 0.7 && clear) confidence = "high";
  else if (best.score >= 0.45) confidence = "medium";
  return {
    // Only a clear, high-scoring match is auto-assigned. A wrong auto-match
    // would receive stock onto the wrong SKU, so "medium" stays a suggestion
    // the admin confirms from the search box.
    product: confidence === "high" ? best.product : null,
    confidence,
    score: best.score,
    candidates,
  };
}
