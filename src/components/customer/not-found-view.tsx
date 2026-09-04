import Link from "next/link";
import { Home, Search, PackageSearch, Phone } from "lucide-react";

/**
 * Branded 404 body. Rendered by app/not-found.tsx (unmatched URLs, root
 * layout only) and app/(customer)/not-found.tsx (notFound() inside the
 * storefront, with header/footer around it).
 */
export function NotFoundView() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <p className="text-6xl mb-4" aria-hidden="true">
        📦
      </p>
      <p className="text-xs font-bold tracking-widest text-saffron uppercase">
        Error 404
      </p>
      <h1 className="text-2xl font-bold text-brown mt-2">
        Yeh page nahi mila
      </h1>
      <p className="text-sm text-gray-500 mt-2">
        Link galat ho sakta hai ya yeh product ab available nahi hai. Groceries
        ab bhi Naya Raipur mein quick delivery ke saath mil rahi hain.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 py-3 bg-saffron text-white font-bold rounded-xl hover:bg-orange-600 transition-colors"
        >
          <Home size={16} />
          Home
        </Link>
        <Link
          href="/?search="
          className="flex items-center justify-center gap-2 py-3 border-2 border-saffron/30 bg-saffron-light text-saffron font-semibold rounded-xl hover:bg-orange-100 transition-colors"
        >
          <Search size={16} />
          Search products
        </Link>
        <Link
          href="/orders"
          className="flex items-center justify-center gap-2 py-3 border border-gray-200 text-brown font-semibold rounded-xl hover:border-saffron transition-colors"
        >
          <PackageSearch size={16} />
          My orders
        </Link>
        <Link
          href="/contact"
          className="flex items-center justify-center gap-2 py-3 border border-gray-200 text-brown font-semibold rounded-xl hover:border-saffron transition-colors"
        >
          <Phone size={16} />
          Contact us
        </Link>
      </div>
    </div>
  );
}
