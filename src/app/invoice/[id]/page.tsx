"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useOrder } from "@/lib/hooks/use-orders";
import { ORDER_STATUS_LABELS, GSTIN, FSSAI_LICENSE, paymentMethodLabel } from "@/lib/constants";
import { useSettings } from "@/lib/store/settings";
import { Printer, Download, ArrowLeft, X, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/**
 * Standalone, printable invoice route.
 * Opens in a new tab. Auto-prints when ?print=1 is appended.
 *
 * Layout follows India retail invoice conventions (with GST 5% split as CGST/SGST).
 */
export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { order, loading } = useOrder(id);
  const settings = useSettings();
  const sp = useSearchParams();
  const autoPrint = sp.get("print") === "1";

  useEffect(() => {
    if (!loading && order && autoPrint) {
      // Wait one frame for paint, then trigger native print dialog
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, order, autoPrint]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="h-8 w-8 border-3 border-saffron border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-5xl mb-3">🧾</p>
        <h1 className="text-xl font-bold text-brown">Invoice not found</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">Order doesn&apos;t exist</p>
        <Link href="/orders" className="text-saffron font-semibold text-sm hover:underline">
          ← Back to orders
        </Link>
      </div>
    );
  }

  // ─── Resolve order metadata ───
  // Prefer first-class columns; fall back to regex on `notes` for legacy
  // orders placed before migration 003.
  const note = order.notes || "";
  const phone =
    order.phone ||
    note.match(/Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)/)?.[1]?.trim() ||
    "";
  const paymentMethodRaw =
    order.payment_method ||
    note.match(/Payment:\s*(\w+)/)?.[1] ||
    "—";
  const paymentMethod = paymentMethodLabel(paymentMethodRaw);
  const couponCode =
    order.coupon_code ||
    note.match(/Coupon:\s*([A-Z0-9]+)/)?.[1] ||
    null;

  const addressParts = (order.address_line || "").split(",").map((s) => s.trim());
  const recipient =
    order.profile?.name ||
    (addressParts[0] && /^[A-Za-z][A-Za-z .'-]+$/.test(addressParts[0]) ? addressParts[0] : "Customer");
  const deliveryLines = addressParts.slice(recipient === addressParts[0] ? 1 : 0).filter(Boolean);

  // GST split — Indian retail convention: 5% on food items, split as 2.5% CGST + 2.5% SGST
  // The 'total' in our orders already includes everything; we back-compute taxable for display.
  const subtotal =
    (order.items || []).reduce((s, it) => s + it.price * it.quantity, 0) ||
    order.total - order.delivery_fee + (order.discount || 0);
  const taxRate = 0.05;
  const taxableValue = Math.round(subtotal / (1 + taxRate));
  const totalTax = subtotal - taxableValue;
  const cgst = Math.round(totalTax / 2);
  const sgst = totalTax - cgst;

  const placed = new Date(order.placed_at);
  const invoiceNo = `ATM/${placed.getFullYear()}/${(order.id.match(/\d+/)?.[0] || "0").slice(-6).padStart(6, "0")}`;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Toolbar — hidden on print */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href={`/track/${order.id}`}
            className="flex items-center gap-1.5 text-sm font-semibold text-brown hover:text-saffron"
          >
            <ArrowLeft size={16} />
            Back to order
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 bg-saffron text-white text-sm font-bold rounded-lg hover:bg-saffron-dark"
            >
              <Printer size={14} />
              Print
            </button>
            <DownloadPdfButton order={order} settings={settings} />
            <Link
              href="/orders"
              aria-label="close"
              className="p-2 text-gray-400 hover:text-brown"
            >
              <X size={18} />
            </Link>
          </div>
        </div>
      </div>

      {/* Invoice paper */}
      <div className="max-w-4xl mx-auto p-4 md:p-8 print:p-0">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 print:shadow-none print:border-0 p-6 md:p-10">
          {/* Header */}
          <header className="flex items-start justify-between gap-4 pb-6 border-b-2 border-saffron">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 bg-saffron rounded-xl flex items-center justify-center text-white font-bold text-xl">
                  A
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-saffron leading-none">
                    {settings.appName}
                  </h1>
                  <p className="text-[11px] text-brown-light">{settings.tagline}</p>
                </div>
              </div>
              <p className="text-xs text-brown-light mt-2 leading-snug">
                {settings.storeAddress}
                <br />
                {settings.contactPhone} · {settings.contactEmail}
                {(GSTIN || FSSAI_LICENSE) && (
                  <>
                    <br />
                    {GSTIN && <>GSTIN: {GSTIN}</>}
                    {GSTIN && FSSAI_LICENSE && " · "}
                    {FSSAI_LICENSE && <>FSSAI: {FSSAI_LICENSE}</>}
                  </>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Tax Invoice
              </p>
              <p className="text-base font-bold text-brown font-mono mt-1">
                {invoiceNo}
              </p>
              <p className="text-xs text-brown-light mt-2">
                Order: <span className="font-mono">#{order.id.slice(-8).toUpperCase()}</span>
              </p>
              <p className="text-xs text-brown-light">
                {placed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                {" · "}
                {placed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <span
                className={`mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                  order.status === "delivered"
                    ? "bg-green-light text-indian-green"
                    : order.status === "cancelled"
                    ? "bg-red-50 text-red-500"
                    : "bg-saffron-light text-saffron"
                }`}
              >
                {ORDER_STATUS_LABELS[order.status] || order.status}
              </span>
            </div>
          </header>

          {/* Billed to / Shipped to / Payment */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                Billed to
              </p>
              <p className="font-bold text-brown">{recipient}</p>
              {phone && <p className="text-sm text-brown-light">{phone}</p>}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                Delivered to
              </p>
              <p className="text-sm text-brown leading-snug">
                {deliveryLines.join(", ") || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
                Payment
              </p>
              <p className="text-sm font-medium text-brown">{paymentMethod}</p>
              {couponCode && (
                <p className="text-xs text-indian-green mt-0.5">
                  Coupon: <span className="font-mono font-bold">{couponCode}</span>
                </p>
              )}
            </div>
          </section>

          {/* Items table */}
          <section className="mt-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-y border-gray-200 text-[10px] uppercase tracking-wider text-gray-600">
                  <th className="text-left px-3 py-2 font-bold w-10">#</th>
                  <th className="text-left px-3 py-2 font-bold">Item</th>
                  <th className="text-right px-3 py-2 font-bold w-16">Qty</th>
                  <th className="text-right px-3 py-2 font-bold w-24">Rate</th>
                  <th className="text-right px-3 py-2 font-bold w-24">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400 italic py-8">
                      No line items captured for this order
                    </td>
                  </tr>
                ) : (
                  (order.items || []).map((it, i) => (
                    <tr key={it.id} className="border-b border-gray-100">
                      <td className="px-3 py-3 text-gray-500 font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-3 text-brown">{it.product_name}</td>
                      <td className="px-3 py-3 text-right text-brown">{it.quantity}</td>
                      <td className="px-3 py-3 text-right text-brown">₹{it.price}</td>
                      <td className="px-3 py-3 text-right font-medium text-brown">
                        ₹{it.price * it.quantity}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* Totals */}
          <section className="mt-6 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <Row label="Taxable value" value={`₹${taxableValue}`} />
              <Row label="CGST @ 2.5%" value={`₹${cgst}`} muted />
              <Row label="SGST @ 2.5%" value={`₹${sgst}`} muted />
              <Row label="Subtotal" value={`₹${subtotal}`} />
              {(order.discount || 0) > 0 && (
                <Row
                  label={`Discount${couponCode ? ` (${couponCode})` : ""}`}
                  value={`− ₹${order.discount}`}
                  green
                />
              )}
              <Row
                label="Delivery"
                value={order.delivery_fee === 0 ? "FREE" : `₹${order.delivery_fee}`}
                green={order.delivery_fee === 0}
              />
              <div className="border-t-2 border-brown pt-2 mt-2">
                <Row label="Grand Total" value={`₹${order.total}`} bold />
              </div>
            </dl>
          </section>

          {/* Amount in words */}
          <p className="mt-6 text-xs text-brown-light">
            <span className="font-semibold">Amount in words:</span>{" "}
            <span className="italic">{numberToWords(order.total)} only</span>
          </p>

          {/* Footer */}
          <footer className="mt-10 pt-6 border-t border-dashed border-gray-300 text-center text-[11px] text-gray-500">
            <p className="font-semibold text-brown mb-1">
              Thank you for shopping with {settings.appName}!
            </p>
            <p>{settings.tagline}</p>
            <p className="mt-3">
              For returns or refunds, contact {settings.contactPhone} or {settings.contactEmail} within 24 hours of delivery.
            </p>
            <p className="mt-2 text-[10px] text-gray-400">
              This is a system-generated invoice and does not require a signature.
            </p>
          </footer>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          html, body { background: white !important; }
          @page { margin: 1cm; size: A4; }
        }
      `}</style>
    </div>
  );
}

function DownloadPdfButton({
  order,
  settings,
}: {
  order: ReturnType<typeof useOrder>["order"];
  settings: ReturnType<typeof useSettings>;
}) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!order) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/invoice/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          order: {
            id: order.id,
            placed_at: order.placed_at,
            status: order.status,
            total: order.total,
            delivery_fee: order.delivery_fee,
            discount: order.discount,
            address_line: order.address_line,
            items: order.items || [],
            profile: order.profile
              ? { name: order.profile.name, phone: order.profile.phone }
              : undefined,
            notes: order.notes,
          },
          storeSettings: {
            appName: settings.appName,
            tagline: settings.tagline,
            storeAddress: settings.storeAddress,
            contactEmail: settings.contactEmail,
            contactPhone: settings.contactPhone,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `atalmart-invoice-${order.id.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Invoice PDF downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={downloading || !order}
      className="flex items-center gap-1.5 px-4 py-2 border-2 border-saffron text-saffron text-sm font-bold rounded-lg hover:bg-saffron-light disabled:opacity-50"
    >
      {downloading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Download size={14} />
      )}
      {downloading ? "Generating…" : "Download PDF"}
    </button>
  );
}

function Row({
  label,
  value,
  bold,
  green,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  green?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <dt className={muted ? "text-xs text-gray-500" : "text-brown-light"}>{label}</dt>
      <dd
        className={`${bold ? "text-lg font-bold text-brown" : muted ? "text-xs text-gray-500" : "text-brown"} ${
          green ? "text-indian-green font-medium" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

// ─── Number to words (Indian) ──────────────────────
function numberToWords(num: number): string {
  if (num === 0) return "Rupees Zero";
  if (num < 0) return `Minus ${numberToWords(-num)}`;

  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const sub = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return `${b[Math.floor(n / 10)]}${n % 10 ? " " + a[n % 10] : ""}`;
    return `${a[Math.floor(n / 100)]} Hundred${n % 100 ? " " + sub(n % 100) : ""}`;
  };

  let n = Math.floor(num);
  const parts: string[] = [];
  if (n >= 10000000) {
    parts.push(`${sub(Math.floor(n / 10000000))} Crore`);
    n %= 10000000;
  }
  if (n >= 100000) {
    parts.push(`${sub(Math.floor(n / 100000))} Lakh`);
    n %= 100000;
  }
  if (n >= 1000) {
    parts.push(`${sub(Math.floor(n / 1000))} Thousand`);
    n %= 1000;
  }
  if (n > 0) parts.push(sub(n));

  return `Rupees ${parts.join(" ")}`;
}
