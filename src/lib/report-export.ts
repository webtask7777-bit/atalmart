"use client";

import type ExcelJS from "exceljs";
import {
  loadExcelJS,
  download,
  styleHeader,
  styleBody,
  todayStamp,
} from "@/lib/excel-export";
import type {
  GstRateSummary,
  PurchaseRow,
  ReorderRow,
  SalesRow,
  StockRow,
} from "@/lib/reports";
import type { PnlSummary, ProductPnlRow } from "@/lib/pnl";

export type ReportSheet =
  | "summary"
  | "sales"
  | "purchases"
  | "gst"
  | "products"
  | "stock"
  | "reorder";

export interface ReportBundle {
  rangeLabel: string;
  windowDays: number;
  summary: PnlSummary;
  sales: SalesRow[];
  purchases: PurchaseRow[];
  gst: GstRateSummary[];
  products: ProductPnlRow[];
  stock: StockRow[];
  reorder: ReorderRow[];
}

const RUPEE = '"₹"#,##0.00';

function money(sheet: ExcelJS.Worksheet, cols: string[]) {
  for (const c of cols) {
    sheet.getColumn(c).numFmt = RUPEE;
    sheet.getColumn(c).alignment = { horizontal: "right" };
  }
}

function totalsRow(sheet: ExcelJS.Worksheet, label: string, sumCols: string[], firstCol = "A") {
  const last = sheet.rowCount;
  if (last < 2) return;
  const row = sheet.addRow([]);
  row.getCell(firstCol).value = label;
  for (const c of sumCols) {
    row.getCell(c).value = { formula: `SUM(${c}2:${c}${last})` } as ExcelJS.CellFormulaValue;
  }
  row.font = { name: "Arial", bold: true, size: 10 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
}

function addSummary(wb: ExcelJS.Workbook, b: ReportBundle) {
  const s = wb.addWorksheet("Summary");
  s.columns = [
    { header: "Metric", key: "k", width: 34 },
    { header: "Value", key: "v", width: 20 },
  ];
  const stockValue = b.stock.reduce((t, r) => t + r.value, 0);
  const purchaseTotal = b.purchases.reduce((t, r) => t + r.grandTotal, 0);
  const inputGst = b.gst.reduce((t, r) => t + r.tax, 0);
  const rows: [string, number | string][] = [
    ["Period", b.rangeLabel],
    ["Orders (realised)", b.summary.orders],
    ["Goods revenue (₹)", b.summary.itemsRevenue],
    ["Cost of goods (₹)", b.summary.cogs],
    ["Gross profit (₹)", b.summary.grossProfit],
    ["Gross margin %", b.summary.grossMarginPct],
    ["Coupon discounts (₹)", b.summary.discounts],
    ["Delivery fees collected (₹)", b.summary.deliveryFees],
    ["Net profit (₹)", b.summary.netProfit],
    ["Avg order value (₹)", b.summary.avgOrderValue],
    ["Orders with missing cost", b.summary.ordersWithMissingCost],
    ["Purchases booked (₹)", Math.round(purchaseTotal * 100) / 100],
    ["Input GST on received stock (₹)", Math.round(inputGst * 100) / 100],
    ["Stock on hand at cost (₹)", Math.round(stockValue * 100) / 100],
    ["Products needing reorder", b.reorder.filter((r) => r.suggestedQty > 0).length],
    ["Generated", new Date().toLocaleString("en-IN")],
  ];
  rows.forEach(([k, v]) => s.addRow({ k, v }));
  styleHeader(s);
  styleBody(s);
  s.getColumn("B").alignment = { horizontal: "right" };
}

function addSales(wb: ExcelJS.Workbook, rows: SalesRow[]) {
  const s = wb.addWorksheet("Sales Register");
  s.columns = [
    { header: "Date", key: "date" },
    { header: "Order ID", key: "id" },
    { header: "Status", key: "status" },
    { header: "Payment", key: "pay" },
    { header: "Coupon", key: "coupon" },
    { header: "Units", key: "items" },
    { header: "Goods (₹)", key: "goods" },
    { header: "Discount (₹)", key: "discount" },
    { header: "Delivery (₹)", key: "delivery" },
    { header: "Total (₹)", key: "total" },
    { header: "COGS (₹)", key: "cogs" },
    { header: "Gross profit (₹)", key: "gp" },
  ];
  for (const r of rows) {
    s.addRow({
      date: new Date(r.placedAt).toLocaleString("en-IN"),
      id: r.orderId,
      status: r.status,
      pay: r.paymentMethod,
      coupon: r.couponCode,
      items: r.items,
      goods: r.goods,
      discount: r.discount,
      delivery: r.deliveryFee,
      total: r.total,
      cogs: r.cogs,
      gp: r.grossProfit,
    });
  }
  totalsRow(s, `TOTAL (${rows.length} orders)`, ["F", "G", "H", "I", "J", "K", "L"]);
  money(s, ["G", "H", "I", "J", "K", "L"]);
  s.getColumn("F").alignment = { horizontal: "right" };
  styleHeader(s, [20, 38, 16, 10, 12, 8, 12, 12, 12, 12, 12, 14]);
  styleBody(s);
}

function addPurchases(wb: ExcelJS.Workbook, rows: PurchaseRow[]) {
  const s = wb.addWorksheet("Purchase Register");
  const rates = [...new Set(rows.flatMap((r) => Object.keys(r.taxByRate)))]
    .map(Number)
    .sort((a, b) => a - b);
  s.columns = [
    { header: "Invoice date", key: "date" },
    { header: "Invoice #", key: "inv" },
    { header: "Supplier", key: "sup" },
    { header: "Status", key: "status" },
    { header: "Lines", key: "lines" },
    { header: "Units", key: "units" },
    { header: "Taxable (₹)", key: "goods" },
    ...rates.map((r) => ({ header: `GST ${r}% (₹)`, key: `t${r}` })),
    { header: "Total GST (₹)", key: "tax" },
    { header: "Freight (₹)", key: "freight" },
    { header: "Other (₹)", key: "other" },
    { header: "Grand total (₹)", key: "grand" },
  ];
  for (const r of rows) {
    const row: Record<string, unknown> = {
      date: r.invoiceDate,
      inv: r.invoiceNumber,
      sup: r.supplier,
      status: r.status,
      lines: r.lines,
      units: r.units,
      goods: r.goods,
      tax: r.tax,
      freight: r.freight,
      other: r.other,
      grand: r.grandTotal,
    };
    for (const rate of rates) row[`t${rate}`] = r.taxByRate[String(rate)] ?? 0;
    s.addRow(row);
  }
  const moneyCols: string[] = [];
  s.columns.forEach((c, i) => {
    const key = String(c.key ?? "");
    if (["goods", "tax", "freight", "other", "grand"].includes(key) || key.startsWith("t")) {
      moneyCols.push(s.getColumn(i + 1).letter);
    }
  });
  totalsRow(s, `TOTAL (${rows.length} invoices)`, moneyCols);
  money(s, moneyCols);
  styleHeader(s, [14, 18, 20, 10, 8, 8, 14, ...rates.map(() => 12), 14, 12, 12, 14]);
  styleBody(s);
}

function addGst(wb: ExcelJS.Workbook, rows: GstRateSummary[]) {
  const s = wb.addWorksheet("GST Input Credit");
  s.columns = [
    { header: "GST rate %", key: "rate" },
    { header: "Taxable value (₹)", key: "taxable" },
    { header: "CGST (₹)", key: "cgst" },
    { header: "SGST (₹)", key: "sgst" },
    { header: "Total GST (₹)", key: "tax" },
  ];
  for (const r of rows) {
    s.addRow({
      rate: r.rate,
      taxable: r.taxable,
      cgst: Math.round((r.tax / 2) * 100) / 100,
      sgst: Math.round((r.tax / 2) * 100) / 100,
      tax: r.tax,
    });
  }
  totalsRow(s, "TOTAL", ["B", "C", "D", "E"]);
  money(s, ["B", "C", "D", "E"]);
  styleHeader(s, [12, 18, 14, 14, 14]);
  styleBody(s);
  const note = s.addRow([]);
  note.getCell("A").value =
    "Only RECEIVED invoices are counted. CGST/SGST shown as an equal split of the line GST (intra-state purchase); use IGST column on the bill for inter-state.";
  note.getCell("A").font = { name: "Arial", italic: true, size: 9, color: { argb: "FF6B7280" } };
}

function addProducts(wb: ExcelJS.Workbook, rows: ProductPnlRow[], stock: StockRow[]) {
  const s = wb.addWorksheet("Product Performance");
  const stockById = new Map(stock.map((r) => [r.productId, r]));
  s.columns = [
    { header: "Product", key: "name" },
    { header: "Units sold", key: "units" },
    { header: "Revenue (₹)", key: "rev" },
    { header: "COGS (₹)", key: "cogs" },
    { header: "Gross profit (₹)", key: "gp" },
    { header: "Margin %", key: "margin" },
    { header: "Stock now", key: "stock" },
  ];
  for (const r of rows) {
    s.addRow({
      name: r.productName,
      units: r.unitsSold,
      rev: r.revenue,
      cogs: r.cogs,
      gp: r.grossProfit,
      margin: r.grossMarginPct,
      stock: stockById.get(r.productId)?.stock ?? "",
    });
  }
  totalsRow(s, `TOTAL (${rows.length} products)`, ["B", "C", "D", "E"]);
  money(s, ["C", "D", "E"]);
  s.getColumn("F").numFmt = '0.0"%"';
  ["B", "F", "G"].forEach((c) => (s.getColumn(c).alignment = { horizontal: "right" }));
  styleHeader(s, [40, 10, 14, 14, 14, 10, 10]);
  styleBody(s);
}

function addStock(wb: ExcelJS.Workbook, rows: StockRow[]) {
  const s = wb.addWorksheet("Stock Valuation");
  s.columns = [
    { header: "Product", key: "name" },
    { header: "Category", key: "cat" },
    { header: "Unit", key: "unit" },
    { header: "Stock", key: "stock" },
    { header: "Cost / unit (₹)", key: "cost" },
    { header: "Value at cost (₹)", key: "value" },
    { header: "Price (₹)", key: "price" },
    { header: "Value at price (₹)", key: "retail" },
    { header: "Cost missing?", key: "missing" },
  ];
  for (const r of rows) {
    s.addRow({
      name: r.name,
      cat: r.category,
      unit: r.unit,
      stock: r.stock,
      cost: r.cost,
      value: r.value,
      price: r.price,
      retail: r.retailValue,
      missing: r.costMissing ? "YES" : "",
    });
  }
  totalsRow(s, `TOTAL (${rows.length} SKUs)`, ["D", "F", "H"]);
  money(s, ["E", "F", "G", "H"]);
  s.getColumn("D").alignment = { horizontal: "right" };
  styleHeader(s, [40, 22, 10, 8, 14, 16, 12, 16, 12]);
  styleBody(s);
}

function addReorder(wb: ExcelJS.Workbook, rows: ReorderRow[], windowDays: number) {
  const s = wb.addWorksheet("Reorder List");
  s.columns = [
    { header: "Urgency", key: "urg" },
    { header: "Product", key: "name" },
    { header: "Category", key: "cat" },
    { header: "Unit", key: "unit" },
    { header: "Stock now", key: "stock" },
    { header: `Sold (${windowDays}d)`, key: "sold" },
    { header: "Units / day", key: "vel" },
    { header: "Days of cover", key: "cover" },
    { header: "Order qty", key: "qty" },
    { header: "Last cost (₹)", key: "cost" },
    { header: "Est. cost (₹)", key: "est" },
  ];
  for (const r of rows) {
    s.addRow({
      urg: r.urgency.toUpperCase(),
      name: r.name,
      cat: r.category,
      unit: r.unit,
      stock: r.stock,
      sold: r.unitsSold,
      vel: r.velocity,
      cover: Number.isFinite(r.daysOfCover) ? r.daysOfCover : "∞",
      qty: r.suggestedQty,
      cost: r.lastCost,
      est: r.estCost,
    });
  }
  totalsRow(s, `TOTAL (${rows.length} SKUs)`, ["I", "K"]);
  money(s, ["J", "K"]);
  ["E", "F", "G", "H", "I"].forEach((c) => (s.getColumn(c).alignment = { horizontal: "right" }));
  styleHeader(s, [10, 40, 22, 10, 10, 10, 10, 12, 10, 12, 14]);
  styleBody(s);
  // Colour the urgency cell so the list scans fast when printed.
  for (let i = 2; i <= rows.length + 1; i++) {
    const cell = s.getRow(i).getCell("A");
    const v = String(cell.value);
    const argb = v === "OUT" ? "FFFEE2E2" : v === "CRITICAL" ? "FFFFEDD5" : v === "SOON" ? "FFFEF9C3" : "FFECFDF5";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    cell.font = { name: "Arial", bold: true, size: 10 };
  }
}

/**
 * Build one workbook with the chosen sheets (or all) and download it.
 */
export async function exportReports(bundle: ReportBundle, sheets: ReportSheet[] | "all" = "all") {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Atalmart";
  wb.created = new Date();
  const want = new Set<ReportSheet>(
    sheets === "all" ? ["summary", "sales", "purchases", "gst", "products", "stock", "reorder"] : sheets,
  );
  if (want.has("summary")) addSummary(wb, bundle);
  if (want.has("sales")) addSales(wb, bundle.sales);
  if (want.has("purchases")) addPurchases(wb, bundle.purchases);
  if (want.has("gst")) addGst(wb, bundle.gst);
  if (want.has("products")) addProducts(wb, bundle.products, bundle.stock);
  if (want.has("stock")) addStock(wb, bundle.stock);
  if (want.has("reorder")) addReorder(wb, bundle.reorder, bundle.windowDays);

  const name =
    sheets === "all" ? "reports" : sheets.length === 1 ? sheets[0] : "reports";
  const buffer = await wb.xlsx.writeBuffer();
  download(buffer as ArrayBuffer, `atalmart-${name}-${todayStamp()}.xlsx`);
}
