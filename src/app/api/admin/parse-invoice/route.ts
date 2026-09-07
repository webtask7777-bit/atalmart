import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type ExcelJS from "exceljs";
import { requireRole } from "@/lib/supabase/auth-guard";
import { resolveAnthropicKey } from "@/lib/server/secrets";
import { extractPdfRows, type PdfRow } from "@/lib/server/pdf-text";
import { parseInvoiceRows } from "@/lib/server/invoice-text-parse";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/parse-invoice — turn a wholesale invoice into draft PO lines.
 *
 * multipart/form-data with `file`:
 *   • PDF                     → text extracted with pdf.js and parsed locally
 *                               (no AI, no key). Scanned PDFs with no text
 *                               fall back to Claude when a key is configured.
 *   • XLSX / CSV              → column-mapped parse, no AI needed
 *   • JPG / PNG / WebP photo  → Claude only (needs ANTHROPIC_API_KEY); without
 *                               a key the admin is told to upload PDF/Excel.
 *
 * Returns { ok, source: "pdf" | "ai" | "sheet", invoice: ParsedInvoice,
 * skipped?: string[] }. The client
 * matches each line to the catalogue and prefills the "New invoice" form —
 * nothing is written to the database here, the admin still reviews & saves.
 */

export interface ParsedInvoiceLine {
  description: string;
  /** Total units (not cases). */
  quantity: number;
  /** Pre-tax price per single unit. */
  unit_cost: number;
  /** GST % on this line (CGST+SGST or IGST). */
  tax_rate: number;
  line_total: number | null;
  mrp: number | null;
  hsn: string | null;
}

export interface ParsedInvoice {
  supplier_name: string | null;
  invoice_number: string | null;
  /** YYYY-MM-DD */
  invoice_date: string | null;
  shipping_total: number;
  other_charges: number;
  grand_total: number | null;
  lines: ParsedInvoiceLine[];
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_LINES = 400;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// JSON Schema for structured output — every property required, no extras,
// so the response always parses into ParsedInvoice without guessing.
const LINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string", description: "Product name exactly as printed, including brand and pack size" },
    quantity: { type: "number", description: "Total single units. If the bill lists cases × units-per-case, multiply them out." },
    unit_cost: { type: "number", description: "Pre-tax (taxable) price for ONE unit in rupees. If the bill gives a case price, divide by units per case." },
    tax_rate: { type: "number", description: "GST percentage for the line: CGST+SGST combined, or IGST. 0 if exempt." },
    line_total: { type: ["number", "null"], description: "Taxable line value (unit_cost × quantity) as printed, or null" },
    mrp: { type: ["number", "null"], description: "Printed MRP per unit if shown, else null" },
    hsn: { type: ["string", "null"], description: "HSN code if shown, else null" },
  },
  required: ["description", "quantity", "unit_cost", "tax_rate", "line_total", "mrp", "hsn"],
} as const;

const INVOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    supplier_name: { type: ["string", "null"] },
    invoice_number: { type: ["string", "null"] },
    invoice_date: { type: ["string", "null"], description: "Invoice date as YYYY-MM-DD, or null" },
    shipping_total: { type: "number", description: "Freight / delivery / shipping charge on the bill header, 0 if none" },
    other_charges: { type: "number", description: "Any other header-level charge (packing, handling, fuel surcharge), 0 if none. Do NOT include GST here." },
    grand_total: { type: ["number", "null"], description: "Final payable amount printed on the bill" },
    lines: { type: "array", items: LINE_SCHEMA },
  },
  required: ["supplier_name", "invoice_number", "invoice_date", "shipping_total", "other_charges", "grand_total", "lines"],
} as const;

const EXTRACTION_PROMPT = `This is a wholesale purchase invoice (usually Flipkart Wholesale) for an Indian grocery store. Extract every product line so the store can record the bill.

Rules:
- One entry per product line on the bill. Skip subtotal/tax/total rows and any "discount" or "coupon" rows — apply line discounts to unit_cost instead so unit_cost is the net taxable price per unit.
- quantity is the number of SINGLE units received. If the bill shows cases/cartons and a pack size (e.g. "2 × 24"), multiply them out.
- unit_cost is the pre-GST price of ONE unit after discounts. Round to 2 decimals.
- tax_rate is the GST percentage (CGST + SGST added together, or IGST). Common values are 0, 5, 12, 18, 28.
- shipping_total / other_charges are header-level charges outside the line items. Never put GST amounts there.
- If something is unreadable, make the best reasonable estimate rather than dropping the line.`;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cleanInvoice(raw: unknown): ParsedInvoice {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const linesRaw = Array.isArray(r.lines) ? r.lines : [];
  const lines: ParsedInvoiceLine[] = linesRaw
    .slice(0, MAX_LINES)
    .map((l) => {
      const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      return {
        description: String(o.description ?? "").trim(),
        quantity: Math.max(0, Math.round(num(o.quantity))),
        unit_cost: Math.max(0, Math.round(num(o.unit_cost) * 100) / 100),
        tax_rate: Math.max(0, Math.min(100, num(o.tax_rate))),
        line_total: o.line_total == null ? null : num(o.line_total),
        mrp: o.mrp == null ? null : num(o.mrp),
        hsn: o.hsn == null ? null : String(o.hsn),
      };
    })
    .filter((l) => l.description && l.quantity > 0);
  const date = typeof r.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.invoice_date)
    ? r.invoice_date
    : null;
  return {
    supplier_name: r.supplier_name ? String(r.supplier_name) : null,
    invoice_number: r.invoice_number ? String(r.invoice_number) : null,
    invoice_date: date,
    shipping_total: Math.max(0, num(r.shipping_total)),
    other_charges: Math.max(0, num(r.other_charges)),
    grand_total: r.grand_total == null ? null : num(r.grand_total),
    lines,
  };
}

