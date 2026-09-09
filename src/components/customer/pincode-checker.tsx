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
  Bell,
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
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Precise area label resolved from a location lookup (e.g. "Sector 24, Atal
  // Nagar"). Cleared on manual typing so the header doesn't show a stale sector.
  const [detectedArea, setDetectedArea] = useState<string | null>(null);
  const autoTriedRef = useRef(false);
  // True only when the 6 digits came from the user (typing or tapping a
  // pincode chip). A geolocation fill can land on the *nearest* sector when
  // the user is outside the zone, so we never auto-advance on that path —
  // they must tap "Aage badhein" themselves.
  const userEnteredRef = useRef(false);

  // "Notify me when you launch here" (shown on a non-serviceable pincode)
  const [notifyContact, setNotifyContact] = useState("");
  const [notifyState, setNotifyState] = useState<
    { status: "idle" } | { status: "sending" } | { status: "done" } | { status: "error"; message: string }
  >({ status: "idle" });

  const serviceableList = useMemo(
    () => Array.from(parseServiceablePincodes(settings.serviceablePincodes)),
    [settings.serviceablePincodes],
  );

  const pickPincode = (pin: string) => {
    userEnteredRef.current = true;
    setDetectedArea(null);
    setNotifyState({ status: "idle" });
    setInput(pin);
  };

  // Live-check: derived from the input, re-evaluated as the user types.
  const result = useMemo<CheckResult>(() => {
    const cleaned = input.replace(/\D/g, "").slice(0, 6);
    if (cleaned.length !== 6) return { status: "idle" };
    if (isServiceablePincode(cleaned, settings.serviceablePincodes)) {
      return {
        status: "valid",
        pincode: cleaned,
        area: PINCODE_AREA_LABELS[cleaned],
      };
    }
    return { status: "invalid", pincode: cleaned };
  }, [input, settings.serviceablePincodes]);

  const handleContinue = () => {
    if (result.status !== "valid") return;
    // Prefer the precise sector from a location lookup; fall back to the
    // generic pincode area label for manually-typed pincodes.
    const area = detectedArea || result.area || null;
    setPincode(result.pincode, area);
    toast.success(`Welcome! ${area || result.pincode} mein deliver karenge`);
    onValidated?.(result.pincode);
  };

  // Auto-continue: a valid, user-entered pincode advances on its own after a
  // short beat (long enough to read "Yahan deliver karte hain"). Typing again
  // cancels it. Modal only — inline forms have their own submit affordance.
  const AUTO_ADVANCE_MS = 1100;
  useEffect(() => {
    if (variant !== "modal") return;
    if (result.status !== "valid" || !userEnteredRef.current) return;
    const id = setTimeout(handleContinue, AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, variant]);

  const submitNotify = async () => {
    if (result.status !== "invalid") return;
    const contact = notifyContact.trim();
    if (!contact) {
      setNotifyState({ status: "error", message: "Phone number ya email daalein" });
      return;
    }
    setNotifyState({ status: "sending" });
    try {
      const res = await fetch("/api/expansion/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pincode: result.pincode, contact }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 400 carries a user-facing validation message; anything else is
        // ours to own, so don't surface raw server errors.
        setNotifyState({
          status: "error",
          message:
            res.status === 400 && data?.error
              ? data.error
              : "Abhi save nahi hua — thodi der baad try karein",
        });
        return;
      }
      setNotifyState({ status: "done" });
    } catch {
      setNotifyState({
        status: "error",
        message: "Network issue — thodi der baad try karein",
      });
    }
  };

  // Geolocate → /api/geo/contains → fill the pincode field with the matched
  // (or nearest) sector's pincode. Errors surface inline, never a toast — the
  // user can always type a pincode manually.
  const locateMe = async (opts?: { silent?: boolean }) => {
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
        userEnteredRef.current = false; // never auto-advance a geo fill
        setNotifyState({ status: "idle" });
        setInput(pin); // result is derived from input
        finish();
      } else {
        finish("Aap hamare delivery area se kaafi door hain");
      }
    } catch (err) {
      const e = err as GeolocationPositionError;
      finish(e && "code" in e ? geoErrorMessage(e) : "Location nahi mil paya");
    }
  };

  // Auto-fill from geolocation when the modal first opens AND no pincode is
  // typed yet — but ONLY if the browser already has permission. Prompting for
  // location on page load (before the user tapped anything) is penalised by
  // Chrome/Lighthouse and most people deny a cold prompt, which then blocks
  // the "Use my current location" button too. First-time users tap the
  // button; the prompt is tied to that gesture.
  useEffect(() => {
    if (autoTriedRef.current || input) return;
    autoTriedRef.current = true;
    type PermNavigator = Navigator & {
      permissions?: {
        query: (d: { name: PermissionName }) => Promise<PermissionStatus>;
      };
    };
    const perms = (navigator as PermNavigator).permissions;
    if (!perms || typeof perms.query !== "function") return;
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "granted") locateMe({ silent: true });
      })
      .catch(() => {
        /* no Permissions API → wait for the button */
      });
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
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
        />
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus={autofocus}
          value={input}
          onChange={(e) => {
            userEnteredRef.current = true;
            setInput(e.target.value.replace(/\D/g, ""));
            setDetectedArea(null); // manual edit → drop the location-derived sector
            setNotifyState({ status: "idle" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && result.status === "valid") {
              e.preventDefault();
              handleContinue();
            }
          }}
          placeholder="6-digit pincode daalein"
          className="w-full pl-9 pr-3 py-3 text-base font-mono tracking-wider bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-saffron focus:bg-white transition-colors"
        />
      </div>

      {/* Use my location — auto-fills the pincode from device geolocation */}
      <button
        type="button"
        onClick={() => locateMe()}
        disabled={locating}
        className="mt-2 w-full flex items-center justify-center gap-2 py-2 border-2 border-saffron/30 bg-saffron-light text-saffron-deep font-semibold text-sm rounded-xl hover:bg-orange-100 disabled:opacity-60 transition-colors"
      >
        {locating ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Location le rahe hain…
          </>
        ) : (
          <>
            <Crosshair size={14} />
            Meri location use karo
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
                Yes! Yahan deliver karte hain ✨
              </p>
              {result.area && (
                <p className="text-xs text-green-700 mt-0.5">{result.area}</p>
              )}
            </div>
          </div>
        )}
        {result.status === "invalid" && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-2">
              <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-red-700">Sorry — yahan abhi nahi 😔</p>
                <p className="text-xs text-red-600 mt-0.5">
                  Atalmart abhi sirf Naya Raipur mein deliver karta hai. Hum
                  jaldi expand karenge!
                </p>
              </div>
            </div>

            {/* Notify-me capture — demand signal for where to expand next */}
            {notifyState.status === "done" ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-indian-green bg-green-light border border-green-200 rounded-lg px-2.5 py-2">
                <CheckCircle2 size={14} className="shrink-0" />
                Done! {result.pincode} mein launch hote hi batayenge 🙌
              </p>
            ) : (
              <form
                className="mt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitNotify();
                }}
              >
                <label
                  htmlFor="expansion-notify-contact"
                  className="flex items-center gap-1.5 text-xs font-semibold text-brown"
                >
                  <Bell size={13} className="text-saffron" />
                  Yahan launch ho to batayein?
                </label>
                <div className="mt-1.5 flex gap-1.5">
                  <input
                    id="expansion-notify-contact"
                    type="text"
                    inputMode="email"
                    autoComplete="tel"
                    value={notifyContact}
                    onChange={(e) => {
                      setNotifyContact(e.target.value);
                      if (notifyState.status === "error") setNotifyState({ status: "idle" });
                    }}
                    placeholder="WhatsApp number ya email"
                    className="min-w-0 flex-1 px-3 py-2 text-sm bg-white border-2 border-gray-200 rounded-lg focus:outline-none focus:border-saffron transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={notifyState.status === "sending"}
                    className="shrink-0 px-3 py-2 text-xs font-bold text-white bg-saffron rounded-lg hover:bg-orange-600 disabled:opacity-60 transition-colors"
                  >
                    {notifyState.status === "sending" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      "Batao"
                    )}
                  </button>
                </div>
                {notifyState.status === "error" && (
                  <p className="mt-1.5 text-[11px] text-red-700">{notifyState.message}</p>
                )}
              </form>
            )}
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
            Aage badhein
            <ArrowRight size={16} />
          </button>
          <button
            onClick={dismissPrompt}
            className="mt-2 w-full text-xs text-gray-500 hover:text-brown py-2"
          >
            Abhi browse karo, pincode baad mein
          </button>
        </>
      )}

      {/* Serviceable pincodes — tap one to fill the field */}
      <div className="mt-3 text-center">
        <p className="text-[11px] text-gray-500">Ye pincodes serve karte hain:</p>
        <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
          {serviceableList.map((pin) => {
            const active = input === pin;
            return (
              <button
                key={pin}
                type="button"
                onClick={() => pickPincode(pin)}
                aria-pressed={active}
                className={`font-mono text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  active
                    ? "bg-saffron text-white border-saffron"
                    : "bg-gray-50 text-brown border-gray-200 hover:border-saffron hover:bg-saffron-light"
                }`}
              >
                {pin}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact badge for the header. Shows current pincode + "change" link, or
 * a "Pincode set karo" CTA when none stored.
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
        <p className="text-[9px] uppercase tracking-wider text-gray-500 leading-none">
          {pincode ? "Deliver to" : "Delivery pincode"}
        </p>
        <p className="text-xs font-semibold text-brown truncate leading-tight mt-0.5">
          {pincode ? area || pincode : "Pincode set karo"}
        </p>
      </div>
    </button>
  );
}
