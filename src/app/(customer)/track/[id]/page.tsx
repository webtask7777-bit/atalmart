"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Phone,
  MapPin,
  Navigation,
  Package,
  XCircle,
  Download,
  RotateCcw,
} from "lucide-react";
import { useOrder } from "@/lib/hooks/use-orders";
import { updateOrderStatus, requestReturn } from "@/lib/hooks/use-admin";
import { useLiveOrderTracking } from "@/lib/hooks/use-live-tracking";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_LABELS_HI,
  CANCEL_REASONS,
  RETURN_REASONS,
  RETURN_WINDOW_HOURS,
  isWithinReturnWindow,
} from "@/lib/constants";
import type { OrderStatus } from "@/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { RiderMap } from "@/components/customer/rider-map";
import { toast } from "sonner";

const STATUS_FLOW: OrderStatus[] = [
  "placed",
  "confirmed",
  "picking",
  "picked",
  "out_for_delivery",
  "delivered",
];

export default function TrackOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { order, loading } = useOrder(id);
  const live = useLiveOrderTracking(order);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  /** Map of order_item_id → qty being returned (0 = not selected). */
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const currentStatus: OrderStatus = live.status;
  const eta = live.etaMins;
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);
  const isCancelled = currentStatus === "cancelled";
  // Allow cancel only before rider picks up
  const canCancel = ["placed", "confirmed", "picking"].includes(currentStatus);
  const isDelivered = currentStatus === "delivered";
  // Return available only after delivery, within window, and not already requested
  const canRequestReturn =
    isDelivered &&
    isWithinReturnWindow(order?.delivered_at) &&
    !["return_requested", "return_approved", "return_rejected", "refunded"].includes(
      currentStatus,
    );

  const handleCancel = async () => {
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }
    setCancelling(true);
    const { error } = await updateOrderStatus(id, "cancelled");
    setCancelling(false);
    if (error) {
      toast.error("Cancellation failed");
    } else {
      toast.success("Order cancelled");
      setCancelOpen(false);
      location.reload();
    }
  };

  const openInvoice = () => {
    if (!order) return;
    window.open(`/invoice/${order.id}?print=1`, "_blank");
  };

  const handleRequestReturn = async () => {
    if (!returnReason) {
      toast.error("Please select a reason");
      return;
    }
    const items = (order?.items || [])
      .filter((it) => (returnQty[it.id] || 0) > 0)
      .map((it) => ({
        order_item_id: it.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: Math.min(returnQty[it.id] || 0, it.quantity),
        unit_price: it.price,
      }));
    if (items.length === 0) {
      toast.error("Select at least 1 item to return");
      return;
    }
    setReturnSubmitting(true);
    const { error } = await requestReturn(id, returnReason, items, returnNotes);
    setReturnSubmitting(false);
    if (error) {
      toast.error("Failed to submit return request");
    } else {
      const refundTotal = items.reduce(
        (s, it) => s + it.quantity * it.unit_price,
        0,
      );
      toast.success(
        `Return submitted — ₹${refundTotal} refund pending review`,
      );
      setReturnOpen(false);
      location.reload();
    }
  };

  /** Open the return modal and pre-fill all order items at qty 0. */
  const openReturnModal = () => {
    const initial: Record<string, number> = {};
    (order?.items || []).forEach((it) => {
      initial[it.id] = 0;
    });
    setReturnQty(initial);
    setReturnReason("");
    setReturnNotes("");
    setReturnOpen(true);
  };

  const returnTotal = (order?.items || []).reduce(
    (sum, it) => sum + (returnQty[it.id] || 0) * it.price,
    0,
  );
  const returnSelectedCount = (order?.items || []).filter(
    (it) => (returnQty[it.id] || 0) > 0,
  ).length;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/"
            className="p-2 rounded-full hover:bg-saffron-light transition-colors"
          >
            <ArrowLeft size={20} className="text-brown" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-brown">Track Order</h1>
            <p className="text-xs text-gray-500">Loading...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <span className="h-8 w-8 border-3 border-saffron border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/"
            className="p-2 rounded-full hover:bg-saffron-light transition-colors"
          >
            <ArrowLeft size={20} className="text-brown" />
          </Link>
          <h1 className="text-lg font-bold text-brown">Track Order</h1>
        </div>
        <div className="text-center py-16">
          <Package size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Order not found</p>
          <Link href="/orders" className="text-saffron hover:underline text-sm mt-2 inline-block">
            View all orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/orders"
          className="p-2 rounded-full hover:bg-saffron-light transition-colors"
        >
          <ArrowLeft size={20} className="text-brown" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-brown">Track Order</h1>
          <p className="text-xs text-gray-500">#{order.id.slice(0, 8)}</p>
        </div>
      </div>

      {isCancelled ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
          <p className="text-lg font-bold text-red-600">Order Cancelled</p>
          <p className="text-sm text-red-500 mt-1">This order has been cancelled.</p>
        </div>
      ) : currentStatus !== "delivered" ? (
        <div className="bg-gradient-to-r from-saffron to-orange-500 rounded-2xl p-5 text-white mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} />
            <span className="text-sm font-medium">Estimated Arrival</span>
          </div>
          <p className="text-3xl font-bold">
            {eta} {eta === 1 ? "minute" : "minutes"}
          </p>
          <p className="text-sm opacity-80 mt-1">
            {ORDER_STATUS_LABELS_HI[currentStatus]}
          </p>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-indian-green to-green-600 rounded-2xl p-5 text-white mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={24} />
            <div>
              <p className="text-xl font-bold">Delivered!</p>
              <p className="text-sm opacity-90">
                Order delivered successfully. Thank you!
              </p>
            </div>
          </div>
        </div>
      )}

      {!isCancelled && (
        <div className="mb-6">
          <RiderMap
            rider={
              live.riderLat != null && live.riderLng != null
                ? { lat: live.riderLat, lng: live.riderLng }
                : null
            }
            destination={{ lat: order.lat, lng: order.lng }}
          />
          <div className="mt-2 px-1 text-xs text-brown-light flex items-center justify-between">
            <span className="flex items-center gap-1">
              {live.riderLat != null ? (
                <>
                  <Navigation size={11} className="text-indian-green animate-pulse" />
                  <span className="font-medium text-indian-green">Live</span>
                  <span className="text-gray-400">
                    · updated just now
                  </span>
                </>
              ) : (
                <>
                  <MapPin size={11} className="text-saffron" />
                  Waiting for rider
                </>
              )}
            </span>
            {!isDelivered && (
              <span className="font-bold text-saffron tabular-nums">
                {live.remainingKm != null
                  ? `${live.remainingKm.toFixed(1)} km · ~${eta} min`
                  : `~${eta} min away`}
              </span>
            )}
          </div>
        </div>
      )}

      {!isCancelled && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
          <h3 className="font-bold text-brown mb-4">Order Status</h3>
          <div className="space-y-0">
            {STATUS_FLOW.map((status, i) => {
              const isCompleted = i <= currentIndex;
              const isCurrent = i === currentIndex;
              return (
                <div key={status} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {isCompleted ? (
                      <CheckCircle2
                        size={20}
                        className={`shrink-0 ${isCurrent ? "text-saffron" : "text-indian-green"}`}
                      />
                    ) : (
                      <Circle size={20} className="text-gray-300 shrink-0" />
                    )}
                    {i < STATUS_FLOW.length - 1 && (
                      <div
                        className={`w-0.5 h-8 ${isCompleted ? "bg-indian-green" : "bg-gray-200"}`}
                      />
                    )}
                  </div>
                  <div className={`pb-6 ${isCurrent ? "font-medium" : ""}`}>
                    <p
                      className={`text-sm ${isCompleted ? "text-brown" : "text-gray-400"}`}
                    >
                      {ORDER_STATUS_LABELS[status]}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-saffron mt-0.5">
                        {ORDER_STATUS_LABELS_HI[status]}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {order.items && order.items.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
          <h3 className="font-bold text-brown mb-3">Items</h3>
          <div className="space-y-2 text-sm">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-gray-600">
                <span>{item.product_name} x{item.quantity}</span>
                <span>₹{item.price * item.quantity}</span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2 flex justify-between font-medium text-brown">
              <span>Total</span>
              <span>₹{order.total}</span>
            </div>
          </div>
        </div>
      )}

      {order.address_line && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
          <h3 className="font-bold text-brown mb-2">Delivery Address</h3>
          <p className="text-sm text-gray-600">{order.address_line}</p>
        </div>
      )}

      {order.rider && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6">
          <h3 className="font-bold text-brown mb-3">Delivery Partner</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-saffron-light rounded-full flex items-center justify-center">
                <span className="text-lg">🛵</span>
              </div>
              <div>
                <p className="text-sm font-medium text-brown">{order.rider.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {order.rider.vehicle_number && (
                    <p className="text-xs text-gray-500">{order.rider.vehicle_number}</p>
                  )}
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indian-green bg-green-light px-1.5 py-0.5 rounded">
                    ⚡ EV
                  </span>
                </div>
              </div>
            </div>
            {order.rider.phone && (
              <a
                href={`tel:${order.rider.phone}`}
                className="p-2.5 bg-indian-green text-white rounded-full hover:bg-green-700 transition-colors"
              >
                <Phone size={16} />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {currentStatus !== "placed" && (
          <button
            onClick={openInvoice}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-gray-200 text-brown font-semibold rounded-xl hover:border-saffron hover:text-saffron transition-colors"
          >
            <Download size={16} />
            Download Invoice
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => setCancelOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-colors"
          >
            <XCircle size={16} />
            Cancel Order
          </button>
        )}
        {canRequestReturn && (
          <button
            onClick={openReturnModal}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-orange-200 text-orange-600 font-semibold rounded-xl hover:bg-orange-50 transition-colors"
          >
            <RotateCcw size={16} />
            Request Return
            <span className="text-[11px] font-normal text-orange-400">
              · within {RETURN_WINDOW_HOURS}h of delivery
            </span>
          </button>
        )}

        {/* Return status banner (after request submitted) */}
        {order?.return_info && currentStatus === "return_requested" && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-amber-800">
              Return request submitted
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Reason: <b>{order.return_info.reason}</b>
            </p>
            {order.return_info.items && order.return_info.items.length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-200">
                <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
                  Items being returned
                </p>
                <ul className="text-xs text-amber-800 mt-1 space-y-0.5">
                  {order.return_info.items.map((it) => (
                    <li key={it.order_item_id}>
                      • {it.product_name} × {it.quantity} = ₹
                      {it.quantity * it.unit_price}
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-bold text-amber-800 mt-2">
                  Refund pending: ₹{order.return_info.refund_amount || 0}
                </p>
              </div>
            )}
            <p className="text-[11px] text-amber-600 mt-2">
              We&apos;ll review and respond within 24 hours via WhatsApp + this page.
            </p>
          </div>
        )}
        {currentStatus === "return_approved" && order?.return_info && (
          <div className="bg-green-light border-2 border-green-300 rounded-2xl p-4">
            <p className="text-sm font-bold text-indian-green">
              ✓ Return approved &amp; refund credited
            </p>
            <p className="text-xs text-green-700 mt-1">
              ₹{order.return_info.refund_amount || order.total} credited to your{" "}
              <Link href="/wallet" className="underline font-semibold">
                Atalmart Wallet
              </Link>{" "}
              — auto-applies on your next order.
            </p>
          </div>
        )}
        {currentStatus === "return_rejected" && order?.return_info && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-red-700">
              ✗ Return request not approved
            </p>
            <p className="text-xs text-red-600 mt-1">
              {order.return_info.rejection_reason ||
                "Please contact support for details."}
            </p>
          </div>
        )}
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel order?"
      >
        <div className="space-y-4">
          <p className="text-sm text-brown-light">
            Choose a reason so we can improve. Your refund (if any) will be initiated immediately.
          </p>
          <div className="space-y-2">
            {CANCEL_REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  reason === r ? "border-red-400 bg-red-50" : "border-gray-200"
                }`}
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  value={r}
                  checked={reason === r}
                  onChange={(e) => setReason(e.target.value)}
                  className="accent-red-500"
                />
                <span className="text-sm text-brown font-medium">{r}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setCancelOpen(false)}
            >
              Keep order
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={cancelling}
              onClick={handleCancel}
            >
              Confirm cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Return request modal */}
      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Request return"
      >
        <div className="space-y-4">
          <p className="text-sm text-brown-light">
            Pick which item(s) you want to return. Refund will be credited to
            your wallet within 24 hours of approval.
          </p>

          {/* Per-item picker */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Items to return
            </p>
            <div className="space-y-2">
              {(order.items || []).map((it) => {
                const qty = returnQty[it.id] || 0;
                const selected = qty > 0;
                return (
                  <div
                    key={it.id}
                    className={`p-3 rounded-xl border-2 transition-colors ${
                      selected
                        ? "border-orange-400 bg-orange-50"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) =>
                          setReturnQty((q) => ({
                            ...q,
                            [it.id]: e.target.checked ? it.quantity : 0,
                          }))
                        }
                        className="accent-orange-500 mt-1 w-4 h-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brown">
                          {it.product_name}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          ₹{it.price} × {it.quantity} ordered = ₹
                          {it.price * it.quantity}
                        </p>
                      </div>
                      {selected && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setReturnQty((q) => ({
                                ...q,
                                [it.id]: Math.max(1, (q[it.id] || 1) - 1),
                              }))
                            }
                            disabled={qty <= 1}
                            className="w-7 h-7 rounded-full border border-orange-300 text-orange-600 font-bold hover:bg-orange-100 disabled:opacity-40"
                            aria-label="Decrease"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-bold text-brown tabular-nums">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setReturnQty((q) => ({
                                ...q,
                                [it.id]: Math.min(
                                  it.quantity,
                                  (q[it.id] || 0) + 1,
                                ),
                              }))
                            }
                            disabled={qty >= it.quantity}
                            className="w-7 h-7 rounded-full border border-orange-300 text-orange-600 font-bold hover:bg-orange-100 disabled:opacity-40"
                            aria-label="Increase"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                    {selected && (
                      <p className="text-xs text-orange-700 mt-1.5 pl-6">
                        Returning {qty} of {it.quantity} → refund ₹
                        {qty * it.price}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Running refund total */}
          <div className="bg-saffron-light/50 border-2 border-orange-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-orange-600 font-bold">
                Refund amount
              </p>
              <p className="text-2xl font-bold text-saffron tabular-nums">
                ₹{returnTotal}
              </p>
            </div>
            <p className="text-[11px] text-orange-700 max-w-[140px] text-right">
              {returnSelectedCount === 0
                ? "Select item(s) above"
                : `${returnSelectedCount} item${returnSelectedCount === 1 ? "" : "s"} → wallet on approval`}
            </p>
          </div>

          {/* Reason */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Reason
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
              {RETURN_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-colors ${
                    returnReason === r
                      ? "border-orange-400 bg-orange-50"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="return-reason"
                    value={r}
                    checked={returnReason === r}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="accent-orange-500"
                  />
                  <span className="text-sm text-brown font-medium">{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-brown-light mb-1.5 ml-1">
              Additional notes (optional)
            </label>
            <textarea
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="e.g. The atta packet was torn, flour spilled out…"
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setReturnOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={returnSubmitting}
              onClick={handleRequestReturn}
              disabled={returnSelectedCount === 0 || !returnReason}
            >
              Submit · ₹{returnTotal}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

