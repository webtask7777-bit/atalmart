"use client";

import { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Download,
  RefreshCw,
  AlertTriangle,
  IndianRupee,
  TrendingUp,
  Truck,
  Percent,
  Boxes,
  ShoppingBasket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePnl, type PnlRange } from "@/lib/hooks/use-pnl";
import { usePurchaseOrders } from "@/lib/hooks/use-procurement";
import { useAllProducts } from "@/lib/hooks/use-products";
import {
  salesRegister,
  purchaseRegister,
  gstInputSummary,
  stockValuation,
  reorderSuggestions,
  windowDaysFromOrders,
  sinceIsoForDays,
  type ReorderRow,
} from "@/lib/reports";
import { exportReports, type ReportBundle, type ReportSheet } from "@/lib/report-export";
import { formatRupees } from "@/lib/money";
import { toast } from "sonner";

const RANGES: { value: PnlRange; label: string; days: number }[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "all", label: "All time", days: 365 },
];

const URGENCY: Record<ReorderRow["urgency"], { label: string; variant: "red" | "saffron" | "gray" | "green" }> = {
  out: { label: "Out of stock", variant: "red" },
  critical: { label: "Critical", variant: "saffron" },
  soon: { label: "Order soon", variant: "gray" },
  ok: { label: "OK", variant: "green" },
};

