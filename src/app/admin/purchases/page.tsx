"use client";

import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  PackageCheck,
  Truck,
  FileText,
  Search,
  X,
  RefreshCw,
  AlertTriangle,
  Upload,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useAllProducts } from "@/lib/hooks/use-products";
import {
  useSuppliers,
  usePurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
} from "@/lib/hooks/use-procurement";
import { purchaseTotals, landedUnitCosts, computeMargin } from "@/lib/pnl";
import { matchLine } from "@/lib/invoice-match";
import type { ParsedInvoice } from "@/app/api/admin/parse-invoice/route";
import { formatRupees } from "@/lib/money";
import { toast } from "sonner";
import type { DraftPurchaseLine, PurchaseOrder, Product } from "@/types";

const statusVariant: Record<string, "gray" | "green" | "red"> = {
  draft: "gray",
  received: "green",
  cancelled: "red",
};

interface EditableLine extends DraftPurchaseLine {
  key: string;
}

let lineSeq = 0;
const newLine = (): EditableLine => ({
  key: `l${++lineSeq}`,
  product_id: null,
  product_name: "",
  quantity: 1,
  unit_cost: 0,
  tax_rate: 0,
});

export default function PurchasesAdminPage() {
  const { products } = useAllProducts();
  const { suppliers } = useSuppliers();
  const { orders, loading, refetch } = usePurchaseOrders();

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  // ── Create-invoice form state ──
  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [shipping, setShipping] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([newLine()]);

  // ── Import-from-file (PDF / photo / Excel / CSV) ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    source: "ai" | "sheet" | "pdf";
    total: number;
    matched: number;
    review: number;
    grandTotal: number | null;
    skipped: string[];
  } | null>(null);

  /**
   * Upload the bill, let the server extract lines, match each description to
   * the catalogue, and open the "New invoice" form prefilled. The admin still
   * reviews every line before saving — nothing is written here.
   */
  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/parse-invoice", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        source?: "ai" | "sheet" | "pdf";
        invoice?: ParsedInvoice;
        skipped?: string[];
      };
      if (!res.ok || !data.ok || !data.invoice) {
        throw new Error(data.error || `Import failed (${res.status})`);
      }
      const inv = data.invoice;
      let matched = 0;
      const imported: EditableLine[] = inv.lines.map((l) => {
        const m = matchLine(l.description, products);
        if (m.product) matched += 1;
        return {
          key: `l${++lineSeq}`,
          product_id: m.product?.id ?? null,
          product_name: m.product?.name ?? l.description,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          tax_rate: l.tax_rate,
        };
      });
      // Prefer the parsed supplier when it's one we know; else Flipkart.
      const supplierMatch = inv.supplier_name
        ? suppliers.find((s) =>
            s.name.toLowerCase().includes(inv.supplier_name!.toLowerCase().split(" ")[0]),
          )
        : undefined;
      setSupplierId(supplierMatch?.id ?? flipkart?.id ?? suppliers[0]?.id ?? "");
      setInvoiceNumber(inv.invoice_number ?? "");
      setInvoiceDate(inv.invoice_date ?? "");
      setShipping(inv.shipping_total || 0);
      setOtherCharges(inv.other_charges || 0);
      setNotes(`Imported from ${file.name}${inv.grand_total ? ` · bill total ₹${inv.grand_total}` : ""}`);
      setLines(imported.length > 0 ? imported : [newLine()]);
      setImportSummary({
        source: data.source ?? "ai",
        total: imported.length,
        matched,
        review: imported.length - matched,
        grandTotal: inv.grand_total,
        skipped: data.skipped ?? [],
      });
      setModalOpen(true);
      toast.success(
        `${imported.length} lines read · ${matched} matched to catalogue`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const flipkart = suppliers.find(
    (s) => s.name.toLowerCase() === "flipkart wholesale",
  );

  const openCreate = () => {
    setImportSummary(null);
    setSupplierId(flipkart?.id ?? suppliers[0]?.id ?? "");
    setInvoiceNumber("");
    setInvoiceDate("");
    setShipping(0);
    setOtherCharges(0);
    setNotes("");
    setLines([newLine()]);
    setModalOpen(true);
  };

  const totals = useMemo(
    () => purchaseTotals(lines, shipping, otherCharges),
    [lines, shipping, otherCharges],
  );
  const landed = useMemo(
    () => landedUnitCosts(lines, shipping, otherCharges),
    [lines, shipping, otherCharges],
  );

  const updateLine = (key: string, patch: Partial<EditableLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const handleSave = async () => {
    const filled = lines.filter((l) => l.product_name.trim() && l.quantity > 0);
    if (filled.length === 0) {
      return toast.error("Add at least one line with a product and quantity");
    }
    if (!supplierId) return toast.error("Pick a supplier");
    setSaving(true);
    const { error } = await createPurchaseOrder({
      supplier_id: supplierId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate || null,
      shipping_total: shipping,
      other_charges: otherCharges,
      notes,
      lines: filled.map((l) => ({
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        tax_rate: l.tax_rate,
      })),
    });
    setSaving(false);
    if (error) return toast.error(error);
    toast.success("Invoice saved as draft");
    setModalOpen(false);
    refetch();
  };

  const handleReceive = async (po: PurchaseOrder) => {
    const ok = await confirmDialog({
      title: `Receive invoice ${po.invoice_number || "(draft)"}?`,
      message:
        "This adds the stock to inventory and updates each product's cost price to the landed cost. It can't be undone.",
      confirmLabel: "Receive stock",
    });
    if (!ok) return;
    setReceivingId(po.id);
    const res = await receivePurchaseOrder(po.id);
    setReceivingId(null);
    if (!res.ok) return toast.error(res.error || "Failed to receive");
    toast.success(`Received ${res.units ?? 0} units across ${res.lines ?? 0} lines`);
    refetch();
  };

  const handleCancel = async (po: PurchaseOrder) => {
    const ok = await confirmDialog({
      title: "Cancel this draft invoice?",
      message: "It will be marked cancelled. No stock is affected.",
      confirmLabel: "Cancel invoice",
    });
    if (!ok) return;
    await cancelPurchaseOrder(po.id);
    toast.success("Invoice cancelled");
    refetch();
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-brown flex items-center gap-2">
            <Truck size={24} className="text-saffron" /> Purchases
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Record wholesale invoices (Flipkart Wholesale) → receive to stock →
            landed cost flows into pricing &amp; P&amp;L.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw size={16} />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xlsm,.csv,application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            loading={importing}
            title="Upload the Flipkart Wholesale bill (PDF, photo, Excel or CSV) — lines are read and matched automatically"
          >
            <Upload size={16} /> Import bill
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus size={16} /> New invoice
          </Button>
        </div>
      </div>

      {suppliers.length === 0 && (
        <div className="my-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            No suppliers found. Apply migration 016 (it seeds Flipkart Wholesale)
            or run this on the live database — procurement is a live-DB feature.
          </span>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Loading invoices…</p>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <FileText size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No invoices yet. Add your first wholesale bill.</p>
          </div>
        ) : (
          orders.map((po) => (
            <div
              key={po.id}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-brown">
                      {po.invoice_number || "(no invoice #)"}
                    </span>
                    <Badge variant={statusVariant[po.status] ?? "gray"}>
                      {po.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {po.supplier?.name || "Unknown supplier"}
                    {po.invoice_date ? ` · ${po.invoice_date}` : ""} ·{" "}
                    {po.items?.length ?? 0} lines
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-brown">
                    {formatRupees(po.grand_total)}
                  </div>
                  <div className="text-xs text-gray-400">
                    goods {formatRupees(po.goods_subtotal)} + tax{" "}
                    {formatRupees(po.tax_total)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {po.status === "draft" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleReceive(po)}
                        loading={receivingId === po.id}
                      >
                        <PackageCheck size={16} /> Receive
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancel(po)}
                      >
                        <X size={16} />
                      </Button>
                    </>
                  )}
                  {po.status === "received" && po.received_at && (
                    <span className="text-xs text-indian-green self-center">
                      ✓ received
                    </span>
                  )}
                </div>
              </div>

              {po.items && po.items.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400">
                        <th className="py-1 pr-3 font-medium">Product</th>
                        <th className="py-1 px-3 font-medium text-right">Qty</th>
                        <th className="py-1 px-3 font-medium text-right">Unit cost</th>
                        <th className="py-1 px-3 font-medium text-right">GST%</th>
                        <th className="py-1 pl-3 font-medium text-right">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.items.map((it) => (
                        <tr key={it.id} className="border-t border-gray-50">
                          <td className="py-1 pr-3 text-brown">{it.product_name}</td>
                          <td className="py-1 px-3 text-right">{it.quantity}</td>
                          <td className="py-1 px-3 text-right">{formatRupees(it.unit_cost)}</td>
                          <td className="py-1 px-3 text-right text-gray-400">{it.tax_rate}%</td>
                          <td className="py-1 pl-3 text-right">{formatRupees(it.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New wholesale invoice"
        className="max-w-3xl"
      >
        <div className="space-y-4">
          {importSummary && (
            <div className="flex items-start gap-2 rounded-xl border border-saffron/30 bg-saffron-light/60 p-3 text-sm text-brown">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-saffron" />
              <div>
                <strong>{importSummary.total} lines</strong> read from the bill
                {importSummary.source === "ai"
                  ? " (AI)"
                  : importSummary.source === "pdf"
                    ? " (PDF text)"
                    : " (spreadsheet)"}{" "}
                ·{" "}
                <strong>{importSummary.matched}</strong> matched to catalogue products
                {importSummary.review > 0 && (
                  <>
                    {" "}· <strong className="text-red-700">{importSummary.review} need a manual pick</strong>{" "}
                    (search box still shows the bill text)
                  </>
                )}
                . Check qty, cost and GST% against the paper bill before saving
                {importSummary.grandTotal != null && (
                  <> — bill total {formatRupees(importSummary.grandTotal)}, form total {formatRupees(totals.grandTotal)}</>
                )}
                .
                {importSummary.skipped.length > 0 && (
                  <details className="mt-1 text-xs text-gray-600">
                    <summary className="cursor-pointer">
                      {importSummary.skipped.length} row{importSummary.skipped.length > 1 ? "s" : ""} couldn&apos;t be read — add manually
                    </summary>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      {importSummary.skipped.slice(0, 8).map((t, i) => (
                        <li key={i} className="font-mono">{t}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Supplier
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-saffron outline-none"
              >
                {suppliers.length === 0 && <option value="">No suppliers</option>}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Invoice #"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="FKW-2024-001"
            />
            <Input
              label="Invoice date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
            <Input
              label="Freight / shipping (₹)"
              type="number"
              value={shipping || ""}
              onChange={(e) => setShipping(Number(e.target.value) || 0)}
              placeholder="0"
            />
            <Input
              label="Other charges (₹)"
              type="number"
              value={otherCharges || ""}
              onChange={(e) => setOtherCharges(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">
                Line items
              </label>
              <button
                onClick={() => setLines((ls) => [...ls, newLine()])}
                className="text-xs text-saffron font-semibold flex items-center gap-1"
              >
                <Plus size={14} /> Add line
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((l, i) => (
                <LineRow
                  key={l.key}
                  line={l}
                  products={products}
                  landedCost={landed[i]}
                  onChange={(patch) => updateLine(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                  canRemove={lines.length > 1}
                />
              ))}
            </div>
          </div>

          <Input
            as="textarea"
            rows={2}
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — e.g. PO reference, delivery date"
          />

          <div className="rounded-xl bg-saffron-light/50 p-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Goods subtotal</span>
              <span>{formatRupees(totals.goodsSubtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST</span>
              <span>{formatRupees(totals.taxTotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Freight + other</span>
              <span>{formatRupees(shipping + otherCharges)}</span>
            </div>
            <div className="flex justify-between font-bold text-brown mt-1 pt-1 border-t border-saffron/30">
              <span>Grand total</span>
              <span>{formatRupees(totals.grandTotal)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save draft
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── One editable invoice line with a product picker + landed-cost hint ──
function LineRow({
  line,
  products,
  landedCost,
  onChange,
  onRemove,
  canRemove,
}: {
  line: EditableLine;
  products: Product[];
  landedCost: number;
  onChange: (patch: Partial<EditableLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  // Seed with the free-text name (an imported, unmatched bill line) so the
  // admin sees what the bill said and can search from it.
  const [query, setQuery] = useState(line.product_id ? "" : line.product_name);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, products]);

  const matched = products.find((p) => p.id === line.product_id);
  // Preview the margin this landed cost would leave at the product's price.
  const margin =
    matched && landedCost > 0
      ? computeMargin(matched.price, landedCost, matched.mrp)
      : null;

  return (
    <div className="rounded-xl border border-gray-100 p-2.5">
      <div className="grid grid-cols-12 gap-2 items-start">
        <div className="col-span-12 sm:col-span-5 relative">
          {line.product_id ? (
            <div className="flex items-center justify-between rounded-lg bg-green-light px-2.5 py-2 text-sm">
              <span className="text-brown truncate">{line.product_name}</span>
              <button
                onClick={() =>
                  onChange({ product_id: null, product_name: "" })
                }
                className="text-gray-400 hover:text-red-500"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 rounded-lg border-2 border-gray-200 px-2 focus-within:border-saffron">
                <Search size={14} className="text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                    onChange({ product_name: e.target.value });
                  }}
                  onFocus={() => setOpen(true)}
                  placeholder="Search product…"
                  className="w-full py-2 text-sm outline-none bg-transparent"
                />
              </div>
              {open && matches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-100 bg-white shadow-lg max-h-52 overflow-y-auto">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onChange({
                          product_id: p.id,
                          product_name: p.name,
                          unit_cost: line.unit_cost || p.cost_price || 0,
                        });
                        setQuery("");
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-saffron-light"
                    >
                      <span className="truncate text-brown">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2 shrink-0">
                        sell {formatRupees(p.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <input
          type="number"
          value={line.quantity || ""}
          onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
          placeholder="Qty"
          className="col-span-4 sm:col-span-2 rounded-lg border-2 border-gray-200 px-2 py-2 text-sm text-right focus:border-saffron outline-none"
        />
        <input
          type="number"
          value={line.unit_cost || ""}
          onChange={(e) => onChange({ unit_cost: Number(e.target.value) || 0 })}
          placeholder="Cost"
          className="col-span-4 sm:col-span-2 rounded-lg border-2 border-gray-200 px-2 py-2 text-sm text-right focus:border-saffron outline-none"
        />
        <input
          type="number"
          value={line.tax_rate || ""}
          onChange={(e) => onChange({ tax_rate: Number(e.target.value) || 0 })}
          placeholder="GST%"
          className="col-span-3 sm:col-span-2 rounded-lg border-2 border-gray-200 px-2 py-2 text-sm text-right focus:border-saffron outline-none"
        />
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="col-span-1 sm:col-span-1 flex items-center justify-center py-2 text-gray-300 hover:text-red-500 disabled:opacity-30"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {landedCost > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-1 text-xs text-gray-500">
          <span>
            Landed cost / unit:{" "}
            <span className="font-semibold text-brown">
              {formatRupees(landedCost)}
            </span>
          </span>
          {margin && (
            <span
              className={margin.lossMaking ? "text-red-600 font-semibold" : "text-indian-green"}
            >
              {margin.lossMaking
                ? `⚠ sells below cost (${formatRupees(margin.marginRupees)})`
                : `margin ${formatRupees(margin.marginRupees)} (${margin.marginPct}%)`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
