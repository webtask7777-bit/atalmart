import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { isDemoMode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { rateLimitWithPrune, clientKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

interface InvoiceItem {
  product_name: string;
  quantity: number;
  price: number;
}

interface InvoiceRequest {
  order: {
    id: string;
    placed_at: string;
    status: string;
    total: number;
    delivery_fee: number;
    discount: number;
    address_line: string;
    items: InvoiceItem[];
    profile?: { name?: string | null; phone?: string };
    /** First-class column added in migration 003. */
    phone?: string | null;
    /** First-class column added in migration 003. */
    payment_method?: string | null;
    notes?: string | null;
  };
  storeSettings?: {
    appName?: string;
    tagline?: string;
    storeAddress?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
}

// Atalmart brand colors (RGB 0-1)
const SAFFRON = rgb(1.0, 0.42, 0);
const BROWN = rgb(0.18, 0.13, 0.1);
const GREEN = rgb(0.075, 0.531, 0.031);
const LIGHT_GRAY = rgb(0.9, 0.9, 0.9);
const TEXT_GRAY = rgb(0.4, 0.4, 0.4);

export async function POST(req: NextRequest) {
  let body: InvoiceRequest;
  try {
    body = (await req.json()) as InvoiceRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { order: bodyOrder, storeSettings } = body;
  if (!bodyOrder || !bodyOrder.id) {
    return NextResponse.json({ error: "order required" }, { status: 400 });
  }

  // In production, ignore the body's order data and look it up from DB by ID.
  // Verify the requester owns the order (or is admin). In demo mode (no DB),
  // trust the client payload as before — demo orders live in localStorage.
  let order = bodyOrder;
  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Rate-limit per user — invoices are usually one-off downloads.
    const limit = rateLimitWithPrune(
      clientKey(req, user.id, "invoice"),
      20,
      60 * 60_000,
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many invoice requests — wait ${limit.retryAfterSec}s` },
        {
          status: 429,
          headers: { "retry-after": String(limit.retryAfterSec) },
        },
      );
    }

    const { data: dbOrder, error: dbErr } = await supabase
      .from("orders")
      .select(
        "id, placed_at, status, total, delivery_fee, discount, address_line, notes, user_id, items:order_items(*), profile:profiles(name, phone)",
      )
      .eq("id", bodyOrder.id)
      .single();

    if (dbErr || !dbOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Authorization: owner OR admin
    const orderRow = dbOrder as { user_id: string };
    if (orderRow.user_id !== user.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!profile || (profile as { role: string }).role !== "admin") {
        return NextResponse.json(
          { error: "Not authorized to view this invoice" },
          { status: 403 },
        );
      }
    }

    // Use DB values — body is now untrusted input we've discarded.
    order = dbOrder as typeof bodyOrder;
  }

  const store = {
    appName: storeSettings?.appName || "Atalmart",
    tagline: storeSettings?.tagline || "Atal Nagar ki Atal Delivery",
    storeAddress:
      storeSettings?.storeAddress || "Sector 21, Atal Nagar, Naya Raipur",
    contactEmail: storeSettings?.contactEmail || "support@atalmart.in",
    contactPhone: storeSettings?.contactPhone || "+91 9876543210",
  };

  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // A4 portrait
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 40;
  let y = height - margin;

  // ── Header: saffron stripe + logo + invoice number ─────────────
  page.drawRectangle({
    x: 0,
    y: height - 6,
    width,
    height: 6,
    color: SAFFRON,
  });
  y -= 14;

  // Logo box (saffron square with "A")
  page.drawRectangle({
    x: margin,
    y: y - 38,
    width: 38,
    height: 38,
    color: SAFFRON,
  });
  page.drawText("A", {
    x: margin + 11,
    y: y - 30,
    size: 22,
    font: helvBold,
    color: rgb(1, 1, 1),
  });

  // Store name + tagline
  page.drawText(store.appName, {
    x: margin + 50,
    y: y - 10,
    size: 18,
    font: helvBold,
    color: SAFFRON,
  });
  page.drawText(store.tagline, {
    x: margin + 50,
    y: y - 26,
    size: 9,
    font: helv,
    color: TEXT_GRAY,
  });
  page.drawText(store.storeAddress, {
    x: margin + 50,
    y: y - 38,
    size: 8,
    font: helv,
    color: TEXT_GRAY,
  });
  page.drawText(
    `${store.contactPhone}  ·  ${store.contactEmail}`,
    { x: margin + 50, y: y - 50, size: 8, font: helv, color: TEXT_GRAY },
  );
  page.drawText("GSTIN: 22ABCDE1234F1Z5  ·  FSSAI: 12345678901234", {
    x: margin + 50,
    y: y - 62,
    size: 8,
    font: helv,
    color: TEXT_GRAY,
  });

  // Invoice number block (right)
  const invoiceNo = `ATM/${new Date(order.placed_at).getFullYear()}/${order.id
    .slice(-6)
    .toUpperCase()}`;
  drawRight(page, "TAX INVOICE", width - margin, y - 10, 8, helv, TEXT_GRAY);
  drawRight(page, invoiceNo, width - margin, y - 26, 12, helvBold, BROWN);
  drawRight(
    page,
    `Order: #${order.id.slice(-8).toUpperCase()}`,
    width - margin,
    y - 40,
    9,
    helv,
    TEXT_GRAY,
  );
  drawRight(
    page,
    formatDate(order.placed_at),
    width - margin,
    y - 52,
    9,
    helv,
    TEXT_GRAY,
  );
  drawRight(
    page,
    order.status.replace(/_/g, " ").toUpperCase(),
    width - margin,
    y - 66,
    8,
    helvBold,
    SAFFRON,
  );

  y -= 90;

  // ── Divider line ───────────────────────────────────────────────
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1.5,
    color: SAFFRON,
  });
  y -= 18;

  // ── Billed To / Delivered To / Payment ─────────────────────────
  // Prefer first-class columns; fall back to regex on `notes` for legacy
  // orders placed before migration 003.
  const note = order.notes || "";
  const phone =
    order.phone ||
    note.match(/Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)/)?.[1]?.trim() ||
    order.profile?.phone ||
    "";
  const payRaw =
    order.payment_method ||
    note.match(/Payment:\s*(\w+)/)?.[1] ||
    "";
  const payment =
    payRaw === "cod"
      ? "Cash on Delivery"
      : payRaw === "online"
        ? "Online (UPI / Card)"
        : payRaw || "—";

  const colWidth = (width - 2 * margin) / 3;
  drawLabel(page, "BILLED TO", margin, y, helv);
  page.drawText(order.profile?.name || "Customer", {
    x: margin,
    y: y - 14,
    size: 11,
    font: helvBold,
    color: BROWN,
  });
  if (phone) {
    page.drawText(phone, {
      x: margin,
      y: y - 28,
      size: 9,
      font: helv,
      color: TEXT_GRAY,
    });
  }

  drawLabel(page, "DELIVERED TO", margin + colWidth, y, helv);
  wrapText(
    page,
    order.address_line || "",
    margin + colWidth,
    y - 14,
    colWidth - 10,
    9,
    helv,
    BROWN,
  );

  drawLabel(page, "PAYMENT", margin + 2 * colWidth, y, helv);
  page.drawText(payment, {
    x: margin + 2 * colWidth,
    y: y - 14,
    size: 11,
    font: helvBold,
    color: BROWN,
  });

  y -= 60;

  // ── Items table ────────────────────────────────────────────────
  // Header row (saffron-light background)
  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: width - 2 * margin,
    height: 20,
    color: rgb(1, 0.96, 0.92),
  });
  const colX = {
    sno: margin + 8,
    item: margin + 36,
    qty: width - margin - 180,
    rate: width - margin - 110,
    amount: width - margin - 8,
  };
  page.drawText("#", { x: colX.sno, y: y, size: 9, font: helvBold, color: TEXT_GRAY });
  page.drawText("ITEM", { x: colX.item, y: y, size: 9, font: helvBold, color: TEXT_GRAY });
  drawRight(page, "QTY", colX.qty, y, 9, helvBold, TEXT_GRAY);
  drawRight(page, "RATE", colX.rate, y, 9, helvBold, TEXT_GRAY);
  drawRight(page, "AMOUNT", colX.amount, y, 9, helvBold, TEXT_GRAY);
  y -= 18;

  let subtotal = 0;
  for (let i = 0; i < order.items.length; i++) {
    const it = order.items[i];
    const amount = it.price * it.quantity;
    subtotal += amount;
    page.drawText(String(i + 1), {
      x: colX.sno,
      y,
      size: 9,
      font: helv,
      color: TEXT_GRAY,
    });
    page.drawText(it.product_name, {
      x: colX.item,
      y,
      size: 10,
      font: helv,
      color: BROWN,
    });
    drawRight(page, String(it.quantity), colX.qty, y, 10, helv, BROWN);
    drawRight(page, formatRupees(it.price), colX.rate, y, 10, helv, BROWN);
    drawRight(page, formatRupees(amount), colX.amount, y, 10, helvBold, BROWN);
    y -= 18;
  }
  // Single divider line below items table
  page.drawLine({
    start: { x: margin, y: y + 4 },
    end: { x: width - margin, y: y + 4 },
    thickness: 0.5,
    color: LIGHT_GRAY,
  });
  y -= 4;

  // ── Tax + totals (right side) ──────────────────────────────────
  // Indian retail convention: MRP is inclusive of GST. Show CGST + SGST
  // as a backed-out breakdown (5% combined → 5/105 of item subtotal).
  // The Grand Total equals order.total — authoritative from checkout.
  const labelX = width - margin - 200;
  const valueX = width - margin;
  const gstFraction = 5 / 105;
  const totalTax = Math.round(subtotal * gstFraction);
  const cgst = Math.round(totalTax / 2);
  const sgst = totalTax - cgst;
  const taxableValue = subtotal - totalTax;

  drawTotalRow(page, "Item subtotal", labelX, valueX, y, formatRupees(subtotal), helv, helv, BROWN);
  y -= 14;
  drawTotalRow(page, "  Taxable value", labelX, valueX, y, formatRupees(taxableValue), helv, helv, TEXT_GRAY);
  y -= 14;
  drawTotalRow(page, "  CGST @ 2.5% (incl.)", labelX, valueX, y, formatRupees(cgst), helv, helv, TEXT_GRAY);
  y -= 14;
  drawTotalRow(page, "  SGST @ 2.5% (incl.)", labelX, valueX, y, formatRupees(sgst), helv, helv, TEXT_GRAY);
  y -= 14;
  if (order.discount > 0) {
    drawTotalRow(page, "Discount", labelX, valueX, y, `- ${formatRupees(order.discount)}`, helv, helv, GREEN);
    y -= 14;
  }
  drawTotalRow(
    page,
    "Delivery",
    labelX,
    valueX,
    y,
    order.delivery_fee === 0 ? "FREE" : formatRupees(order.delivery_fee),
    helv,
    helv,
    order.delivery_fee === 0 ? GREEN : BROWN,
  );
  y -= 28; // extra gap so the highlight box doesn't overlap Delivery row

  // Grand total bar
  page.drawRectangle({
    x: labelX - 8,
    y: y - 6,
    width: valueX - labelX + 16,
    height: 24,
    color: rgb(1, 0.96, 0.92),
  });
  page.drawText("Grand Total", {
    x: labelX,
    y,
    size: 13,
    font: helvBold,
    color: BROWN,
  });
  drawRight(page, formatRupees(order.total), valueX, y, 16, helvBold, SAFFRON);
  y -= 26;

  // Amount in words
  page.drawText("Amount in words:", {
    x: margin,
    y,
    size: 9,
    font: helvBold,
    color: TEXT_GRAY,
  });
  page.drawText(numberToIndianWords(order.total), {
    x: margin + 88,
    y,
    size: 9,
    font: helv,
    color: BROWN,
  });
  y -= 32;

  // ── Footer ─────────────────────────────────────────────────────
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: LIGHT_GRAY,
  });
  y -= 16;
  page.drawText(`Thank you for shopping with ${store.appName}!`, {
    x: margin,
    y,
    size: 11,
    font: helvBold,
    color: SAFFRON,
  });
  y -= 14;
  page.drawText(
    `For any queries, contact ${store.contactPhone} or ${store.contactEmail}`,
    { x: margin, y, size: 8, font: helv, color: TEXT_GRAY },
  );
  y -= 12;
  page.drawText(
    "Returns / cancellations accepted within 24 hours of delivery.",
    { x: margin, y, size: 8, font: helv, color: TEXT_GRAY },
  );
  y -= 12;
  page.drawText(
    "This is a computer-generated invoice. No signature required.",
    { x: margin, y, size: 7, font: helv, color: TEXT_GRAY },
  );

  // Bottom saffron stripe
  page.drawRectangle({ x: 0, y: 0, width, height: 4, color: SAFFRON });

  const pdfBytes = await pdf.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="atalmart-invoice-${order.id.slice(-8)}.pdf"`,
      "cache-control": "no-cache",
    },
  });
}

// ───────────────────── Helpers ─────────────────────

function drawRight(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x - width, y, size, font, color });
}

function drawLabel(page: PDFPage, text: string, x: number, y: number, font: PDFFont) {
  page.drawText(text, {
    x,
    y,
    size: 7,
    font,
    color: TEXT_GRAY,
  });
}

function drawTotalRow(
  page: PDFPage,
  label: string,
  labelX: number,
  valueX: number,
  y: number,
  value: string,
  labelFont: PDFFont,
  valueFont: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(label, { x: labelX, y, size: 9, font: labelFont, color });
  drawRight(page, value, valueX, y, 9, valueFont, color);
}

function wrapText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  for (let i = 0; i < lines.length && i < 4; i++) {
    page.drawText(lines[i], { x, y: y - i * 11, size, font, color });
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// Use "Rs." prefix instead of ₹ glyph — StandardFonts.Helvetica doesn't
// have the rupee codepoint, and the default WinAnsi encoder would throw.
function formatRupees(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-IN")}`;
}

// ── Indian number to words (simplified) ────────────────────────
function numberToIndianWords(num: number): string {
  if (num === 0) return "Zero Rupees only";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];
  function under1000(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
    return `${ones[Math.floor(n / 100)]} Hundred ${under1000(n % 100)}`.trim();
  }
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${under1000(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));
  return `${parts.join(" ").replace(/\s+/g, " ").trim()} Rupees only`;
}