export default function ReportsAdminPage() {
  const [range, setRange] = useState<PnlRange>("30d");
  const [exporting, setExporting] = useState<string | null>(null);
  const { orders, summary, byProduct, loading: ordersLoading, refetch } = usePnl(range);
  const { orders: pos, loading: posLoading, refetch: refetchPos } = usePurchaseOrders();
  const { products, loading: productsLoading } = useAllProducts();

  const rangeDef = RANGES.find((r) => r.value === range) ?? RANGES[1];
  const windowDays = useMemo(
    () => (range === "all" ? windowDaysFromOrders(orders, 365) : rangeDef.days),
    [range, orders, rangeDef.days],
  );
  const sinceIso = useMemo(
    () => (range === "all" ? "" : sinceIsoForDays(rangeDef.days)),
    [range, rangeDef.days],
  );

  // Purchase orders inside the window (by invoice date, falling back to created).
  const posInRange = useMemo(
    () =>
      pos.filter((po) => {
        if (!sinceIso) return true;
        const d = po.invoice_date || po.created_at.slice(0, 10);
        return d >= sinceIso;
      }),
    [pos, sinceIso],
  );

  const sales = useMemo(() => salesRegister(orders), [orders]);
  const purchases = useMemo(() => purchaseRegister(posInRange), [posInRange]);
  const gst = useMemo(() => gstInputSummary(posInRange), [posInRange]);
  const stock = useMemo(() => stockValuation(products), [products]);
  const reorder = useMemo(
    () => reorderSuggestions(orders, products, { windowDays }),
    [orders, products, windowDays],
  );

  const stockValue = stock.reduce((t, r) => t + r.value, 0);
  const stockMissingCost = stock.filter((r) => r.costMissing).length;
  const purchaseTotal = purchases.reduce((t, r) => t + r.grandTotal, 0);
  const inputGst = gst.reduce((t, r) => t + r.tax, 0);
  const needReorder = reorder.filter((r) => r.suggestedQty > 0);
  const reorderCost = needReorder.reduce((t, r) => t + r.estCost, 0);

  const loading = ordersLoading || posLoading || productsLoading;

  const bundle = (): ReportBundle => ({
    rangeLabel: rangeDef.label,
    windowDays,
    summary,
    sales,
    purchases,
    gst,
    products: byProduct,
    stock,
    reorder,
  });

  const doExport = async (sheets: ReportSheet[] | "all", label: string) => {
    setExporting(label);
    try {
      await exportReports(bundle(), sheets);
      toast.success(`${label} exported`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const exportBtn = (sheets: ReportSheet[], label: string) => (
    <ExportButton
      onClick={() => doExport(sheets, label)}
      loading={exporting === label}
      disabled={loading}
    />
  );

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-brown flex items-center gap-2">
            <FileSpreadsheet size={24} className="text-saffron" /> Reports
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Sales, purchases, GST input credit, stock value and what to order next
            from Flipkart Wholesale — every table exports to Excel.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              refetchPos();
            }}
          >
            <RefreshCw size={16} />
          </Button>
          <Button
            size="sm"
            onClick={() => doExport("all", "All reports")}
            loading={exporting === "All reports"}
            disabled={loading}
          >
            <Download size={16} /> Export all
          </Button>
        </div>
      </div>

      {/* Range switch */}
      <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden text-sm w-fit my-4">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-4 py-2 ${
              range === r.value ? "bg-saffron text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Tile icon={<IndianRupee size={16} />} label="Revenue (goods)" value={formatRupees(summary.itemsRevenue)} sub={`${summary.orders} orders`} />
        <Tile icon={<TrendingUp size={16} />} label="Gross profit" value={formatRupees(summary.grossProfit)} sub={`${summary.grossMarginPct}% margin`} tone="green" />
        <Tile icon={<Truck size={16} />} label="Purchases" value={formatRupees(purchaseTotal)} sub={`${purchases.length} invoices`} />
        <Tile icon={<Percent size={16} />} label="Input GST (ITC)" value={formatRupees(inputGst)} sub="on received stock" />
        <Tile icon={<Boxes size={16} />} label="Stock at cost" value={formatRupees(stockValue)} sub={stockMissingCost ? `${stockMissingCost} SKUs no cost` : `${stock.length} SKUs`} tone={stockMissingCost ? "amber" : undefined} />
        <Tile icon={<ShoppingBasket size={16} />} label="To reorder" value={String(needReorder.length)} sub={`≈ ${formatRupees(reorderCost)}`} tone={needReorder.some((r) => r.urgency === "out") ? "red" : undefined} />
      </div>

      {loading && (
        <p className="text-sm text-gray-400 py-4">Loading data…</p>
      )}

      {/* Reorder list */}
      <Section
        title="Reorder list — next Flipkart Wholesale order"
        subtitle={`Sales velocity over the last ${windowDays} days vs stock on hand. Order qty tops each SKU up to 14 days of cover.`}
        action={exportBtn(["reorder"], "Reorder list")}
      >
        {needReorder.length === 0 ? (
          <Empty text="Sab stock 14 din ke liye kaafi hai — kuch order karne ki zaroorat nahi." />
        ) : (
          <Table
            head={["", "Product", "Stock", `Sold ${windowDays}d`, "Days cover", "Order qty", "Est. cost"]}
            rows={needReorder.slice(0, 20).map((r) => [
              <Badge key="u" variant={URGENCY[r.urgency].variant}>{URGENCY[r.urgency].label}</Badge>,
              <span key="n" className="text-brown">{r.name} <span className="text-gray-400">· {r.unit}</span></span>,
              <R key="s">{r.stock}</R>,
              <R key="so">{r.unitsSold}</R>,
              <R key="c">{Number.isFinite(r.daysOfCover) ? r.daysOfCover : "∞"}</R>,
              <R key="q"><strong>{r.suggestedQty}</strong></R>,
              <R key="e">{r.estCost > 0 ? formatRupees(r.estCost) : <span className="text-gray-400">no cost</span>}</R>,
            ])}
            more={needReorder.length > 20 ? `${needReorder.length - 20} more in the Excel` : undefined}
          />
        )}
      </Section>

      {/* GST + purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <Section
            title="GST input credit"
            subtitle="Received invoices only, grouped by rate."
            action={exportBtn(["gst"], "GST summary")}
          >
            {gst.length === 0 ? (
              <Empty text="No received invoices in this period." />
            ) : (
              <Table
                head={["Rate", "Taxable", "GST"]}
                rows={gst.map((g) => [
                  <span key="r">{g.rate}%</span>,
                  <R key="t">{formatRupees(g.taxable)}</R>,
                  <R key="x">{formatRupees(g.tax)}</R>,
                ])}
              />
            )}
          </Section>
        </div>
        <div className="lg:col-span-3">
          <Section
            title="Purchase register"
            subtitle="Every wholesale invoice in the period."
            action={exportBtn(["purchases"], "Purchase register")}
          >
            {purchases.length === 0 ? (
              <Empty text="No invoices recorded in this period. Add them under Purchases." />
            ) : (
              <Table
                head={["Date", "Invoice", "Status", "Taxable", "GST", "Total"]}
                rows={purchases.slice(0, 10).map((p) => [
                  <span key="d">{p.invoiceDate}</span>,
                  <span key="i" className="text-brown">{p.invoiceNumber || "(no #)"} <span className="text-gray-400">· {p.lines} lines</span></span>,
                  <Badge key="s" variant={p.status === "received" ? "green" : "gray"}>{p.status}</Badge>,
                  <R key="g">{formatRupees(p.goods)}</R>,
                  <R key="t">{formatRupees(p.tax)}</R>,
                  <R key="x"><strong>{formatRupees(p.grandTotal)}</strong></R>,
                ])}
                more={purchases.length > 10 ? `${purchases.length - 10} more in the Excel` : undefined}
              />
            )}
          </Section>
        </div>
      </div>

      {/* Stock valuation + product performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section
          title="Stock valuation"
          subtitle="Stock on hand × landed cost, biggest first."
          action={exportBtn(["stock"], "Stock valuation")}
        >
          {stockMissingCost > 0 && (
            <p className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {stockMissingCost} SKUs have stock but no cost — receive their invoice in Purchases or enter cost in Pricing.
            </p>
          )}
          <Table
            head={["Product", "Stock", "Cost", "Value"]}
            rows={stock.slice(0, 10).map((r) => [
              <span key="n" className="text-brown">{r.name}</span>,
              <R key="s">{r.stock}</R>,
              <R key="c">{r.cost > 0 ? formatRupees(r.cost) : <span className="text-amber-600">—</span>}</R>,
              <R key="v">{formatRupees(r.value)}</R>,
            ])}
            more={stock.length > 10 ? `${stock.length - 10} more in the Excel` : undefined}
          />
        </Section>
        <Section
          title="Product performance"
          subtitle="By gross profit in the period."
          action={exportBtn(["products"], "Product performance")}
        >
          {byProduct.length === 0 ? (
            <Empty text="No sales in this period." />
          ) : (
            <Table
              head={["Product", "Units", "Revenue", "Profit", "Margin"]}
              rows={byProduct.slice(0, 10).map((r) => [
                <span key="n" className="text-brown">{r.productName}</span>,
                <R key="u">{r.unitsSold}</R>,
                <R key="r">{formatRupees(r.revenue)}</R>,
                <R key="p" className={r.grossProfit < 0 ? "text-red-600" : ""}>{formatRupees(r.grossProfit)}</R>,
                <R key="m">{r.grossMarginPct}%</R>,
              ])}
              more={byProduct.length > 10 ? `${byProduct.length - 10} more in the Excel` : undefined}
            />
          )}
        </Section>
      </div>

      {/* Sales register */}
      <Section
        title="Sales register"
        subtitle="Order-level revenue, discounts, delivery fee and cost of goods."
        action={exportBtn(["sales"], "Sales register")}
      >
        {sales.length === 0 ? (
          <Empty text="No orders in this period." />
        ) : (
          <Table
            head={["Date", "Order", "Status", "Pay", "Goods", "Disc.", "Total", "Profit"]}
            rows={sales.slice(0, 10).map((s) => [
              <span key="d">{new Date(s.placedAt).toLocaleDateString("en-IN")}</span>,
              <span key="o" className="font-mono text-xs">{s.orderId.slice(0, 8)}</span>,
              <Badge key="s" variant={s.status === "delivered" ? "green" : s.status === "cancelled" ? "red" : "gray"}>{s.status}</Badge>,
              <span key="p" className="uppercase text-xs">{s.paymentMethod}</span>,
              <R key="g">{formatRupees(s.goods)}</R>,
              <R key="dc">{s.discount ? `− ${formatRupees(s.discount)}` : ""}</R>,
              <R key="t"><strong>{formatRupees(s.total)}</strong></R>,
              <R key="gp" className={s.grossProfit < 0 ? "text-red-600" : "text-indian-green"}>{formatRupees(s.grossProfit)}</R>,
            ])}
            more={sales.length > 10 ? `${sales.length - 10} more in the Excel` : undefined}
          />
        )}
      </Section>
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────

function ExportButton({
  onClick,
  loading,
  disabled,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} loading={loading} disabled={disabled}>
      <Download size={14} /> Excel
    </Button>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "amber" | "red";
}) {
  const ring =
    tone === "green"
      ? "border-green-200 bg-green-light/50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "red"
          ? "border-red-200 bg-red-50"
          : "border-gray-100 bg-white";
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${ring}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <span className="text-saffron">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-brown leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm mb-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="font-bold text-brown">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Table({
  head,
  rows,
  more,
}: {
  head: string[];
  rows: React.ReactNode[][];
  more?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            {head.map((h, i) => (
              <th key={i} className={`py-1.5 pr-3 font-medium ${i >= 2 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-50">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-3 align-middle">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {more && <p className="text-xs text-gray-400 mt-2">+ {more}</p>}
    </div>
  );
}

function R({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-right tabular-nums ${className}`}>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 py-4 text-center">{text}</p>;
}
