"use client";

import { useEffect, useRef, useState } from "react";
import { isDemoMode } from "@/lib/supabase/helpers";
import { STORE_LOCATION } from "@/lib/constants";
import type { Order, OrderStatus } from "@/types";

// Status flow used for auto-progression
const FLOW: OrderStatus[] = [
  "placed",
  "confirmed",
  "picking",
  "picked",
  "out_for_delivery",
  "delivered",
];

// Seconds spent in each non-terminal stage during demo simulation
const STAGE_SECS: Record<OrderStatus, number> = {
  placed: 8,
  confirmed: 10,
  picking: 12,
  picked: 10,
  out_for_delivery: 60, // covers full ride from store to door
  delivered: 0,
  cancelled: 0,
  return_requested: 0,
  return_approved: 0,
  return_rejected: 0,
  refunded: 0,
};

// Rider's assumed average city speed (km/h) for ETA math
const RIDER_SPEED_KMPH = 22;

/** Haversine distance in kilometres between two lat/lng pairs. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface LiveTracking {
  order: Order | null;
  /** Live rider lat/lng — null when no rider assigned yet. */
  riderLat: number | null;
  riderLng: number | null;
  /** Remaining km from rider to destination. null when no rider yet. */
  remainingKm: number | null;
  /** Estimated minutes until delivery. */
  etaMins: number;
  /** Live status (may auto-progress in demo mode). */
  status: OrderStatus;
}

/**
 * Returns an enriched, live-updating view of an order.
 * - In demo mode: simulates status progression and rider movement towards destination.
 * - In Supabase mode: passes through, since useOrder() already subscribes to realtime.
 */
export function useLiveOrderTracking(order: Order | null): LiveTracking {
  // Anchor when this hook first saw the order — drives the demo timeline
  const openedAt = useRef<number>(Date.now());
  const initialStatus = useRef<OrderStatus | null>(null);
  const [, force] = useState(0);

  // Reset timer when order id changes
  useEffect(() => {
    if (!order) return;
    openedAt.current = Date.now();
    initialStatus.current = order.status;
  }, [order?.id, order]);

  // Tick every second in demo mode so ETA / movement update smoothly.
  // Skip ticking for terminal states (no progression possible).
  const TERMINAL_STATES: OrderStatus[] = [
    "delivered",
    "cancelled",
    "return_requested",
    "return_approved",
    "return_rejected",
    "refunded",
  ];
  useEffect(() => {
    if (!isDemoMode()) return;
    if (!order) return;
    if (TERMINAL_STATES.includes(order.status)) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, order?.status]);

  if (!order) {
    return {
      order: null,
      riderLat: null,
      riderLng: null,
      remainingKm: null,
      etaMins: 0,
      status: "placed",
    };
  }

  // ── Supabase / real mode ───────────────────────────────────────────
  // Realtime subscription in useOrder() updates `order` already.
  if (!isDemoMode()) {
    const destLat = order.lat ?? STORE_LOCATION.lat;
    const destLng = order.lng ?? STORE_LOCATION.lng;
    const riderLat = order.rider?.lat ?? null;
    const riderLng = order.rider?.lng ?? null;
    const remainingKm =
      riderLat != null && riderLng != null
        ? haversineKm(riderLat, riderLng, destLat, destLng)
        : null;
    const etaMins =
      remainingKm != null
        ? Math.max(1, Math.round((remainingKm / RIDER_SPEED_KMPH) * 60))
        : staticEtaForStatus(order.status);
    return {
      order,
      riderLat,
      riderLng,
      remainingKm,
      etaMins,
      status: order.status,
    };
  }

  // ── Demo mode simulation ───────────────────────────────────────────
  // Terminal states (incl. return/refund) — no simulation, pass through.
  if (TERMINAL_STATES.includes(order.status)) {
    const destLat = order.lat ?? STORE_LOCATION.lat;
    const destLng = order.lng ?? STORE_LOCATION.lng;
    const riderLat = order.rider?.lat ?? null;
    const riderLng = order.rider?.lng ?? null;
    return {
      order,
      riderLat,
      riderLng,
      remainingKm:
        riderLat != null && riderLng != null
          ? haversineKm(riderLat, riderLng, destLat, destLng)
          : null,
      etaMins: 0,
      status: order.status,
    };
  }

  const elapsed = (Date.now() - openedAt.current) / 1000;
  const startStatus = initialStatus.current ?? order.status;
  const startIdx = Math.max(0, FLOW.indexOf(startStatus));

  // Walk forward through stages, subtracting each stage's duration
  let remaining = elapsed;
  let liveStatus: OrderStatus = startStatus;
  for (let i = startIdx; i < FLOW.length - 1; i++) {
    const stage = FLOW[i];
    const dur = STAGE_SECS[stage];
    if (remaining >= dur) {
      remaining -= dur;
      liveStatus = FLOW[i + 1];
    } else {
      liveStatus = FLOW[i];
      break;
    }
  }

  const destLat = order.lat ?? STORE_LOCATION.lat;
  const destLng = order.lng ?? STORE_LOCATION.lng;

  // Rider position: appears only at `out_for_delivery`, starts at store,
  // moves toward destination as that stage progresses.
  let riderLat: number | null = null;
  let riderLng: number | null = null;
  let remainingKm: number | null = null;

  if (
    liveStatus === "out_for_delivery" ||
    liveStatus === "delivered"
  ) {
    const stageDur = STAGE_SECS.out_for_delivery;
    const stageElapsed =
      liveStatus === "delivered" ? stageDur : Math.min(stageDur, Math.max(0, remaining));
    const t = stageDur > 0 ? stageElapsed / stageDur : 1;
    riderLat = STORE_LOCATION.lat + (destLat - STORE_LOCATION.lat) * t;
    riderLng = STORE_LOCATION.lng + (destLng - STORE_LOCATION.lng) * t;
    remainingKm = haversineKm(riderLat, riderLng, destLat, destLng);
  } else if (order.rider?.lat != null && order.rider?.lng != null) {
    // Earlier stages may already have a rider attached in fixtures
    riderLat = order.rider.lat;
    riderLng = order.rider.lng;
    remainingKm = haversineKm(riderLat, riderLng, destLat, destLng);
  }

  const etaMins =
    liveStatus === "delivered"
      ? 0
      : remainingKm != null
        ? Math.max(1, Math.round((remainingKm / RIDER_SPEED_KMPH) * 60))
        : staticEtaForStatus(liveStatus);

  return {
    order: {
      ...order,
      status: liveStatus,
      delivered_at:
        liveStatus === "delivered"
          ? order.delivered_at || new Date().toISOString()
          : order.delivered_at,
    },
    riderLat,
    riderLng,
    remainingKm,
    etaMins,
    status: liveStatus,
  };
}

function staticEtaForStatus(status: OrderStatus): number {
  switch (status) {
    case "placed":
      return 10;
    case "confirmed":
      return 9;
    case "picking":
      return 8;
    case "picked":
      return 6;
    case "out_for_delivery":
      return 3;
    default:
      return 0;
  }
}
