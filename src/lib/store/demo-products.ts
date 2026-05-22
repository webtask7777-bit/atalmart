import type { Product } from "@/types";

/**
 * Runtime store for demo-mode products added via /admin/products/import.
 *
 * The pre-baked demoProducts array (in lib/demo-data.ts) is static. When an
 * admin bulk-imports an Excel file in demo mode, we persist those products
 * here so they show up across all customer-facing pages and the admin grid.
 *
 * Stored in localStorage so it survives reloads.
 */

const KEY = "atalmart-demo-products";

function readAll(): Product[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Product[]) : [];
  } catch {
    return [];
  }
}

function writeAll(products: Product[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(products));
  } catch {
    // quota or disabled storage — ignore
  }
}

export function getAllDemoProducts(): Product[] {
  return readAll();
}

export function getDemoProduct(id: string): Product | null {
  return readAll().find((p) => p.id === id) || null;
}

/** Bulk upsert — replaces products with same id, appends new ones. */
export function upsertDemoProducts(incoming: Product[]): {
  created: number;
  updated: number;
} {
  const existing = readAll();
  const byId = new Map(existing.map((p) => [p.id, p]));
  let created = 0;
  let updated = 0;
  for (const p of incoming) {
    if (byId.has(p.id)) updated++;
    else created++;
    byId.set(p.id, p);
  }
  writeAll(Array.from(byId.values()));
  return { created, updated };
}

/**
 * Apply a stock delta to a product. Use negative delta when an order is placed
 * (decrement) and positive when an order is cancelled (restore).
 *
 * Persists to the runtime store. Falls back to mutating the demoProducts seed
 * array in-memory so the change is visible immediately without reload.
 */
export function adjustStock(
  productId: string,
  delta: number,
): { found: boolean; newStock?: number; warning?: string } {
  // Try runtime store first (Excel-imported or previously-modified products)
  const existing = readAll();
  const idx = existing.findIndex((p) => p.id === productId);
  if (idx !== -1) {
    const newStock = Math.max(0, existing[idx].stock + delta);
    const warning =
      existing[idx].stock + delta < 0
        ? `Oversold: requested decrement exceeded available stock (had ${existing[idx].stock}, delta ${delta})`
        : undefined;
    existing[idx] = { ...existing[idx], stock: newStock };
    writeAll(existing);
    return { found: true, newStock, warning };
  }

  // Fall back to the per-category lazy-loaded cache. The order placement
  // path runs adjustStock() AFTER the pricing endpoint validated the cart,
  // so the product's category is already in cache. We write a runtime
  // override entry; mergeRuntime() in use-products gives it priority over
  // the static seed for future reads.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCachedProduct } = require("@/lib/demo-products") as {
      getCachedProduct: (id: string) => Product | null;
    };
    const seeded = getCachedProduct(productId);
    if (seeded) {
      const newStock = Math.max(0, seeded.stock + delta);
      const warning =
        seeded.stock + delta < 0
          ? `Oversold: requested decrement exceeded available stock (had ${seeded.stock}, delta ${delta})`
          : undefined;
      writeAll([...existing, { ...seeded, stock: newStock }]);
      return { found: true, newStock, warning };
    }
  } catch {
    // ignore — module load failure
  }

  return { found: false };
}

/** Bulk adjust — used after an order's items are processed. */
export function adjustStockBulk(
  items: { product_id: string; quantity: number }[],
  direction: "decrement" | "restore",
): { applied: number; warnings: string[] } {
  const sign = direction === "decrement" ? -1 : 1;
  const warnings: string[] = [];
  let applied = 0;
  for (const it of items) {
    const result = adjustStock(it.product_id, sign * it.quantity);
    if (result.found) applied++;
    if (result.warning) warnings.push(result.warning);
  }
  return { applied, warnings };
}
