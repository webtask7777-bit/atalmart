"use client";

import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { useWishlistStore } from "@/lib/store/wishlist";
import { useProducts } from "@/lib/hooks/use-products";
import { ProductCard } from "@/components/customer/product-card";
import { Button } from "@/components/ui/button";

export default function WishlistPage() {
  const ids = useWishlistStore((s) => s.ids);
  const clear = useWishlistStore((s) => s.clear);
  const { products, loading } = useProducts();

  const wishProducts = products.filter((p) => ids.includes(p.id));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-32 md:pb-12">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-full hover:bg-gray-50">
            <ArrowLeft size={20} className="text-brown" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-brown">My Wishlist</h1>
            <p className="text-xs text-gray-500">
              {wishProducts.length} {wishProducts.length === 1 ? "item" : "items"} saved
            </p>
          </div>
        </div>
        {wishProducts.length > 0 && (
          <button
            onClick={clear}
            className="text-sm text-red-500 hover:text-red-700 font-medium"
          >
            Clear All
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-gray-100 aspect-[3/4] rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : wishProducts.length === 0 ? (
        <div className="text-center py-16">
          <Heart size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-brown font-bold mb-1">No saved items yet</p>
          <p className="text-sm text-gray-500 mb-6">
            Tap the ♡ on any product to save it for later
          </p>
          <Link href="/">
            <Button>Start Shopping</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {wishProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
