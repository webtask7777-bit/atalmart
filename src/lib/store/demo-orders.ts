import type { Order } from "@/types";

/**
 * Runtime store for demo-mode orders created via /checkout.
 *
 * The pre-baked demoOrders array (in use-admin.ts) only contains 3 fixtures
 * for the admin dashboard. When a customer places an order in demo mode, we
 * need to persist it locally so the /track/[id] and /orders pages can find it.
 *
 * Stored in localStorage so it survives reloads.
 */

const KEY = "atalmart-demo-orders";

function readAll(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Order[]) : [];
  } catch {
    return [];
  }
}

function writeAll(orders: Order[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(orders));
  } catch {
    // quota or disabled storage — ignore
  }
}

export function addDemoOrder(order: Order) {
  const all = readAll();
  all.unshift(order);
  // Keep last 50 to bound storage
  writeAll(all.slice(0, 50));
}

export function getDemoOrder(id: string): Order | null {
  return readAll().find((o) => o.id === id) || null;
}

export function getAllDemoOrders(): Order[] {
  return readAll();
}

export function updateDemoOrder(id: string, patch: Partial<Order>) {
  const all = readAll();
  const idx = all.findIndex((o) => o.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch };
  writeAll(all);
}
