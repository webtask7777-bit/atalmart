"use client";

import { useState } from "react";
import { Tag, X, Check, ChevronRight } from "lucide-react";
import {
  calculateCouponDiscount,
  validateCoupon,
  type Coupon,
} from "@/lib/constants";
import { useCouponStore, useCouponCatalog } from "@/lib/store/coupon";
import { useCartStore } from "@/lib/store/cart";
import { useOrders } from "@/lib/hooks/use-orders";
import { useUserPincodeStore } from "@/lib/store/user-pincode";
import { toast } from "sonner";

export function CouponInput() {
  const subtotal = useCartStore((s) => s.getTotal());
  const { applied, apply, clear, myUsage } = useCouponStore();
  const coupons = useCouponCatalog((s) => s.coupons);
  const { orders } = useOrders();
  const pincode = useUserPincodeStore((s) => s.pincode);
  const [code, setCode] = useState("");
  const [showList, setShowList] = useState(false);

  /** Build the validation context — used by both submit and the list view. */
  const buildContext = (couponCode: string) => ({
    subtotal,
    userOrderCount: orders.length,
    userCouponUsage: myUsage[couponCode] || 0,
    pincode: pincode || undefined,
  });

  const tryApply = (found: Coupon) => {
    const result = validateCoupon(found, buildContext(found.code));
    if (!result.valid) {
      toast.error(`${found.code}: ${result.reason}`);
      return false;
    }
    apply(found);
    toast.success(
      `${found.code} applied — ₹${calculateCouponDiscount(found, subtotal)} off`,
    );
    return true;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = coupons.find(
      (c) => c.code.toUpperCase() === code.trim().toUpperCase(),
    );
    if (!found) {
      toast.error("Invalid coupon code");
      return;
    }
    if (tryApply(found)) setCode("");
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag size={16} className="text-saffron" />
        <h3 className="text-sm font-bold text-brown">Apply Coupon</h3>
      </div>

      {applied ? (
        <AppliedBanner coupon={applied} subtotal={subtotal} onRemove={clear} />
      ) : (
        <>
          <form onSubmit={submit} className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium uppercase tracking-wide placeholder:normal-case placeholder:text-gray-400 focus:outline-none focus:border-saffron"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="px-4 py-2 bg-saffron text-white text-sm font-bold rounded-xl hover:bg-saffron-dark disabled:opacity-50 transition-colors"
            >
              Apply
            </button>
          </form>

          <button
            type="button"
            onClick={() => setShowList((s) => !s)}
            className="mt-3 flex items-center justify-between w-full text-left text-sm text-saffron font-semibold"
          >
            <span>View available coupons</span>
            <ChevronRight
              size={14}
              className={`transition-transform ${showList ? "rotate-90" : ""}`}
            />
          </button>

          {showList && (
            <div className="mt-3 space-y-2">
              {coupons.map((c) => {
                const check = validateCoupon(c, buildContext(c.code));
                const eligible = check.valid;
                const reason = check.valid ? null : check.reason;
                return (
                  <button
                    key={c.code}
                    onClick={() => tryApply(c)}
                    className={`w-full text-left p-3 rounded-xl border-2 border-dashed flex items-start gap-3 transition-colors ${
                      eligible
                        ? "border-indian-green/30 bg-green-light/40 hover:bg-green-light"
                        : "border-gray-200 bg-gray-50 opacity-70"
                    }`}
                  >
                    <div className="shrink-0 w-9 h-9 bg-white rounded-lg flex items-center justify-center">
                      <Tag size={14} className="text-indian-green" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-brown font-mono">{c.code}</p>
                      <p className="text-xs text-brown-light">{c.description}</p>
                      {reason && (
                        <p className="text-[11px] text-orange-600 font-semibold mt-1">
                          {reason}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AppliedBanner({
  coupon,
  subtotal,
  onRemove,
}: {
  coupon: Coupon;
  subtotal: number;
  onRemove: () => void;
}) {
  const discount = calculateCouponDiscount(coupon, subtotal);
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-green-light border border-indian-green/20">
      <div className="shrink-0 w-9 h-9 bg-indian-green rounded-lg flex items-center justify-center">
        <Check size={16} className="text-white" strokeWidth={3} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-brown font-mono">{coupon.code}</p>
        <p className="text-xs text-indian-green font-semibold">
          ₹{discount} off applied
        </p>
      </div>
      <button
        onClick={onRemove}
        aria-label="remove coupon"
        className="p-1.5 hover:bg-white rounded-lg transition-colors"
      >
        <X size={14} className="text-brown-light" />
      </button>
    </div>
  );
}
