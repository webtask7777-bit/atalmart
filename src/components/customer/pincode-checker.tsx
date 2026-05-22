"use client";

import { useState, useEffect, useMemo } from "react";
import { MapPin, CheckCircle2, XCircle, ArrowRight, Search } from "lucide-react";
import {
  isServiceablePincode,
  PINCODE_AREA_LABELS,
  parseServiceablePincodes,
} from "@/lib/constants";
import {
  useUserPincodeStore,
  useUserPincodeHydrated,
} from "@/lib/store/user-pincode";
import { useSettings } from "@/lib/store/settings";
import { toast } from "sonner";

type CheckResult =
  | { status: "idle" }
  | { status: "valid"; pincode: string; area?: string }
  | { status: "invalid"; pincode: string };

/**
 * Floating modal that opens on first visit (when no pincode is stored) and
 * blocks the page until the customer enters a pincode. They can also dismiss
 * to browse without committing — checkout will still enforce.
 */
export function PincodeCheckerModal() {
  const hydrated = useUserPincodeHydrated();
  const pincode = useUserPincodeStore((s) => s.pincode);
  const promptDismissed = useUserPincodeStore((s) => s.promptDismissed);

  const shouldShow = hydrated && !pincode && !promptDismissed;

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        <PincodeCheckerForm
          variant="modal"
          title="Aap kahaan se order kar rahe hain?"
          subtitle="Atalmart abhi sirf Naya Raipur mein deliver karta hai. Apna pincode daalein."
          autofocus
        />
      </div>
    </div>
  );
}

/**
 * Reusable form. Pass `onValidated` to react after a successful check,
 * or `variant="inline"` to render without modal chrome.
 */
export function PincodeCheckerForm({
  variant = "inline",
  title,
  subtitle,
  autofocus,
  onValidated,
}: {
  variant?: "modal" | "inline";
  title?: string;
  subtitle?: string;
  autofocus?: boolean;
  onValidated?: (pincode: string) => void;
}) {
  const settings = useSettings();
  const storedPincode = useUserPincodeStore((s) => s.pincode);
  const setPincode = useUserPincodeStore((s) => s.setPincode);
  const dismissPrompt = useUserPincodeStore((s) => s.dismissPrompt);

  const [input, setInput] = useState(storedPincode || "");
  const [result, setResult] = useState<CheckResult>({ status: "idle" });

  const serviceableList = useMemo(
    () => Array.from(parseServiceablePincodes(settings.serviceablePincodes)),
    [settings.serviceablePincodes],
  );

  const check = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    if (cleaned.length !== 6) {
      setResult({ status: "idle" });
      return;
    }
    if (isServiceablePincode(cleaned, settings.serviceablePincodes)) {
      setResult({
        status: "valid",
        pincode: cleaned,
        area: PINCODE_AREA_LABELS[cleaned],
      });
    } else {
      setResult({ status: "invalid", pincode: cleaned });
    }
  };

  // Live-check as user types 6 digits
  useEffect(() => {
    check(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, settings.serviceablePincodes]);

  const handleContinue = () => {
    if (result.status !== "valid") return;
    setPincode(result.pincode);
    toast.success(
      `Welcome! Delivering to ${result.area || result.pincode}`,
    );
    onValidated?.(result.pincode);
  };

  return (
    <div className={variant === "modal" ? "p-6" : "p-4"}>
      {variant === "modal" && (
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-14 h-14 bg-saffron-light rounded-2xl flex items-center justify-center mb-3">
            <MapPin size={26} className="text-saffron" />
          </div>
          <h2 className="text-lg font-bold text-brown">
            {title || "Check delivery availability"}
          </h2>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1.5 max-w-xs">{subtitle}</p>
          )}
        </div>
      )}

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus={autofocus}
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && result.status === "valid") {
              e.preventDefault();
              handleContinue();
            }
          }}
          placeholder="Enter 6-digit pincode"
          className="w-full pl-9 pr-3 py-3 text-base font-mono tracking-wider bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-saffron focus:bg-white transition-colors"
        />
      </div>

      {/* Result */}
      <div className="mt-3 min-h-[44px]">
        {result.status === "valid" && (
          <div className="flex items-start gap-2 p-3 bg-green-light border border-green-200 rounded-xl">
            <CheckCircle2
              size={18}
              className="text-indian-green shrink-0 mt-0.5"
            />
            <div className="text-sm">
              <p className="font-bold text-indian-green">
                Yes! We deliver here ✨
              </p>
              {result.area && (
                <p className="text-xs text-green-700 mt-0.5">{result.area}</p>
              )}
            </div>
          </div>
        )}
        {result.status === "invalid" && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-red-700">Sorry — not yet here 😔</p>
              <p className="text-xs text-red-600 mt-0.5">
                Atalmart abhi sirf Naya Raipur mein deliver karta hai. Hum
                jaldi expand karenge!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Continue button (modal only) */}
      {variant === "modal" && (
        <>
          <button
            onClick={handleContinue}
            disabled={result.status !== "valid"}
            className="mt-2 w-full flex items-center justify-center gap-2 py-3 bg-saffron text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue
            <ArrowRight size={16} />
          </button>
          <button
            onClick={dismissPrompt}
            className="mt-2 w-full text-xs text-gray-500 hover:text-brown py-2"
          >
            Skip for now (browse only — checkout will still ask)
          </button>
        </>
      )}

      {/* Serviceable pincodes hint */}
      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed text-center">
        We currently serve pincodes:{" "}
        <span className="font-mono text-brown">
          {serviceableList.join(", ")}
        </span>
      </p>
    </div>
  );
}

/**
 * Compact badge for the header. Shows current pincode + "change" link, or
 * a "Set pincode" CTA when none stored.
 */
export function PincodeBadge() {
  const hydrated = useUserPincodeHydrated();
  const pincode = useUserPincodeStore((s) => s.pincode);
  const clearPincode = useUserPincodeStore((s) => s.clearPincode);
  const settings = useSettings();

  if (!hydrated) return null;

  const area = pincode ? PINCODE_AREA_LABELS[pincode] : null;
  const serviceable = pincode
    ? isServiceablePincode(pincode, settings.serviceablePincodes)
    : false;

  return (
    <button
      onClick={() => clearPincode()}
      className="flex items-center gap-1.5 max-w-[180px] text-left hover:bg-saffron-light rounded-lg px-2 py-1 -mx-2 transition-colors"
    >
      <MapPin
        size={14}
        className={serviceable ? "text-saffron" : "text-red-500"}
      />
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-gray-400 leading-none">
          {pincode ? "Deliver to" : "Set pincode"}
        </p>
        <p className="text-xs font-semibold text-brown truncate leading-tight mt-0.5">
          {pincode ? area || pincode : "Tap to choose"}
        </p>
      </div>
    </button>
  );
}
