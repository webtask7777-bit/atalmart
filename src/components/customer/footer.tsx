import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="bg-brown text-cream mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-saffron rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">A</span>
              </div>
              <span className="text-xl font-bold text-saffron">{APP_NAME}</span>
            </div>
            <p className="text-sm text-gray-300">
              Atal Nagar ka apna 10-minute delivery app. Groceries, dairy,
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
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-saffron mb-3">Contact</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>Sector 21, Atal Nagar</li>
              <li>Naya Raipur, Chhattisgarh</li>
              <li className="text-saffron">support@atalmart.in</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-8 pt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} {APP_NAME}. Made with ❤️ in Atal
          Nagar.
        </div>
      </div>
    </footer>
  );
}
