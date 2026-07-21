"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  MapPin,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Search,
  Crosshair,
  Loader2,
} from "lucide-react";
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

function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission deny ki — browser address bar pe 🔒 icon se allow karein";
    case err.POSITION_UNAVAILABLE:
      return "Location nahi mil paya — phir try karein ya manually pincode daalein";
    case err.TIMEOUT:
      return "Location lene me time lag gaya — phir try karein";
    default:
      return err.message || "Location nahi mil paya";
  }
}

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
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Precise area label resolved from a location lookup (e.g. "Sector 24, Atal
  // Nagar"). Cleared on manual typing so the header doesn't show a stale sector.
  const [detectedArea, setDetectedArea] = useState<string | null>(null);
  const autoTriedRef = useRef(false);

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
    // Prefer the precise sector from a location lookup; fall back to the
    // generic pincode area label for manually-typed pincodes.
    const area = detectedArea || result.area || null;
    setPincode(result.pincode, area);
    toast.success(`Welcome! Delivering to ${area || result.pincode}`);
    onValidated?.(result.pincode);
  };

  // Geolocate → /api/geo/contains → fill the pincode field with the matched
  // (or nearest) sector's pincode. Errors surface inline, never a toast — the
  // user can always type a pincode manually.
  const useMyLocation = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setGeoError(null);

    if (!navigator.geolocation) {
      if (!silent) setGeoError("Browser me location support nahi hai");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      if (!silent)
        setGeoError("Location abhi use nahi kar sakte — pincode manually daalein.");
      return;
    }

    setLocating(true);
    const finish = (msg?: string) => {
      setLocating(false);
      if (msg && !silent) setGeoError(msg);
    };

    const getPosition = (opts: PositionOptions) =>
      new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, opts),
      );

    try {
      let pos: GeolocationPosition;
      try {
        pos = await getPosition({ enableHighAccuracy: true, timeout: 6_000 });
      } catch (err) {
        const e = err as GeolocationPositionError;
        if (e.code === e.PERMISSION_DENIED) {
          finish(geoErrorMessage(e));
          return;
        }
        // Retry without GPS demand.
        pos = await getPosition({
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 60_000,
        });
      }

      const res = await fetch("/api/geo/contains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        finish("Location se area nahi mila — pincode khud daalein");
        return;
      }
      const pin: string | null =
        data?.sector?.pincode ?? data?.nearest?.pincode ?? null;
      const sectorName: string | null =
        data?.sector?.name ?? data?.nearest?.name ?? null;
      if (pin) {
        // Remember the precise sector (e.g. "Sector 24") so the header shows
        // it instead of the generic "Sector 21–29" pincode label.
        setDetectedArea(sectorName ?? null);
        setInput(pin); // live-check effect will run validation
        finish();
      } else {
        finish("Aap hamare delivery area se kaafi door hain");
      }
    } catch (err) {
      const e = err as GeolocationPositionError;
      finish(e && "code" in e ? geoErrorMessage(e) : "Location nahi mil paya");
    }
  };

  // Auto-attempt geolocation when the modal first opens AND no pincode is
  // typed yet. Permissions API gate so a previously denied user doesn't
  // re-trigger the silent flow.
  useEffect(() => {
    if (autoTriedRef.current || input) return;
    autoTriedRef.current = true;
    type PermNavigator = Navigator & {
      permissions?: {
        query: (d: { name: PermissionName }) => Promise<PermissionStatus>;
      };
    };
    const perms = (navigator as PermNavigator).permissions;
    const fire = () => useMyLocation({ silent: true });
    if (!perms || typeof perms.query !== "function") {
      fire();
      return;
    }
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "denied") return;
        fire();
      })
      .catch(() => fire());
    // We only ever run this once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          onChange={(e) => {
            setInput(e.target.value.replace(/\D/g, ""));
            setDetectedArea(null); // manual edit → drop the location-derived sector
          }}
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

      {/* Use my location — auto-fills the pincode from device geolocation */}
      <button
        type="button"
        onClick={() => useMyLocation()}
        disabled={locating}
        className="mt-2 w-full flex items-center justify-center gap-2 py-2 border-2 border-saffron/30 bg-saffron-light text-saffron font-semibold text-sm rounded-xl hover:bg-orange-100 disabled:opacity-60 transition-colors"
      >
        {locating ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Location le rahe hain…
          </>
        ) : (
          <>
            <Crosshair size={14} />
            Use my current location
          </>
        )}
      </button>

      {geoError && (
        <p className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
          {geoError}
        </p>
      )}

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