// ── AI path (PDF / image) ─────────────────────────────────────────────────
async function extractWithClaude(file: File, apiKey: string): Promise<ParsedInvoice> {
  const client = new Anthropic({ apiKey });
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

  const fileBlock: Anthropic.ContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: (IMAGE_TYPES.has(file.type) ? file.type : "image/jpeg") as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "image/gif",
          data,
        },
      };

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: INVOICE_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: EXTRACTION_PROMPT }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to read this file. Try a clearer scan or upload the Excel/CSV export instead.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Invoice too long to extract in one go — split the PDF and try again.");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Could not read a structured invoice from the file.");
  }
  return cleanInvoice(parsed);
}

// ── Sheet path (XLSX / CSV) ───────────────────────────────────────────────
// The spreadsheet is turned into the same row shape the PDF path produces and
// handed to the shared parser (header-aware column mapping, discount + GST
// slab handling live in ONE place: src/lib/server/invoice-text-parse.ts).

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return String(v.result ?? "");
    if ("text" in v) return String(v.text ?? "");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return String(v);
}

function rowsFromCsv(text: string): string[][] {
  // Minimal RFC-4180: quoted fields with commas/quotes, CRLF or LF.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

async function rowsFromFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    return rowsFromCsv(Buffer.from(buf).toString("utf8"));
  }
  // ~1 MB library — only paid for on the xlsx branch, never on CSV/PDF/photo.
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((r) => {
    const cells: string[] = [];
    for (let c = 1; c <= r.cellCount; c++) cells.push(cellText(r.getCell(c).value));
    rows.push(cells);
  });
  return rows;
}

function parseSheet(rows: string[][]): { invoice: ParsedInvoice; skipped: string[] } {
  const pdfRows: PdfRow[] = rows
    .map((cells, i) => {
      const trimmed = cells.map((c) => (c ?? "").trim());
      // Keep empty cells so column indexes stay aligned with the header row.
      return { page: 1, y: -i, cells: trimmed, text: trimmed.filter(Boolean).join("  ") };
    })
    .filter((r) => r.text.length > 0);
  const parsed = parseInvoiceRows(pdfRows);
  if (parsed.lines.length === 0) {
    throw new Error(
      "Couldn't find product rows. Expected a header like Product / Qty / Rate / GST% — export the bill from Flipkart Wholesale as Excel, or upload the PDF.",
    );
  }
  const { skipped, ...rest } = parsed;
  return {
    invoice: cleanInvoice({ ...rest, supplier_name: rest.supplier_name ?? "Flipkart Wholesale" }),
    skipped,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const guard = await requireRole("admin");
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* fallthrough */
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Upload a PDF, image, XLSX or CSV as `file`" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large (max 15 MB)" }, { status: 413 });
  }

  const name = file.name.toLowerCase();
  const isSheet =
    /\.(xlsx|xlsm|csv)$/.test(name) ||
    file.type === "text/csv" ||
    file.type.includes("spreadsheetml");
  const isAiReadable =
    file.type === "application/pdf" || /\.pdf$/.test(name) || IMAGE_TYPES.has(file.type);

  const isPdf = file.type === "application/pdf" || /\.pdf$/.test(name);

  try {
    if (isSheet) {
      const rows = await rowsFromFile(file);
      const { invoice, skipped } = parseSheet(rows);
      return NextResponse.json({ ok: true, source: "sheet", invoice, skipped });
    }
    if (!isAiReadable) {
      return NextResponse.json(
        { ok: false, error: "Unsupported file. Upload the invoice PDF, a photo (JPG/PNG), or an Excel/CSV export." },
        { status: 415 },
      );
    }

    const key = resolveAnthropicKey();

    // PDF: local text parse first — free, instant, works offline from AI.
    if (isPdf) {
      const data = new Uint8Array(await file.arrayBuffer());
      let textRows: Awaited<ReturnType<typeof extractPdfRows>> = [];
      try {
        textRows = await extractPdfRows(data);
      } catch {
        textRows = [];
      }
      const hasText = textRows.some((r) => r.text.length > 3);
      if (hasText) {
        const parsed = parseInvoiceRows(textRows);
        if (parsed.lines.length > 0) {
          const { skipped, ...rest } = parsed;
          const invoice = cleanInvoice(rest);
          return NextResponse.json({ ok: true, source: "pdf", invoice, skipped });
        }
      }
      if (!key.value) {
        return NextResponse.json(
          {
            ok: false,
            error: hasText
              ? "Couldn't find product rows in this PDF's text. Upload the Excel/CSV export of the bill instead (Flipkart Wholesale → Orders → Download invoice/Excel)."
              : "This PDF has no readable text (it's a scan). Upload the Excel/CSV export, or the original text PDF from Flipkart Wholesale.",
          },
          { status: 422 },
        );
      }
      // Scanned or oddly laid-out PDF and a key exists → let the model read it.
    }

    if (!key.value) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Photo reading needs the AI key, which isn't configured. Upload the bill as PDF or Excel/CSV instead — those work without it.",
        },
        { status: 503 },
      );
    }
    const invoice = await extractWithClaude(file, key.value);
    return NextResponse.json({ ok: true, source: "ai", invoice });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ ok: false, error: "AI is busy — try again in a minute." }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY is invalid." }, { status: 503 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ ok: false, error: `AI error ${err.status}: ${err.message}` }, { status: 502 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }
}
