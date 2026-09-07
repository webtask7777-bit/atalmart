/**
 * Demo-mode procurement fixtures.
 *
 * Live mode reads suppliers / purchase_orders from Supabase. Demo mode has no
 * such tables, so we hand back a seeded Flipkart Wholesale supplier and one
 * already-received sample invoice — enough for the Purchases page to show what
 * a real wholesale bill looks like (and where landed cost comes from). Creating
 * or receiving is disabled in demo (needs the live DB).
 *
 * Costs use the same demoLineCost() the Pricing/P&L pages use, so the sample
 * invoice's unit costs line up with the margins shown elsewhere.
 */

import { demoLineCost } from "@/lib/demo-costs";
import { purchaseTotals } from "@/lib/pnl";
import type { PurchaseOrder, Supplier } from "@/types";

export const DEMO_SUPPLIER: Supplier = {
  id: "demo-sup-flipkart",
  name: "Flipkart Wholesale",
  contact_name: null,
  phone: null,
  email: null,
  gstin: "29AABCF1234A1Z5",
  address: null,
  notes: "Primary wholesale procurement source",
  active: true,
  created_at: new Date("2026-07-01T09:00:00Z").toISOString(),
};

const SAMPLE_LINES = [
  { product_id: "p19", product_name: "Amul Taaza Milk", quantity: 60, price: 28, tax_rate: 0 },
  { product_id: "p31", product_name: "Aashirvaad Atta", quantity: 20, price: 240, tax_rate: 5 },
  { product_id: "p98", product_name: "Maggi 2-Minute Noodles", quantity: 48, price: 14, tax_rate: 12 },
].map((l) => ({
  ...l,
  unit_cost: demoLineCost(l.product_id, l.price),
}));

export function demoPurchaseOrders(): PurchaseOrder[] {
  const shipping = 120;
  const other = 0;
  const totals = purchaseTotals(
    SAMPLE_LINES.map((l) => ({
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      tax_rate: l.tax_rate,
    })),
    shipping,
    other,
  );
  return [
    {
      id: "demo-po-1",
      supplier_id: DEMO_SUPPLIER.id,
      invoice_number: "FKW-2026-0042",
      invoice_date: "2026-07-18",
      status: "received",
      shipping_total: shipping,
      other_charges: other,
      goods_subtotal: totals.goodsSubtotal,
      tax_total: totals.taxTotal,
      grand_total: totals.grandTotal,
      notes: "Sample received invoice (demo)",
      received_at: new Date("2026-07-18T11:30:00Z").toISOString(),
      created_by: null,
      created_at: new Date("2026-07-18T10:00:00Z").toISOString(),
      updated_at: new Date("2026-07-18T11:30:00Z").toISOString(),
      supplier: DEMO_SUPPLIER,
      items: SAMPLE_LINES.map((l, i) => ({
        id: `demo-po-1-item-${i}`,
        po_id: "demo-po-1",
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        tax_rate: l.tax_rate,
        line_total: Math.round(l.unit_cost * l.quantity * 100) / 100,
        created_at: new Date("2026-07-18T10:00:00Z").toISOString(),
      })),
    },
  ];
}
