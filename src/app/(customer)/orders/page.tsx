"use client";

import Link from "next/link";
import { ArrowLeft, Package, ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OrderCardSkeleton } from "@/components/ui/skeleton";
import { useOrders } from "@/lib/hooks/use-orders";
import { useAuth } from "@/lib/hooks/use-auth";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

const statusVariant: Record<string, "green" | "saffron" | "gray" | "red"> = {
  delivered: "green",
  out_for_delivery: "saffron",
  placed: "gray",
  confirmed: "gray",
  picking: "saffron",
  picked: "saffron",
  cancelled: "red",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function OrdersPage() {
  const { orders, loading } = useOrders();
  const { user, isDemo } = useAuth();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="p-2 rounded-full hover:bg-saffron-light transition-colors"
        >
          <ArrowLeft size={20} className="text-brown" />
        </Link>
        <h1 className="text-xl font-bold text-brown">My Orders</h1>
      </div>

      {!isDemo && !user && (
        <div className="text-center py-16">
          <Package size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">Login to see your orders</p>
          <Link href="/auth" className="text-saffron hover:underline text-sm">
            Go to Login
          </Link>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      ) : orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-stretch bg-white rounded-2xl border border-gray-100 hover:border-saffron/30 transition-colors overflow-hidden"
            >
              <Link
                href={`/track/${order.id}`}
                className="flex items-center gap-4 flex-1 min-w-0 p-4"
              >
                <div className="w-11 h-11 bg-saffron-light rounded-xl flex items-center justify-center shrink-0">
                  <Package size={20} className="text-saffron" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-brown">
                      #{order.id.slice(0, 8)}
                    </span>
                    <Badge variant={statusVariant[order.status] || "gray"}>
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    {order.items?.length || 0} items &middot; ₹{order.total} &middot;{" "}
                    {formatDate(order.placed_at)}
                  </p>
                </div>
                <ChevronRight size={18} className="text-gray-400 shrink-0" />
              </Link>
              <a
                href={`/invoice/${order.id}`}
                target="_blank"
                rel="noopener"
                title="View invoice"
                aria-label="View invoice"
                className="border-l border-gray-100 px-3 flex items-center justify-center text-gray-400 hover:text-saffron hover:bg-saffron-light/30 transition-colors"
              >
                <FileText size={16} />
              </a>
            </div>
          ))}
        </div>
      ) : (
        (user || isDemo) && (
          <div className="text-center py-16">
            <Package size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No orders yet</p>
            <Link href="/" className="text-saffron hover:underline text-sm mt-2 inline-block">
              Start shopping
            </Link>
          </div>
        )
      )}
    </div>
  );
}
