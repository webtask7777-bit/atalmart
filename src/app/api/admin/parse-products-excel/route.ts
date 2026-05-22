import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { CATEGORIES_SEED } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * POST: multipart/form-data with field `file` (an .xlsx file).
 * Returns { rows: ParsedRow[], errors: ParseError[] }.
 *
 * The route only parses + validates. The client decides what to do with
 * the rows (preview, then save to demo store or Supabase).
 */

interface ParsedRow {
  rowNumber: number; // 1-indexed Excel row number
  sku: string;
  name: string;
  name_hi: string;
  category: string;
  category_id: string; // matched index (1-based) into CATEGORIES_SEED
  price: number;
  mrp: number;
  unit: string;
  stock: number;
  description: string;
  active: boolean;
}

interface ParseError {
  rowNumber: number;
  field: string;
  message: string;
}

const HEADERS = [
  "SKU/ID",
  "Name (English)",
  "Name (Hindi)",
  "Category",
  "Price (₹)",
  "MRP (₹)",
  "Unit",
  "Stock",
  "Description",
  "Active",
] as const;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    // Find the Products sheet (case-insensitive)
    const sheet = workbook.worksheets.find(
      (s) => s.name.trim().toLowerCase() === "products",
    );
    if (!sheet) {
      return NextResponse.json(
        { error: "Workbook missing 'Products' sheet" },
        { status: 400 },
      );
    }

    // Zip-bomb guard — a malicious xlsx (or careless export) can declare
    // millions of rows that explode at parse time. Cap at 2000 (10× our
    // documented template limit) to keep parse memory bounded.
    const MAX_ROWS = 2000;
    if (sheet.rowCount > MAX_ROWS) {
      return NextResponse.json(
        {
          error: `Workbook has ${sheet.rowCount} rows — maximum ${MAX_ROWS} allowed. Split into multiple files.`,
        },
        { status: 400 },
      );
    }

    // Validate header row
    const headerRow = sheet.getRow(1);
    for (let i = 0; i < HEADERS.length; i++) {
      const cellValue = String(headerRow.getCell(i + 1).value || "").trim();
      if (cellValue !== HEADERS[i]) {
        return NextResponse.json(
          {
            error: `Header mismatch at column ${i + 1}: expected "${HEADERS[i]}", got "${cellValue}". Re-download the template.`,
          },
          { status: 400 },
        );
      }
    }

    const categoryIndex = new Map<string, string>();
    CATEGORIES_SEED.forEach((c, i) => {
      categoryIndex.set(c.name.toLowerCase(), String(i + 1));
    });

    const rows: ParsedRow[] = [];
    const errors: ParseError[] = [];

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const sku = cellString(row.getCell(1));
      // Skip completely blank rows
      if (!sku && !cellString(row.getCell(2))) return;

      const name = cellString(row.getCell(2));
      const name_hi = cellString(row.getCell(3));
      const categoryName = cellString(row.getCell(4));
      const price = cellNumber(row.getCell(5));
      const mrp = cellNumber(row.getCell(6));
      const unit = cellString(row.getCell(7));
      const stock = cellNumber(row.getCell(8));
      const description = cellString(row.getCell(9));
      const activeRaw = cellString(row.getCell(10)).toLowerCase();
      const active = activeRaw === "yes" || activeRaw === "true" || activeRaw === "1";

      const rowErrors: ParseError[] = [];
      if (!sku) rowErrors.push({ rowNumber, field: "SKU/ID", message: "Required" });
      if (!name) rowErrors.push({ rowNumber, field: "Name (English)", message: "Required" });
      if (!categoryName) {
        rowErrors.push({ rowNumber, field: "Category", message: "Required" });
      }
      const category_id = categoryIndex.get(categoryName.toLowerCase()) || "";
      if (categoryName && !category_id) {
        rowErrors.push({
          rowNumber,
          field: "Category",
          message: `Unknown category "${categoryName}" — use one from Categories Reference sheet`,
        });
      }
      if (price < 0 || isNaN(price)) {
        rowErrors.push({ rowNumber, field: "Price", message: "Must be a non-negative number" });
      }
      if (mrp < price) {
        rowErrors.push({
          rowNumber,
          field: "MRP",
          message: `MRP (${mrp}) must be >= Price (${price})`,
        });
      }
      if (stock < 0 || isNaN(stock)) {
        rowErrors.push({ rowNumber, field: "Stock", message: "Must be a non-negative integer" });
      }
      // Coerce money to whole rupees — the server-side pricing endpoint
      // (assertRupees) throws if any product price is fractional, which
      // would 500-crash every cart containing the SKU. Round at write time.
      const priceInt = Math.max(0, Math.round(price));
      const mrpInt = Math.max(priceInt, Math.round(mrp));
      const stockInt = Math.max(0, Math.round(stock));
      if (!unit) {
        rowErrors.push({ rowNumber, field: "Unit", message: "Required (e.g. 1 kg)" });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        return;
      }

      rows.push({
        rowNumber,
        sku,
        name,
        name_hi,
        category: categoryName,
        category_id,
        price: priceInt,
        mrp: mrpInt,
        unit,
        stock: stockInt,
        description,
        active,
      });
    });

    return NextResponse.json({ rows, errors, totalParsed: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse Excel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function cellString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "text" in v && typeof v.text === "string") {
    return v.text.trim();
  }
  if (typeof v === "object" && "richText" in v && Array.isArray(v.richText)) {
    return v.richText.map((r) => r.text).join("").trim();
  }
  return String(v).trim();
}

function cellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[₹,\s]/g, "");
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return Number(v) || 0;
}
