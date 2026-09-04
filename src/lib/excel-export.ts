"use client";

import type ExcelJS from "exceljs";
import { CATEGORIES_SEED } from "@/lib/constants";
import type { Order, Product, Profile } from "@/types";

const SAFFRON = "FFFF6B00";

/**
 * Lazy-load ExcelJS only when an export button is actually clicked. The
 * library is ~900KB minified — keeping it out of the admin route bundles
 * speeds up the first paint of /admin/orders, /admin/products,
 * /admin/customers significantly.
 */
export async function loadExcelJS() {
  return (await import("exceljs")).default;
}

/**
 * Trigger a download of `buffer` as a file in the browser.
 */
export function download(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Apply Atalmart's saffron header styling to row 1 of a worksheet. */
export function styleHeader(sheet: ExcelJS.Worksheet, widths?: number[]) {
  const row = sheet.getRow(1);
  row.height = 26;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SAFFRON } };
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
  if (widths) {
    widths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export function styleBody(sheet: ExcelJS.Worksheet) {
  for (let r = 2; r <= sheet.rowCount; r++) {
    sheet.getRow(r).eachCell((cell) => {
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  }
}

export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Orders ────────────────────────────────────────────────────────
export async function exportOrdersToExcel(orders: Order[]) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Atalmart";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Orders");
  sheet.columns = [
    { header: "Order ID", key: "id" },
    { header: "Customer", key: "customer" },
    { header: "Phone", key: "phone" },
    { header: "Status", key: "status" },
    { header: "Placed At", key: "placed_at" },
    { header: "Delivered At", key: "delivered_at" },
    { header: "Items", key: "items" },
    { header: "Subtotal (₹)", key: "subtotal" },
    { header: "Delivery Fee (₹)", key: "delivery_fee" },
    { header: "Discount (₹)", key: "discount" },
    { header: "Total (₹)", key: "total" },
    { header: "Address", key: "address" },
    { header: "Rider", key: "rider" },
    { header: "Notes", key: "notes" },
  ];

  for (const o of orders) {
    const itemSummary = (o.items || [])
      .map((it) => `${it.product_name} ×${it.quantity}`)
      .join(", ");
    const itemTotal = (o.items || []).reduce(
      (sum, it) => sum + it.price * it.quantity,
      0,
    );
    sheet.addRow({
      id: o.id,
      customer: o.profile?.name || "—",
      phone: o.profile?.phone || "—",
      status: o.status,
      placed_at: new Date(o.placed_at).toLocaleString("en-IN"),
      delivered_at: o.delivered_at
        ? new Date(o.delivered_at).toLocaleString("en-IN")
        : "",
      items: itemSummary,
      subtotal: itemTotal,
      delivery_fee: o.delivery_fee,
      discount: o.discount,
      total: o.total,
      address: o.address_line,
      rider: o.rider?.name || "",
      notes: o.notes || "",
    });
  }

  // Totals row using SUM formulas (not hardcoded)
  const last = sheet.rowCount;
  if (orders.length > 0) {
    const totalsRow = sheet.addRow({
      id: "",
      customer: `TOTAL (${orders.length} orders)`,
      subtotal: { formula: `SUM(H2:H${last})` },
      delivery_fee: { formula: `SUM(I2:I${last})` },
      discount: { formula: `SUM(J2:J${last})` },
      total: { formula: `SUM(K2:K${last})` },
    });
    totalsRow.font = { name: "Arial", bold: true, size: 10 };
    totalsRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF7ED" },
    };
  }

  // Currency format for ₹ columns
  ["H", "I", "J", "K"].forEach((col) => {
    sheet.getColumn(col).numFmt = '"₹"#,##0';
    sheet.getColumn(col).alignment = { horizontal: "right" };
  });

  styleHeader(sheet, [18, 22, 14, 16, 22, 22, 50, 14, 16, 14, 14, 40, 18, 30]);
  styleBody(sheet);

  const buffer = await wb.xlsx.writeBuffer();
  download(buffer as ArrayBuffer, `atalmart-orders-${todayStamp()}.xlsx`);
}

