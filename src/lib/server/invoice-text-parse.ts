/**
 * Heuristic invoice parser over text rows (from pdf-text.ts). No AI.
 *
 * Works on any "table of lines" bill: each product row has a description
 * followed by numbers — qty, unit price, GST %, amount — in some order. We
 * don't assume a fixed column order; instead every row is scored: the
 * description is the leading non-numeric text, the numeric tail is assigned
 * by shape (an integer → qty, a value ending in % or one of the GST slabs →
 * tax, the largest → line total, and unit cost is whichever remaining number
 * makes qty × cost ≈ total). Header fields (invoice #, date, freight, grand
 * total) come from labelled rows anywhere in the document.
 */

import type { PdfRow } from "./pdf-text";

export interface TextInvoiceLine {
  description: string;
  quantity: number;
  unit_cost: number;
  tax_rate: number;
  line_total: number | null;
  mrp: number | null;
  hsn: string | null;
}

export interface TextInvoice {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  shipping_total: number;
  other_charges: number;
  grand_total: number | null;
  lines: TextInvoiceLine[];
  /** Rows that looked like products but couldn't be parsed — shown to the admin. */
  skipped: string[];
}

const GST_SLABS = new Set([0, 3, 5, 12, 18, 28]);
const NUM_RE = /^-?₹?\s*\d[\d,]*(?:\.\d+)?%?$/;
const HSN_RE = /^\d{4,8}$/;
const HEADER_WORDS = /\b(qty|quantity|rate|amount|total|hsn|gst|taxable|description|particulars|sr\.?\s*no|s\.?\s*no|unit\s*price|mrp|discount)\b/i;
const SUMMARY_WORDS = /^(sub\s*total|total|grand\s*total|net\s*(amount|payable)|amount\s*(payable|due)|round(ing)?\s*off|cgst|sgst|igst|gst|tax|taxable\s*value|discount|freight|shipping|delivery|handling|packing|other\s*charges?|balance|paid|payable)/i;

function toNum(s: string): number {
  return parseFloat(s.replace(/[₹,\s%]/g, "")) || 0;
}

function isNumToken(s: string): boolean {
  return NUM_RE.test(s.trim());
}

/** Split a row into leading text + trailing numeric tokens. */
function splitRow(row: PdfRow): { desc: string; nums: string[]; hsn: string | null } {
  // Prefer cell boundaries (from x-gaps) — they keep "10 KG" inside the
  // description cell. Fall back to whitespace tokens, gluing number+unit
  // pairs ("10 KG", "500 ml", "2 x") back together so they read as text.
  let tokens: string[];
  if (row.cells.length >= 3) {
    tokens = row.cells.flatMap((c) => c.split(/\s{2,}/));
  } else {
    const raw = row.text.split(/\s+/);
    tokens = [];
    for (let i = 0; i < raw.length; i++) {
      const next = raw[i + 1] ?? "";
      if (isNumToken(raw[i]) && /^(kg|kgs|g|gm|gms|ml|l|ltr|litre|pcs|pc|pack|packs|x|nos|units?)$/i.test(next)) {
        tokens.push(`${raw[i]} ${next}`);
        i++;
      } else tokens.push(raw[i]);
    }
  }

  const nums: string[] = [];
  const textParts: string[] = [];
  let hsn: string | null = null;
  let i = 0;
  // Leading serial number(s) — "1", "01", "1." — are not quantities.
  while (i < tokens.length && /^\d{1,3}[.)]?$/.test(tokens[i].trim())) i++;
  for (; i < tokens.length; i++) {
    const tt = tokens[i].trim();
    if (!tt) continue;
    if (isNumToken(tt)) {
      // A 4–8 digit integer right after the description, with more numbers
      // still to come, is an HSN code — not a quantity.
      if (!hsn && nums.length === 0 && HSN_RE.test(tt) && textParts.length > 0 && tokens.slice(i + 1).some(isNumToken)) {
        hsn = tt;
        continue;
      }
      nums.push(tt);
    } else {
      // Text after the numbers (a unit label like "PCS"/"KG") stays part of
      // the description; assignNumbers decides whether the row is a product.
      textParts.push(tt);
    }
  }
  const desc = textParts.join(" ").trim();
  return { desc, nums, hsn };
}

