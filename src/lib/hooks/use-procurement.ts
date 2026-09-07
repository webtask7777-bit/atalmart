"use client";

/**
 * Procurement data layer — suppliers + wholesale purchase orders.
 *
 * The admin records each Flipkart Wholesale invoice as a purchase_order with
 * line items; "receiving" it runs the receive_purchase_order RPC (migration
 * 016) which adds stock and writes the landed cost back onto each product.
 *
 * Demo mode: everything is read-only-empty. Procurement is a live-DB feature
 * (there's no localStorage store for it) — hooks return [] so the UI renders
 * an empty state instead of crashing.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/supabase/helpers";
import { purchaseTotals } from "@/lib/pnl";
import type {
  DraftPurchaseLine,
  PurchaseOrder,
  Supplier,
} from "@/types";

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    if (isDemoMode()) {
      const { DEMO_SUPPLIER } = await import("@/lib/demo-procurement");
      setSuppliers([DEMO_SUPPLIER]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("suppliers")
      .select("*")
      .order("name");
    setSuppliers((data as Supplier[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  return { suppliers, loading, refetch: fetchSuppliers };
}

export async function createSupplier(input: {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_name?: string | null;
  address?: string | null;
  notes?: string | null;
}) {
  if (isDemoMode()) return { data: null, error: null };
  const supabase = createClient();
  return supabase.from("suppliers").insert(input).select().single();
}

export function usePurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    if (isDemoMode()) {
      const { demoPurchaseOrders } = await import("@/lib/demo-procurement");
      setOrders(demoPurchaseOrders());
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("purchase_orders")
      .select("*, supplier:suppliers(*), items:purchase_order_items(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    setOrders((data as PurchaseOrder[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, refetch: fetchOrders };
}

export interface CreatePurchaseOrderInput {
  supplier_id: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  shipping_total: number;
  other_charges: number;
  notes?: string | null;
  lines: DraftPurchaseLine[];
}

/**
 * Insert a draft PO + its lines. Header totals are computed here (same math as
 * the RPC uses on receive) so the listing shows a real grand total immediately.
 * Returns the new PO id or an error.
 */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<{ id: string | null; error: string | null }> {
  if (isDemoMode()) {
    return { id: null, error: "Procurement needs the live database (demo mode)." };
  }
  const supabase = createClient();
  const totals = purchaseTotals(
    input.lines.map((l) => ({
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      tax_rate: l.tax_rate,
    })),
    input.shipping_total,
    input.other_charges,
  );

  const { data: userData } = await supabase.auth.getUser();

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({
      supplier_id: input.supplier_id,
      invoice_number: input.invoice_number || null,
      invoice_date: input.invoice_date || null,
      status: "draft",
      shipping_total: input.shipping_total || 0,
      other_charges: input.other_charges || 0,
      goods_subtotal: totals.goodsSubtotal,
      tax_total: totals.taxTotal,
      grand_total: totals.grandTotal,
      notes: input.notes || null,
      created_by: userData?.user?.id ?? null,
    })
    .select("id")
    .single();

  if (poErr || !po) {
    return { id: null, error: poErr?.message || "Failed to create purchase order" };
  }

  const poId = (po as { id: string }).id;
  const rows = input.lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      po_id: poId,
      product_id: l.product_id,
      product_name: l.product_name,
      quantity: l.quantity,
      unit_cost: l.unit_cost || 0,
      tax_rate: l.tax_rate || 0,
      line_total: Math.round((l.unit_cost || 0) * l.quantity * 100) / 100,
    }));

  if (rows.length > 0) {
    const { error: itemsErr } = await supabase
      .from("purchase_order_items")
      .insert(rows);
    if (itemsErr) {
      // Roll back the header so we don't leave an empty PO behind.
      await supabase.from("purchase_orders").delete().eq("id", poId);
      return { id: null, error: itemsErr.message };
    }
  }

  return { id: poId, error: null };
}

/**
 * Receive a draft PO: adds stock + writes landed costs via the RPC. Returns a
 * summary or an error. Common RPC errors are surfaced as friendly strings.
 */
export async function receivePurchaseOrder(
  poId: string,
): Promise<{ ok: boolean; error: string | null; lines?: number; units?: number }> {
  if (isDemoMode()) {
    return { ok: false, error: "Receiving needs the live database (demo mode)." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc("receive_purchase_order", {
    p_po_id: poId,
  });
  if (error) {
    const msg = error.message || "";
    if (msg.includes("PO_NOT_DRAFT")) {
      return { ok: false, error: "This invoice has already been received." };
    }
    if (msg.includes("NOT_AUTHORIZED")) {
      return { ok: false, error: "You don't have permission to receive stock." };
    }
    if (/receive_purchase_order/i.test(msg) || error.code === "PGRST202") {
      return {
        ok: false,
        error: "Receiving RPC isn't installed yet — apply migration 016.",
      };
    }
    return { ok: false, error: msg };
  }
  const row = (data as { received_lines: number; total_units: number }[] | null)?.[0];
  return { ok: true, error: null, lines: row?.received_lines, units: row?.total_units };
}

export async function cancelPurchaseOrder(poId: string) {
  if (isDemoMode()) return { error: null };
  const supabase = createClient();
  return supabase
    .from("purchase_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", poId)
    .eq("status", "draft");
}