// ─── Customers ─────────────────────────────────────────────────────
interface CustomerExportRow {
  profile: Profile;
  ordersCount: number;
  ltv: number;
  aov: number;
  lastOrderAt: string | null;
}

export async function exportCustomersToExcel(rows: CustomerExportRow[]) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Atalmart";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Customers");

  sheet.columns = [
    { header: "Customer ID", key: "id" },
    { header: "Name", key: "name" },
    { header: "Phone", key: "phone" },
    { header: "Joined", key: "joined" },
    { header: "Orders", key: "orders" },
    { header: "LTV (₹)", key: "ltv" },
    { header: "AOV (₹)", key: "aov" },
    { header: "Last Order", key: "last" },
  ];

  for (const r of rows) {
    sheet.addRow({
      id: r.profile.id,
      name: r.profile.name || "—",
      phone: r.profile.phone || "—",
      joined: new Date(r.profile.created_at).toLocaleDateString("en-IN"),
      orders: r.ordersCount,
      ltv: r.ltv,
      aov: r.aov,
      last: r.lastOrderAt ? new Date(r.lastOrderAt).toLocaleString("en-IN") : "—",
    });
  }

  ["F", "G"].forEach((c) => {
    sheet.getColumn(c).numFmt = '"₹"#,##0';
    sheet.getColumn(c).alignment = { horizontal: "right" };
  });
  sheet.getColumn("E").alignment = { horizontal: "right" };

  styleHeader(sheet, [16, 24, 16, 14, 10, 14, 14, 22]);
  styleBody(sheet);

  const buffer = await wb.xlsx.writeBuffer();
  download(buffer as ArrayBuffer, `atalmart-customers-${todayStamp()}.xlsx`);
}

// ─── Products ──────────────────────────────────────────────────────
export async function exportProductsToExcel(products: Product[]) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Atalmart";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Products");

  sheet.columns = [
    { header: "SKU/ID", key: "id" },
    { header: "Name (English)", key: "name" },
    { header: "Name (Hindi)", key: "name_hi" },
    { header: "Category", key: "category" },
    { header: "Price (₹)", key: "price" },
    { header: "MRP (₹)", key: "mrp" },
    { header: "Cost (₹)", key: "cost" },
    { header: "Margin %", key: "margin" },
    { header: "Unit", key: "unit" },
    { header: "Stock", key: "stock" },
    { header: "Stock value (₹)", key: "stock_value" },
    { header: "Supplier", key: "supplier" },
    { header: "Description", key: "description" },
    { header: "Active", key: "active" },
  ];

  for (const p of products) {
    // Live mode: category is a joined row with a real name. Demo mode: the id
    // is the 1-based index into the seed list.
    const catName =
      p.category?.name ||
      CATEGORIES_SEED[Number(p.category_id) - 1]?.name ||
      p.category_id;
    const cost = Number(p.cost_price) || 0;
    const margin = cost > 0 && p.price > 0 ? Math.round(((p.price - cost) / p.price) * 1000) / 10 : null;
    sheet.addRow({
      id: p.id,
      name: p.name,
      name_hi: p.name_hi,
      category: catName,
      price: p.price,
      mrp: p.mrp,
      cost: cost || "",
      margin: margin ?? "",
      unit: p.unit,
      stock: p.stock,
      stock_value: cost > 0 ? Math.round(cost * (Number(p.stock) || 0)) : "",
      supplier: p.supplier?.name || "",
      description: p.description || "",
      active: p.active ? "Yes" : "No",
    });
  }

  ["E", "F", "G", "K"].forEach((c) => {
    sheet.getColumn(c).numFmt = '"₹"#,##0';
    sheet.getColumn(c).alignment = { horizontal: "right" };
  });
  sheet.getColumn("H").numFmt = '0.0"%"';
  ["H", "J"].forEach((c) => {
    sheet.getColumn(c).alignment = { horizontal: "right" };
  });

  styleHeader(sheet, [14, 28, 24, 22, 12, 12, 12, 10, 12, 10, 14, 18, 38, 10]);
  styleBody(sheet);

  const buffer = await wb.xlsx.writeBuffer();
  download(buffer as ArrayBuffer, `atalmart-products-${todayStamp()}.xlsx`);
}
