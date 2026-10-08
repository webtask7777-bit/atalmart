"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Banknote,
  Plus,
  Check,
  Home,
  Briefcase,
  Smartphone,
  Copy,
} from "lucide-react";
import QRCode from "qrcode";
import { useCartStore, useCartHydrated } from "@/lib/store/cart";
import { useCouponStore } from "@/lib/store/coupon";
import { useWalletStore } from "@/lib/store/wallet";
import { useAddressStore, type SavedAddress } from "@/lib/store/addresses";
import { useAuth } from "@/lib/hooks/use-auth";
import { createOrder } from "@/lib/hooks/use-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculateCouponDiscount,
  isServiceablePincode,
  parseServiceablePincodes,
  UPI_ID,
  buildUpiIntentUrl,
  UPI_UTR_RE,
  normalizeUtr,
} from "@/lib/constants";
import { useSettings } from "@/lib/store/settings";
import { useUserPincodeStore } from "@/lib/store/user-pincode";
import { validatePhone10 } from "@/lib/validators";
import {
  payWithRazorpay,
  RazorpayError,
  type RazorpayPayResult,
} from "@/lib/razorpay-checkout";
import { toast } from "sonner";
import { showLocalOrderNotification } from "@/components/customer/notification-prompt";
import { resolveLines, summarizeLines, computeQuote } from "@/lib/cart-line";
import { useStoreAvailability } from "@/lib/hooks/use-availability";

