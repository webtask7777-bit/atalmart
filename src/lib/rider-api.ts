"use client";

/**
 * Client-side helpers for the rider app. The session token lives in
 * localStorage and is attached as a Bearer header on every call.
 */

const TOKEN_KEY = "atalmart-rider-token";

export interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  vehicle_number: string | null;
  status: "available" | "busy" | "offline";
}

export interface RiderOrder {
  id: string;
  status: string;
  total: number;
  delivery_fee: number;
  address_line: string;
  lat: number;
  lng: number;
  phone: string | null;
  payment_method: string | null;
  placed_at: string;
  items: { product_name: string; quantity: number }[];
  customer: { name: string | null } | null;
}

export interface RiderStats {
  /** 0 = fixed salary; the app hides per-delivery earnings then. */
  payoutPerDelivery: number;
  /** Daily bonus rule; target 0 = none. */
  bonus: { target: number; amount: number };
  today: { deliveries: number; earnings: number; bonusEarned: boolean };
  allTime: { deliveries: number; earnings: number; bonusDays: number };
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth !== false) {
    const token = getToken();
    if (token) headers["authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`/api/rider/${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function login(phone: string, code: string) {
  return api<{ token: string; rider: RiderProfile }>("login", {
    method: "POST",
    body: { phone, code },
    auth: false,
  });
}
export function fetchMe() {
  return api<{ rider: RiderProfile }>("me");
}
export function fetchOrders() {
  return api<{ orders: RiderOrder[] }>("orders");
}
export function fetchStats() {
  return api<RiderStats>("stats");
}
export function setOnlineStatus(status: "available" | "offline") {
  return api<{ ok: boolean; status: string }>("status", {
    method: "POST",
    body: { status },
  });
}
export function pushLocation(lat: number, lng: number) {
  return api<{ ok: boolean }>("location", {
    method: "POST",
    body: { lat, lng },
  });
}
export function updateOrderStatus(orderId: string, status: string) {
  return api<{ ok: boolean; status: string }>("order-status", {
    method: "POST",
    body: { orderId, status },
  });
}
