"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";

/**
 * COD cash ledger for the admin console (migration 023 + 027).
 *
 * One row per cash order: what the rider was expected to collect, what they
 * reported collecting (stamped by the rider app on "delivered"), and what
 * they have handed back to the store (recorded here). Outstanding = collected
 * − remitted, per rider. Reads the `cod_settlement` view (security_invoker,
 * admin-only via RLS) and writes `cod_collections` under the admin policy.
 */
export interface CodRow {
  id: string;
  order_id: string;
  rider_id: string | null;
  rider_name: string | null;
  expected_paise: number;
  collected_paise: number | null;
  remitted_paise: number | null;
  outstanding_paise: number;
  collection_variance_paise: number;
  collected_at: string | null;
  remitted_at: string | null;
}

export interface RiderCodSummary {
  riderId: string;
  riderName: string;
  /** delivered + collected, not yet handed in */
  openRows: CodRow[];
  outstandingPaise: number;
  /** assigned/undelivered cash orders (expected only) */
  pendingRows: CodRow[];
  pendingPaise: number;
}

export function useCodLedger() {
  const [rows, setRows] = useState<CodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (isDemoMode()) {
      setRows([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cod_settlement")
      .select("*")
      .order("collected_at", { ascending: false, nullsFirst: false });
    if (error) setError(error.message);
    setRows(((data ?? []) as Record<string, unknown>[]).map(coerce));
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred so the initial fetch's setState is not synchronous in the
    // effect body (React Compiler rule); the component already mounts with
    // loading=true.
    const id = setTimeout(() => void refetch(), 0);
    return () => clearTimeout(id);
  }, [refetch]);

  return { rows, loading, error, refetch, summaries: summarize(rows) };
}

function coerce(r: Record<string, unknown>): CodRow {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: String(r.id),
    order_id: String(r.order_id),
    rider_id: r.rider_id ? String(r.rider_id) : null,
    rider_name: (r.rider_name as string | null) ?? null,
    expected_paise: Number(r.expected_paise),
    collected_paise: n(r.collected_paise),
    remitted_paise: n(r.remitted_paise),
    outstanding_paise: Number(r.outstanding_paise ?? 0),
    collection_variance_paise: Number(r.collection_variance_paise ?? 0),
    collected_at: (r.collected_at as string | null) ?? null,
    remitted_at: (r.remitted_at as string | null) ?? null,
  };
}

/** Group the ledger per rider: what they hold now vs what is still out for delivery. */
export function summarize(rows: CodRow[]): RiderCodSummary[] {
  const by = new Map<string, RiderCodSummary>();
  for (const r of rows) {
    const key = r.rider_id ?? "unassigned";
    let s = by.get(key);
    if (!s) {
      s = {
        riderId: key,
        riderName: r.rider_name ?? "Unassigned",
        openRows: [],
        outstandingPaise: 0,
        pendingRows: [],
        pendingPaise: 0,
      };
      by.set(key, s);
    }
    if (r.collected_at) {
      if (r.outstanding_paise > 0) {
        s.openRows.push(r);
        s.outstandingPaise += r.outstanding_paise;
      }
    } else if (!r.remitted_at) {
      s.pendingRows.push(r);
      s.pendingPaise += r.expected_paise;
    }
  }
  return [...by.values()].sort((a, b) => b.outstandingPaise - a.outstandingPaise);
}

/**
 * Rider handed `paise` to the store. Settles the rider's open rows oldest
 * first; a partial amount leaves the last row partially outstanding.
 */
export async function recordRemittance(summary: RiderCodSummary, paise: number) {
  if (isDemoMode()) return { error: null, settled: 0 };
  const supabase = createClient();
  const now = new Date().toISOString();
  let left = Math.round(paise);
  let settled = 0;
  const rows = [...summary.openRows].sort(
    (a, b) => new Date(a.collected_at!).getTime() - new Date(b.collected_at!).getTime(),
  );
  for (const r of rows) {
    if (left <= 0) break;
    const take = Math.min(left, r.outstanding_paise);
    const remitted = (r.remitted_paise ?? 0) + take;
    const { error } = await supabase
      .from("cod_collections")
      .update({
        remitted_paise: remitted,
        // remitted_at marks the row fully settled; partial stays open.
        remitted_at: remitted >= (r.collected_paise ?? r.expected_paise) ? now : null,
      })
      .eq("id", r.id);
    if (error) return { error, settled };
    left -= take;
    settled += take;
  }
  return { error: null, settled };
}

/** Admin correction: the rider actually collected a different amount. */
export async function setCollected(row: CodRow, paise: number) {
  if (isDemoMode()) return { error: null };
  const supabase = createClient();
  return supabase
    .from("cod_collections")
    .update({ collected_paise: Math.max(0, Math.round(paise)), collected_at: row.collected_at ?? new Date().toISOString() })
    .eq("id", row.id);
}