const LABEL_ICON: Record<SavedAddress["label"], React.ComponentType<{ size?: number; className?: string }>> = {
  Home: Home,
  Work: Briefcase,
  Other: MapPin,
};

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart } = useCartStore();
  const cartHydrated = useCartHydrated();
  const availability = useStoreAvailability();
  const { user, profile, isDemo } = useAuth();
  const coupon = useCouponStore((s) => s.applied);
  const clearCoupon = useCouponStore((s) => s.clear);
  const myCouponUsage = useCouponStore((s) => s.myUsage);
  const { addresses, selectedId, select } = useAddressStore();
  const settings = useSettings();
  const {
    deliveryFee: DELIVERY_FEE,
    freeDeliveryAbove: FREE_DELIVERY_ABOVE,
    minOrderAmount: MIN_ORDER,
    codEnabled,
    onlinePaymentEnabled,
    serviceablePincodes,
  } = settings;
  // Admin pauses intake by turning every method off — UPI must respect that too.
  const paymentsPaused = !codEnabled && !onlinePaymentEnabled;
  const setUserPincode = useUserPincodeStore((s) => s.setPincode);
  const walletBalance = useWalletStore((s) => s.balance);
  const spendFromWallet = useWalletStore((s) => s.spend);

  const [useSaved, setUseSaved] = useState(addresses.length > 0);
  const [recipientName, setRecipientName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online" | "upi">("cod");
  const [upiUtr, setUpiUtr] = useState("");
  const [upiQr, setUpiQr] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState(true);
  const [loading, setLoading] = useState(false);
  const [placed, setPlaced] = useState(false);

  // One resolved view of every line — the same resolver the cart page uses,
  // so the summary below can never show a different pack/price than the
  // cart did (launch audit AM-02: a 1 L ₹59 line rendered as "(500 ml) ₹28").
  const lines = useMemo(() => resolveLines(items), [items]);
  const summary = useMemo(() => summarizeLines(lines), [lines]);
  const subtotal = summary.subtotal;
  const couponDiscount = calculateCouponDiscount(coupon, subtotal);
  // Preview only — /api/orders/price is the authority (checked below).
  const quote = computeQuote({
    subtotal,
    couponDiscount,
    deliveryFee: DELIVERY_FEE,
    freeDeliveryAbove: FREE_DELIVERY_ABOVE,
    minOrderAmount: MIN_ORDER,
    walletBalance,
    useWallet,
  });
  const deliveryFee = quote.deliveryFee;
  const walletApplied = quote.walletApplied;
  const total = quote.total;
  const canOrder = availability.canOrder || availability.state === "unknown";

  // Prefill recipient + phone from the logged-in profile. Profile arrives
  // async after mount, so this fills once it lands — but never overwrites
  // anything the customer has already typed.
  useEffect(() => {
    if (!profile) return;
    setRecipientName((v) => v || profile.name || "");
    setPhone((v) => v || profile.phone.replace(/\D/g, "").slice(-10));
  }, [profile]);

  // Regenerate the UPI QR whenever the payable total changes while the
  // direct-UPI option is selected. Encodes the standard upi://pay intent so
  // any UPI app (GPay/PhonePe/Paytm/BHIM) can scan it with amount prefilled.
  useEffect(() => {
    if (paymentMethod !== "upi" || total <= 0) {
      setUpiQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(buildUpiIntentUrl(total), { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setUpiQr(url);
      })
      .catch(() => {
        if (!cancelled) setUpiQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentMethod, total]);

  // Redirect to cart if empty — only after hydration finishes, and not when we've
  // just placed an order (clearCart empties items right before we push to /track/{id})
  useEffect(() => {
    if (!cartHydrated || placed) return;
    if (items.length === 0) router.replace("/cart");
  }, [items.length, router, placed, cartHydrated]);

  if (!cartHydrated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex items-center justify-center">
        <span className="h-8 w-8 border-3 border-saffron border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (items.length === 0 && !placed) return null;

  const selectedAddr = addresses.find((a) => a.id === selectedId);
  // A saved address may carry a dropped map pin. Send it: the server treats
  // a pin as authoritative over the typed pincode, so an address just outside
  // the sector boundary is refused even when its pincode is serviceable.
  const deliveryPin =
    useSaved && selectedAddr?.lat != null && selectedAddr?.lng != null
      ? { lat: selectedAddr.lat, lng: selectedAddr.lng }
      : null;

  const handlePlaceOrder = async () => {
    let finalName = recipientName.trim();
    let finalAddress = address.trim();
    let finalPhone = phone.trim();

    if (useSaved && selectedAddr) {
      finalName = selectedAddr.recipient;
      finalAddress = `${selectedAddr.line}${selectedAddr.landmark ? ", " + selectedAddr.landmark : ""}, ${selectedAddr.pincode}`;
      finalPhone = selectedAddr.phone;
    }

    if (!finalName) return toast.error("Please enter recipient name");
    if (paymentsPaused) return toast.error("Abhi payments paused hain — thodi der baad try karein");
    if (
      paymentMethod === "upi" &&
      total > 0 &&
      !UPI_UTR_RE.test(normalizeUtr(upiUtr))
    ) {
      return toast.error(
        `Pehle ₹${total} UPI se ${UPI_ID} par pay karein, phir UTR / transaction reference (10–22 characters) yahan enter karein`,
        { duration: 6000 },
      );
    }
    if (!finalAddress) return toast.error("Please enter delivery address");
    const phoneErr = validatePhone10(finalPhone);
    if (phoneErr) return toast.error(phoneErr);

    // ── Service-area enforcement ─────────────────────────────
    // Extract pincode (last 6-digit sequence) from address line, or fall back
    // to a dedicated field on saved addresses.
    const extractedPincode =
      (useSaved && selectedAddr?.pincode) ||
      finalAddress.match(/\b(\d{6})\b(?!.*\b\d{6}\b)/)?.[1] ||
      "";

    if (!extractedPincode) {
      return toast.error(
        "Address mein 6-digit pincode add karein (e.g. 492101)",
      );
    }
    if (!isServiceablePincode(extractedPincode, serviceablePincodes)) {
      const list = Array.from(parseServiceablePincodes(serviceablePincodes));
      return toast.error(
        `Sorry, pincode ${extractedPincode} hamare service area mein nahi hai. We deliver only to: ${list.join(", ")}`,
        { duration: 6000 },
      );
    }
    // Persist for header display and future visits
    setUserPincode(extractedPincode);

    // Prepend recipient to address_line so admin can identify the customer
    const addressWithName = `${finalName}, ${finalAddress}`;

    if (!isDemo && !user) {
      toast.error("Please login to place order");
      router.push("/auth?next=/checkout");
      return;
    }

    setLoading(true);

    // ── Server-side price validation ─────────────────────────
    // The browser-computed total above is for UX only. The server recomputes
    // everything from canonical sources (DB or demoSnapshot for local dev)
    // and is authoritative. If the totals diverge by ₹1+, the client was
    // either out of date or attempting tampering — abort and surface the error.
    const priceRes = await fetch("/api/orders/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: items.map((it) => ({
          product_id: it.product.id,
          quantity: it.quantity,
          variant_id: it.variant?.id ?? null,
        })),
        couponCode: coupon?.code,
        walletApplied,
        pincode: extractedPincode,
        lat: deliveryPin?.lat ?? null,
        lng: deliveryPin?.lng ?? null,
        // Demo-mode snapshot — only used when server is in demo mode (where
        // it can't see localStorage). In production this field is ignored.
        demoSnapshot: {
          products: Object.fromEntries(
            items.map((it) => [
              it.product.id,
              {
                name: it.product.name,
                price: it.product.price,
                stock: it.product.stock,
                active: it.product.active,
              },
            ]),
          ),
          coupons: coupon ? { [coupon.code]: coupon } : {},
          userOrderCount: 0, // demo: we don't track this; loosens firstOrderOnly
          // Forward how many times THIS user has redeemed THIS coupon so the
          // server-side maxUsesPerUser check actually fires. Previously
          // hardcoded to 0, which bypassed per-user redemption limits.
          userCouponUsage: coupon ? myCouponUsage[coupon.code] ?? 0 : 0,
          walletBalance,
          deliveryRules: {
            fee: DELIVERY_FEE,
            freeAbove: FREE_DELIVERY_ABOVE,
            minOrder: MIN_ORDER,
          },
        },
      }),
    });
    const priceData = (await priceRes.json()) as
      | {
          ok: true;
          subtotal: number;
          couponDiscount: number;
          deliveryFee: number;
          walletApplied: number;
          total: number;
        }
      | { error: string };

    if (!priceRes.ok || "error" in priceData) {
      toast.error(
        "error" in priceData ? priceData.error : "Pricing check failed",
      );
      setLoading(false);
      return;
    }

    // Surface a friendly warning if the client preview drifted, then trust
    // the server number — never the client's. Diff threshold of ₹1 catches
    // rounding bugs without spamming on legitimate concurrent updates.
    if (Math.abs(priceData.total - total) >= 1) {
      toast.warning(
        `Total updated to ₹${priceData.total} (was ₹${total}). Confirm before placing.`,
        { duration: 5000 },
      );
      setLoading(false);
      return;
    }

    // ── Online payment gate ──────────────────────────────────
    // For online orders we MUST collect (and server-verify) a real payment
    // BEFORE writing the order row. The amount comes from the server's
    // authoritative price (priceData.total), never the client preview. If the
    // gateway isn't configured or the customer cancels, we abort without
    // placing the order. COD skips this entirely.
    let paymentProof: RazorpayPayResult | undefined;
    if (paymentMethod === "online" && priceData.total > 0) {
      // No client-side gate here: `razorpayEnabled` only lives in the
      // admin's own localStorage, so customers would always see it false.
      // The server is the source of truth — create-order returns
      // `not_configured` (503) when env keys are missing, handled below.
      try {
        paymentProof = await payWithRazorpay({
          amount: priceData.total,
          businessName: "Atalmart",
          customerName: finalName,
          phone: finalPhone,
          receipt: `atal_${Date.now()}`,
        });
      } catch (err) {
        const reason = err instanceof RazorpayError ? err.reason : "error";
        if (reason === "cancelled") {
          toast.info("Payment cancelled — your order was not placed.");
        } else if (reason === "not_configured") {
          toast.error(
            "Online payment is not set up. Please choose Cash on Delivery.",
          );
        } else if (reason === "verify_failed") {
          toast.error(
            "We couldn't verify your payment. If money was deducted, it will be auto-refunded. Please try again.",
          );
        } else {
          toast.error("Payment failed. Please try again or use Cash on Delivery.");
        }
        setLoading(false);
        return;
      }
    }

    const { data: order, error } = await createOrder({
      items,
      address_line: addressWithName,
      phone: finalPhone,
      payment_method: paymentMethod,
      total: priceData.total,
      delivery_fee: priceData.deliveryFee,
      discount: priceData.couponDiscount,
      coupon_code: coupon?.code,
      // Server re-prices + re-verifies from these — client totals above are
      // ignored by /api/orders/place.
      walletApplied: priceData.walletApplied,
      pincode: extractedPincode,
      lat: deliveryPin?.lat ?? null,
      lng: deliveryPin?.lng ?? null,
      payment: paymentProof
        ? {
            razorpay_order_id: paymentProof.razorpay_order_id,
            razorpay_payment_id: paymentProof.razorpay_payment_id,
            razorpay_signature: paymentProof.razorpay_signature,
          }
        : undefined,
      upi_utr: paymentMethod === "upi" ? upiUtr.trim().toUpperCase() : undefined,
    });

    if (error || !order) {
      toast.error(error || "Failed to place order");
      setLoading(false);
      return;
    }

    // Debit wallet AFTER successful order create — use server's authoritative number
    if (priceData.walletApplied > 0) {
      spendFromWallet(priceData.walletApplied, order.id);
    }

    // Mark placed BEFORE clearing cart so the empty-cart effect doesn't redirect
    setPlaced(true);
    clearCart();
    clearCoupon();
    toast.success("Order placed successfully!");
    // Fire local OS notification if user enabled it
    showLocalOrderNotification(
      "Order placed! 🎉",
      `Order #${order.id.slice(0, 8)} — ₹${total}. We'll deliver it quickly.`,
      `order-${order.id}`,
    );
    router.push(`/track/${order.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/cart"
          className="p-2 rounded-full hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={20} className="text-brown" />
        </Link>
        <h1 className="text-xl font-bold text-brown">Checkout</h1>
      </div>

      {!isDemo && !user && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
          <p className="text-sm text-brown">
            <Link href="/auth?next=/checkout" className="text-saffron font-medium hover:underline">
              Login
            </Link>{" "}
            to place order and track delivery.
          </p>
        </div>
      )}

      <section className="bg-white rounded-2xl p-5 border border-gray-100 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-brown flex items-center gap-2">
            <MapPin size={18} className="text-saffron" />
            Delivery Address
          </h3>
          {addresses.length > 0 && (
            <button
              onClick={() => setUseSaved((v) => !v)}
              className="text-xs font-semibold text-saffron hover:underline"
            >
              {useSaved ? "Enter new" : "Use saved"}
            </button>
          )}
        </div>

        {useSaved && addresses.length > 0 ? (
          <div className="space-y-2">
            {addresses.map((a) => {
              const Icon = LABEL_ICON[a.label];
              const active = selectedId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => select(a.id)}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border-2 transition-colors ${
                    active ? "border-saffron bg-saffron-light" : "border-gray-200"
                  }`}
                >
                  <div
                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                      active ? "bg-saffron text-white" : "bg-gray-100 text-saffron"
                    }`}
                  >
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-brown">
                      {a.label === "Other" && a.customLabel ? a.customLabel : a.label}
                    </p>
                    <p className="text-xs text-brown-light mt-0.5 leading-snug">
                      {a.recipient} · {a.phone}
                    </p>
                    <p className="text-xs text-brown-light leading-snug truncate">
                      {a.line}, {a.pincode}
                    </p>
                  </div>
                  {active && <Check size={16} className="text-saffron shrink-0" strokeWidth={3} />}
                </button>
              );
            })}
            <Link
              href="/account/addresses"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-semibold text-saffron hover:border-saffron hover:bg-saffron-light/50 transition-colors"
            >
              <Plus size={14} />
              Add new address
            </Link>
          </div>
        ) : (
          <>
            <Input
              placeholder="Recipient name (e.g. Ravi Sharma)"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="mb-3"
            />
            <Input
              placeholder="Flat/House No., Building, Sector, Atal Nagar"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mb-3"
            />
            <Input
              placeholder="Phone Number"
              type="tel"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            />
            {addresses.length === 0 && (
              <p className="text-xs text-gray-500 mt-2">
                💡 Save addresses in{" "}
                <Link href="/account/addresses" className="text-saffron font-semibold">
                  Account → Addresses
                </Link>{" "}
                for faster checkout
              </p>
            )}
          </>
        )}
      </section>

      <section className="bg-white rounded-2xl p-5 border border-gray-100 mb-4">
        <h3 className="font-bold text-brown mb-3 flex items-center gap-2">
          <CreditCard size={18} className="text-saffron" />
          Payment Method
        </h3>
        <div className="space-y-2">
          {codEnabled && (
            <label
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                paymentMethod === "cod"
                  ? "border-saffron bg-saffron-light"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="payment"
                checked={paymentMethod === "cod"}
                onChange={() => setPaymentMethod("cod")}
                className="accent-saffron"
              />
              <Banknote size={18} className="text-indian-green" />
              <div>
                <p className="text-sm font-medium text-brown">Cash on Delivery</p>
                <p className="text-xs text-gray-500">Pay when your order arrives</p>
              </div>
            </label>
          )}
          {onlinePaymentEnabled && (
            <label
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                paymentMethod === "online"
                  ? "border-saffron bg-saffron-light"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="payment"
                checked={paymentMethod === "online"}
                onChange={() => setPaymentMethod("online")}
                className="accent-saffron"
              />
              <CreditCard size={18} className="text-navy" />
              <div>
                <p className="text-sm font-medium text-brown">Online (UPI / Card)</p>
                <p className="text-xs text-gray-500">Razorpay — GPay, PhonePe, Cards</p>
              </div>
            </label>
          )}
          {paymentsPaused && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
              Abhi payments paused hain — koi payment method enabled nahi hai. Thodi der baad try karein ya support se contact karein.
            </p>
          )}
          {!paymentsPaused && (
          <label
            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              paymentMethod === "upi"
                ? "border-saffron bg-saffron-light"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === "upi"}
              onChange={() => setPaymentMethod("upi")}
              className="accent-saffron"
            />
            <Smartphone size={18} className="text-indian-green" />
            <div>
              <p className="text-sm font-medium text-brown">UPI — Direct Pay</p>
              <p className="text-xs text-gray-500">
                Pay {UPI_ID} · QR scan ya GPay/PhonePe se
              </p>
            </div>
          </label>
          )}

          {paymentMethod === "upi" && (
            <div className="mt-1 p-4 rounded-xl border-2 border-dashed border-saffron/50 bg-saffron-light/30">
              {total > 0 ? (
                <>
                  <div className="flex flex-col items-center gap-2 mb-3">
                    {upiQr && (
                      // Data-URL QR from the `qrcode` lib — next/image adds nothing here
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={upiQr}
                        alt={`UPI QR — pay ₹${total} to ${UPI_ID}`}
                        width={180}
                        height={180}
                        className="rounded-lg border border-gray-200 bg-white p-1"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-brown">{UPI_ID}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(UPI_ID)
                            .then(() => toast.success("UPI ID copied"))
                            .catch(() => toast.error("Copy failed — likho: " + UPI_ID));
                        }}
                        className="p-1.5 rounded-lg bg-white border border-gray-200 text-saffron hover:border-saffron"
                        aria-label="Copy UPI ID"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <a
                      href={buildUpiIntentUrl(total)}
                      className="md:hidden inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indian-green text-white text-sm font-semibold"
                    >
                      <Smartphone size={16} />
                      Pay ₹{total} — UPI app kholein
                    </a>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">
                    Payment karne ke baad apne UPI app se{" "}
                    <span className="font-semibold">UTR / transaction ID</span>{" "}
                    (12 digit) yahan enter karein:
                  </p>
                  <Input
                    placeholder="UTR / Transaction ID (e.g. 415012345678)"
                    value={upiUtr}
                    maxLength={22}
                    onChange={(e) =>
                      setUpiUtr(e.target.value.replace(/[^A-Za-z0-9]/g, ""))
                    }
                  />
                  <p className="text-[11px] text-amber-700 mt-2">
                    Order dispatch se pehle payment verify hoga. Galat UTR par
                    order cancel ho sakta hai.
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-600">
                  Total ₹0 hai — koi payment nahi chahiye, seedha order place
                  karein.
                </p>
              )}
            </div>
          )}

        </div>
      </section>

      <section className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
        <h3 className="font-bold text-brown mb-3">Order Summary</h3>
        <ul className="space-y-1.5 text-sm mb-3" aria-label="Items">
          {lines.map((line) => (
            <li key={line.key} className="flex justify-between gap-3 text-gray-600">
              <span className="truncate">
                {line.displayName}
                <span className="text-gray-400"> × {line.quantity}</span>
                {line.quantity > 1 && (
                  <span className="text-gray-400 text-xs"> (₹{line.unitPrice} each)</span>
                )}
              </span>
              <span className="shrink-0">₹{line.lineTotal}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-gray-100 pt-2 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>
              {summary.mrpTotal > subtotal && (
                <span className="text-gray-400 line-through mr-2">₹{summary.mrpTotal}</span>
              )}
              ₹{subtotal}
            </span>
          </div>
          {summary.merchandiseSavings > 0 && (
            <div className="flex justify-between text-indian-green">
              <span>MRP savings</span>
              <span>− ₹{summary.merchandiseSavings}</span>
            </div>
          )}
          {coupon && couponDiscount > 0 && (
            <div className="flex justify-between text-indian-green">
              <span>Coupon ({coupon.code})</span>
              <span>− ₹{couponDiscount}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Delivery</span>
            <span>
              {deliveryFee === 0 ? (
                <>
                  {quote.deliveryWaived > 0 && (
                    <span className="text-gray-400 line-through mr-1">₹{quote.deliveryWaived}</span>
                  )}
                  <span className="text-indian-green font-medium">FREE</span>
                </>
              ) : (
                `₹${deliveryFee}`
              )}
            </span>
          </div>
          {quote.freeDeliveryGap > 0 && (
            <p className="text-xs text-saffron-deep">
              ₹{quote.freeDeliveryGap} ka saamaan aur add karein — delivery free (₹{FREE_DELIVERY_ABOVE}+ par)
            </p>
          )}
          {walletApplied > 0 && (
            <div className="flex justify-between text-indian-green">
              <span>Wallet credit applied</span>
              <span>− ₹{walletApplied}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-brown text-base pt-1 border-t border-gray-100 mt-1">
            <span>Total</span>
            <span>₹{total}</span>
          </div>
        </div>

        {/* Wallet toggle — show only when there's a balance */}
        {walletBalance > 0 && (
          <label className="mt-3 flex items-center gap-3 p-3 rounded-xl border-2 border-green-200 bg-green-light/40 cursor-pointer hover:border-indian-green">
            <input
              type="checkbox"
              checked={useWallet}
              onChange={(e) => setUseWallet(e.target.checked)}
              className="accent-indian-green w-4 h-4"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brown">
                Use ₹{walletBalance.toLocaleString("en-IN")} wallet balance
              </p>
              <p className="text-[11px] text-green-700">
                {walletApplied > 0 && useWallet
                  ? `₹${walletApplied} will be applied — pay only ₹${total}`
                  : useWallet
                    ? "No discount applied (total is ₹0)"
                    : "Save your wallet for next time"}
              </p>
            </div>
            <span className="text-2xl">💰</span>
          </label>
        )}
      </section>

      {availability.blocked && (
        <p role="status" className="text-center text-xs font-semibold text-amber-700 mb-2">
          {availability.title}. {availability.body}
        </p>
      )}
      {quote.minOrderGap > 0 && (
        <p role="status" className="text-center text-xs font-semibold text-amber-700 mb-2">
          Minimum order ₹{MIN_ORDER} hai — ₹{quote.minOrderGap} ka saamaan aur add karein
        </p>
      )}
      <Button
        size="lg"
        className="w-full"
        loading={loading}
        disabled={!canOrder || quote.minOrderGap > 0}
        onClick={handlePlaceOrder}
      >
        {!canOrder
          ? availability.state === "closed"
            ? "Store closed"
            : "Orders paused"
          : quote.minOrderGap > 0
            ? `Add ₹${quote.minOrderGap} more to order`
            : `Place Order — ₹${total}`}
      </Button>
    </div>
  );
}
