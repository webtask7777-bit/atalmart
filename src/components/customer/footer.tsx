import Link from "next/link";
import {
  APP_NAME,
  INCORPORATION_DATE,
  FSSAI_LICENSE,
  GSTIN,
  SUPPORT_EMAIL,
} from "@/lib/constants";
import { Logo } from "@/components/ui/logo";

export function Footer() {
  return (
    <footer className="bg-brown text-cream mt-auto">
      {/* Mobile: bottom padding only needs to clear the persistent BottomNav
          (45px). The cart-bar is a floating/transient overlay (shown only when
          the cart has items) and is allowed to float over the footer, so we
          don't reserve space for it. Content: brand, copyright/incorporation. */}
      <div className="md:hidden px-4 py-6 pb-20 space-y-4">
        {/* Brand + coverage link */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Logo onDark className="text-base" />
          </div>
          <Link
            href="/service-area"
            className="text-saffron hover:underline text-[11px] font-medium shrink-0 mt-0.5"
          >
            Coverage map
          </Link>
        </div>

        {/* Company / legal links */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-gray-700 pt-4">
          {[
            ["Delivery areas", "/delivery"],
            ["About", "/about"],
            ["Contact", "/contact"],
            ["FAQs", "/faq"],
            ["Refunds", "/refund-policy"],
            ["Terms", "/terms"],
            ["Privacy", "/privacy"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-[11px] text-gray-400 hover:text-saffron transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Copyright / Legal info — compact, muted */}
        <div className="space-y-1 border-t border-gray-700 pt-4">
          <p className="text-center text-[10px] text-gray-400 leading-snug">
            &copy; {new Date().getFullYear()} {APP_NAME}
          </p>
          <p className="text-center text-[10px] text-gray-400 leading-snug">
            Incorporated {INCORPORATION_DATE}
          </p>
          {(FSSAI_LICENSE || GSTIN) && (
            <p className="text-center text-[10px] text-gray-400 leading-snug">
              {FSSAI_LICENSE && <>FSSAI Lic. No. {FSSAI_LICENSE}</>}
              {FSSAI_LICENSE && GSTIN && " · "}
              {GSTIN && <>GSTIN {GSTIN}</>}
            </p>
          )}
        </div>
      </div>

      {/* Desktop: full 3-column footer */}
      <div className="hidden md:block max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Logo onDark className="text-2xl" />
            </div>
            <p className="text-sm text-gray-300">
              Atal Nagar ka apna quick delivery app. Groceries, dairy,
              snacks aur essentials — seedha aapke darwaze pe.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold text-saffron mb-3">Quick Links</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>
                <Link href="/" className="hover:text-saffron transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/orders"
                  className="hover:text-saffron transition-colors"
                >
                  My Orders
                </Link>
              </li>
              <li>
                <Link
                  href="/cart"
                  className="hover:text-saffron transition-colors"
                >
                  Cart
                </Link>
              </li>
              <li>
                <Link
                  href="/service-area"
                  className="hover:text-saffron transition-colors"
                >
                  Coverage map
                </Link>
              </li>
              <li>
                <Link href="/delivery" className="hover:text-saffron transition-colors">
                  Delivery areas (sector-wise)
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-saffron mb-3">Company</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>
                <Link href="/about" className="hover:text-saffron transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-saffron transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-saffron transition-colors">
                  FAQs
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="hover:text-saffron transition-colors">
                  Cancellation &amp; Refunds
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-saffron transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-saffron transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-8 pt-6 text-center text-xs text-gray-400">
          Sector 27, Atal Nagar-Nava Raipur, Chhattisgarh 492101 ·{" "}
          <span className="text-saffron">{SUPPORT_EMAIL}</span>
          <br className="sm:hidden" />
          <span className="hidden sm:inline"> · </span>
          &copy; {new Date().getFullYear()} {APP_NAME} · Incorporated{" "}
          {INCORPORATION_DATE} · Made with ❤️ in Atal Nagar.
          {(FSSAI_LICENSE || GSTIN) && (
            <p className="mt-1">
              {FSSAI_LICENSE && <>FSSAI Lic. No. {FSSAI_LICENSE}</>}
              {FSSAI_LICENSE && GSTIN && " · "}
              {GSTIN && <>GSTIN {GSTIN}</>}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