/**
 * Assign the numeric tail to qty / unit cost / tax / total.
 * Returns null when the row can't be a product line.
 */
function assignNumbers(nums: string[]): { qty: number; cost: number; tax: number; total: number | null; mrp: number | null } | null {
  if (nums.length < 2) return null;
  const vals = nums.map((n) => ({ raw: n, v: toNum(n), pct: n.trim().endsWith("%"), int: /^\d+$/.test(n.replace(/,/g, "")) }));

  // GST % : explicit "%" wins; else a slab value that is not the only integer.
  let taxIdx = vals.findIndex((x) => x.pct);
  if (taxIdx < 0) {
    const slabIdxs = vals.map((x, i) => (GST_SLABS.has(x.v) && x.int ? i : -1)).filter((i) => i >= 0);
    // Pick the LAST slab-looking integer that isn't the first number (first
    // int is usually qty).
    taxIdx = slabIdxs.filter((i) => i > 0).pop() ?? -1;
  }
  const tax = taxIdx >= 0 ? vals[taxIdx].v : 0;
  const rest = vals.filter((_, i) => i !== taxIdx);
  if (rest.length < 2) return null;

  // Qty: first small integer (≤ 10000) in the tail.
  const qtyIdx = rest.findIndex((x) => x.int && x.v > 0 && x.v <= 10000);
  if (qtyIdx < 0) return null;
  const qty = rest[qtyIdx].v;
  const others = rest.filter((_, i) => i !== qtyIdx).map((x) => x.v).filter((v) => v > 0);
  if (others.length === 0) return null;

  // Total = largest value; unit cost = the value closest to total/qty.
  const total = Math.max(...others);
  const target = total / qty;
  let cost = 0;
  let bestErr = Infinity;
  for (const v of others) {
    if (v === total && others.length > 1) continue;
    const err = Math.abs(v - target) / Math.max(target, 1);
    if (err < bestErr) { bestErr = err; cost = v; }
  }
  // Single number besides qty → it's the unit price if it's ≤ total/qty*1.5,
  // else it's the total.
  if (others.length === 1) {
    if (Math.abs(others[0] - target) < 0.01 || others[0] <= total) cost = others[0];
  }
  // If the "cost" we found is the tax-inclusive or the total itself, derive.
  if (cost <= 0 || bestErr > 0.35) cost = Math.round((total / qty) * 100) / 100;
  // MRP: a value larger than cost but smaller than total, if any, when ≥3 nums.
  const mrp = others.filter((v) => v > cost && v < total && others.length >= 3).sort((a, b) => a - b)[0] ?? null;
  return { qty: Math.round(qty), cost: Math.round(cost * 100) / 100, tax, total: total > cost ? total : null, mrp };
}

