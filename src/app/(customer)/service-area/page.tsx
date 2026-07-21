"use client";

import { useEffect, useState } from "react";
import { ServiceAreaMap } from "@/components/customer/service-area-map";
import { MapPin, CheckCircle2, XCircle, Loader2, Crosshair } from "lucide-react";

/**
 * Public "do we deliver to you?" page — shows the Atalmart delivery zone on a
 * map and lets the customer check their own location with one tap.
 */
type ContainsResult =
  | { in_service: true; sector: { id: string; name: string; pincode: string } }
  | {
      in_service: false;
      nearest?: { id: string; name: string; pincode: string; distance_m: number };
    };

export default function ServiceAreaPage() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ContainsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const checkMyLocation = () => {
    setError(null);
    setResult(null);

    if (!navigator.geolocation) {
      setError("Aapke phone me location support nahi hai");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Location ke liye HTTPS zaroori hai");
      return;
    }

    setChecking(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch("/api/geo/contains", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          const data = (await res.json()) as ContainsResult | { error: string };
          if (!res.ok || "error" in data) {
            setError("Abhi check nahi ho paya — thodi der baad try karein");
          } else {
            setResult(data);
          }
        } catch {
          setError("Network issue — thodi der baad try karein");
        } finally {
          setChecking(false);
        }
      },
      (err) => {
        setChecking(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission dein — browser ke 🔒 icon se allow karein"
            : "Location nahi mil paya — phir try karein",
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold text-brown">Hum yahan deliver karte hain</h1>
      <p className="text-[13px] text-gray-500 mt-1">
        Atal Nagar, Sector 21 se 29 tak — quick delivery, seedha aapke ghar.
      </p>

      {/* Delivery-zone map */}
      <div className="mt-4 h-[420px] rounded-xl border border-orange-100 shadow-sm overflow-hidden">
        <ServiceAreaMap className="h-full" />
      </div>

      {/* One-tap coverage check */}
      <section className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-[15px] font-bold text-brown flex items-center gap-2">
          <MapPin size={16} className="text-saffron" />
          Kya hum aapke ghar deliver karte hain?
        </h2>
        <p className="text-[12px] text-gray-500 mt-1">
          Ek tap mein pata karein ki aapka area hamari delivery range mein hai ya nahi.
        </p>

        <button
          onClick={checkMyLocation}
          disabled={checking}
          className="mt-3 w-full px-3 py-3 bg-saffron text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {checking ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Crosshair size={16} />
          )}
          {checking ? "Check kar rahe hain…" : "Meri location check karein"}
        </button>

        {error && (
          <p className="mt-3 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-2">
            {error}
          </p>
        )}

        {result && (
          <div
            className={`mt-3 px-3 py-3 rounded-xl border flex items-start gap-2 ${
              result.in_service
                ? "bg-green-50 border-green-200 text-indian-green"
                : "bg-orange-50 border-orange-200 text-saffron"
            }`}
          >
            {result.in_service ? (
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            ) : (
              <XCircle size={18} className="shrink-0 mt-0.5" />
            )}
            <div>
              {result.in_service ? (
                <>
                  <p className="font-bold text-[14px]">
                    Bahut badhiya! Hum yahan deliver karte hain 🎉
                  </p>
                  <p className="text-[12px] mt-0.5">
                    {result.sector.name} · Pincode {result.sector.pincode}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-[14px]">
                    Sorry, abhi hum yahan deliver nahi karte
                  </p>
                  <p className="text-[12px] mt-0.5">
                    Hum jaldi aur ilaakon tak pahunch rahe hain — bane rahiye!
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