function findLabelled(rows: PdfRow[], label: RegExp): string | null {
  for (const r of rows) {
    const m = r.text.match(label);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function parseDate(s: string | null): string | null {
  if (!s) return null;
  // ISO first — the dd/mm/yy pattern below would otherwise match INSIDE
  // "2026-08-15" (as 26-08-15) and produce 2015-08-26.
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const m = s.match(/(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?!\d)/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${mo}-${d}`;
  }
  const mon = s.match(/(\d{1,2})\s*([A-Za-z]{3})[a-z]*\s*(\d{4})/);
  if (mon) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const mi = months.indexOf(mon[2].toLowerCase().slice(0, 3));
    if (mi >= 0) return `${mon[3]}-${String(mi + 1).padStart(2, "0")}-${mon[1].padStart(2, "0")}`;
  }
  return null;
}

function lastNumberIn(text: string): number | null {
  const m = text.match(/-?₹?\s*\d[\d,]*(?:\.\d+)?(?!.*\d)/);
  return m ? toNum(m[0]) : null;
}

// ── Header-aware column mapping ───────────────────────────────────────────
// Most bills print a column header ("Item Description | HSN | MRP | Qty | Rate
// | Disc | Taxable Value | CGST | SGST | Total"). When we find one, every row
// with the same number of cells is read by column — far more reliable than
// guessing from number shapes.
type Col =
  | "sno" | "desc" | "hsn" | "mrp" | "qty" | "rate" | "disc" | "taxable"
  | "cgst" | "sgst" | "igst" | "tax" | "taxamt" | "total";

const COL_HINTS: [Col, RegExp][] = [
  ["sno", /^(s\.?\s*no\.?|sr\.?\s*no\.?|sl\.?\s*no\.?|#|no\.?)$/i],
  ["hsn", /hsn|sac/i],
  ["mrp", /^mrp/i],
  ["qty", /^(qty|quantity|units?|nos?|pcs)\b/i],
  ["cgst", /^cgst/i],
  ["sgst", /^(sgst|utgst)/i],
  ["igst", /^igst/i],
  ["tax", /(gst|tax)\s*(%|rate|percent)|^gst\s*%$|^tax\s*%$|^%$/i],
  ["taxamt", /^(gst|tax)\s*(amt|amount)/i],
  ["taxable", /taxable|net\s*value|assessable/i],
  ["disc", /disc/i],
  ["rate", /^(rate|unit\s*price|price|basic|unit\s*cost|cost)/i],
  ["total", /total|amount|value|net/i],
  ["desc", /description|item|product|particular|name|goods/i],
];

function classifyCol(h: string): Col | null {
  const t = h.trim();
  if (!t) return null;
  for (const [c, re] of COL_HINTS) if (re.test(t)) return c;
  return null;
}

interface HeaderMap { cellCount: number; cols: (Col | null)[]; }

function detectHeader(rows: PdfRow[]): { index: number; map: HeaderMap } | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const cells = rows[i].cells;
    if (cells.length < 4) continue;
    const cols = cells.map(classifyCol);
    const known = new Set(cols.filter(Boolean));
    if (known.size >= 3 && (known.has("desc") || known.has("qty")) && (known.has("qty") || known.has("rate") || known.has("total"))) {
      return { index: i, map: { cellCount: cells.length, cols } };
    }
  }
  return null;
}

const SLABS = [0, 3, 5, 12, 18, 28];
function snapSlab(pct: number): number {
  const nearest = SLABS.reduce((a, b) => (Math.abs(b - pct) < Math.abs(a - pct) ? b : a), SLABS[0]);
  return Math.abs(nearest - pct) <= 1.5 ? nearest : Math.round(pct * 100) / 100;
}

function readByHeader(row: PdfRow, map: HeaderMap): TextInvoiceLine | null {
  let cells = row.cells;
  // Header often prints "S.No Item Description" as ONE cell while data rows
  // split the serial into its own cell — drop a leading serial to realign.
  if (cells.length === map.cellCount + 1 && /^\d{1,3}[.)]?$/.test(cells[0].trim())) {
    cells = cells.slice(1);
  }
  if (cells.length !== map.cellCount) return null;
  const get = (c: Col): string | null => {
    const i = map.cols.indexOf(c);
    return i >= 0 ? cells[i] : null;
  };
  const n = (c: Col): number | null => {
    const v = get(c);
    if (v == null || !isNumToken(v.replace(/\s/g, ""))) return null;
    return toNum(v);
  };
  const descRaw = get("desc") ?? "";
  const desc = descRaw.replace(/^\d{1,3}[.)]?\s+/, "").trim();
  if (desc.length < 3 || isNumToken(desc)) return null;
  const qty = n("qty");
  if (!qty || qty <= 0) return null;

  const taxable = n("taxable");
  const rate = n("rate");
  const total = n("total");
  const discRaw = get("disc");
  const disc = discRaw ? toNum(discRaw) : 0;
  const discIsPct = !!discRaw && discRaw.trim().endsWith("%");

  // Net pre-tax unit cost: taxable/qty is exact when the column exists.
  let cost = 0;
  if (taxable && taxable > 0) cost = taxable / qty;
  else if (rate && rate > 0) cost = discIsPct ? rate * (1 - disc / 100) : rate - disc / qty;
  else if (total && total > 0) cost = total / qty;
  if (cost <= 0) return null;

  // GST %: explicit column, else back it out of the tax amounts.
  let tax = n("tax");
  if (tax == null) {
    const amt = (n("cgst") ?? 0) + (n("sgst") ?? 0) + (n("igst") ?? 0) + (n("taxamt") ?? 0);
    const base = taxable && taxable > 0 ? taxable : cost * qty;
    tax = amt > 0 && base > 0 ? snapSlab((amt / base) * 100) : 0;
  }
  return {
    description: desc,
    quantity: Math.round(qty),
    unit_cost: Math.round(cost * 100) / 100,
    tax_rate: tax,
    line_total: taxable ?? total ?? null,
    mrp: n("mrp"),
    hsn: get("hsn") && HSN_RE.test(get("hsn")!.trim()) ? get("hsn")!.trim() : null,
  };
}

export function parseInvoiceRows(rows: PdfRow[]): TextInvoice {
  const allText = rows.map((r) => r.text).join("\n");

  const supplier = /flipkart\s*wholesale/i.test(allText)
    ? "Flipkart Wholesale"
    : findLabelled(rows, /^(?:sold\s*by|seller|supplier|from)\s*[:\-]?\s*(.+)$/i);

  const invoiceNumber =
    findLabelled(rows, /invoice\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-_.]{2,})/i) ??
    findLabelled(rows, /\b(?:bill|order)\s*(?:no\.?|number|#|id)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-_.]{2,})/i);

  const invoiceDate = parseDate(
    findLabelled(rows, /(?:invoice|bill)\s*date\s*[:\-]?\s*([0-9][0-9\/\-.]+|\d{1,2}\s*[A-Za-z]{3,}\s*\d{4})/i) ??
      findLabelled(rows, /\bdate\s*[:\-]?\s*([0-9][0-9\/\-.]{7,9})/i),
  );

  let shipping = 0;
  let other = 0;
  let grand: number | null = null;
  for (const r of rows) {
    const t = r.text;
    if (/\b(freight|shipping|delivery\s*charge)/i.test(t) && !/free/i.test(t)) shipping = Math.max(shipping, lastNumberIn(t) ?? 0);
    else if (/\b(handling|packing|other\s*charges?|fuel\s*surcharge)/i.test(t)) other += lastNumberIn(t) ?? 0;
    if (/\b(grand\s*total|net\s*(?:amount|payable)|total\s*(?:amount|payable|invoice\s*value)|amount\s*payable)\b/i.test(t)) {
      const n = lastNumberIn(t);
      if (n && n > (grand ?? 0)) grand = n;
    }
  }

  // Product rows: between the column header and the first summary row,
  // but we don't rely on finding either — every row is judged on its own.
  const lines: TextInvoiceLine[] = [];
  const skipped: string[] = [];
  const header = detectHeader(rows);
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    const t = r.text;
    if (header && ri === header.index) continue;
    if (t.length < 6) continue;
    // Column-mapped read when the row has the header's shape.
    if (header && ri > header.index && !SUMMARY_WORDS.test(t)) {
      const byHeader = readByHeader(r, header.map);
      if (byHeader) {
        lines.push(byHeader);
        continue;
      }
      // A short text-only row right after a line is a wrapped description.
      if (lines.length > 0 && r.cells.length <= 2 && !/\d{2,}/.test(t) && /[a-z]{3,}/i.test(t)) {
        lines[lines.length - 1].description += ` ${t}`;
        continue;
      }
    }
    if (HEADER_WORDS.test(t) && !/\d{2,}/.test(t.replace(HEADER_WORDS, ""))) continue; // column header row
    if (SUMMARY_WORDS.test(t)) continue;
    const { desc, nums, hsn } = splitRow(r);
    if (desc.length < 3 || nums.length < 2) continue;
    if (/^(invoice|bill|date|gstin|pan|phone|email|address|place|state|order)/i.test(desc)) continue;
    const assigned = assignNumbers(nums);
    if (!assigned) {
      if (/[a-z]{3,}/i.test(desc) && nums.length >= 2) skipped.push(t);
      continue;
    }
    lines.push({
      description: desc,
      quantity: assigned.qty,
      unit_cost: assigned.cost,
      tax_rate: assigned.tax,
      line_total: assigned.total,
      mrp: assigned.mrp,
      hsn,
    });
  }

  return {
    supplier_name: supplier,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    shipping_total: shipping,
    other_charges: Math.round(other * 100) / 100,
    grand_total: grand,
    lines,
    skipped,
  };
}
