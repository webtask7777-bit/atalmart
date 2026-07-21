"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, MapPin, CheckCircle2, XCircle, Crosshair } from "lucide-react";

/**
 * PinDropPicker — interactive map for choosing a delivery point. Built on the
 * same Leaflet + OSM stack as service-area-map.tsx; this one is INTERACTIVE
 * (clicks move the pin, "Use my location" geolocates, value bubbles up to the
 * parent form). Service-area validation hits /api/geo/contains after every
 * pin move with a debounce.
 *
 * Type collision avoidance: rider-map.tsx already declares `window.L`
 * globally with its own minimal `LeafletNS`; we cannot redeclare it with a
 * different shape, so we access `L` via a local cast.
 */

type PDMap = {
  setView: (latlng: [number, number], zoom: number) => PDMap;
  on: (event: string, handler: (e: { latlng: { lat: number; lng: number } }) => void) => void;
  off: (event: string) => void;
  remove: () => void;
  invalidateSize: () => void;
};
type PDLayer = { addTo: (map: PDMap) => PDLayer; remove?: () => void };
type PDGeoLayer = PDLayer & { getBounds: () => unknown };
type PDMarker = PDLayer & {
  setLatLng: (latlng: [number, number]) => void;
  setIcon: (icon: unknown) => void;
};
type PDLeaflet = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => PDMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => PDLayer;
  geoJSON: (data: unknown, opts?: Record<string, unknown>) => PDGeoLayer;
  marker: (latlng: [number, number], opts?: Record<string, unknown>) => PDMarker;
  divIcon: (opts: Record<string, unknown>) => unknown;
};

const CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let loadPromise: Promise<PDLeaflet> | null = null;
function loadLeaflet(): Promise<PDLeaflet> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  const winL = (window as unknown as { L?: PDLeaflet }).L;
  if (winL) return Promise.resolve(winL);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS_URL;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = JS_URL;
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { L?: PDLeaflet }).L;
      if (loaded) resolve(loaded);
      else reject(new Error("L missing"));
    };
    script.onerror = () => reject(new Error("Leaflet load failed"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

type ContainsResult =
  | { in_service: true; sector: { id: string; name: string; pincode: string } }
  | {
      in_service: false;
      nearest?: { id: string; name: string; pincode: string; distance_m: number };
    };

function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission deny ki — browser ke address bar ke 🔒 icon se allow kar dijiye";
    case err.POSITION_UNAVAILABLE:
      return "Location nahi mil paya — phir try karein ya map pe tap karke pin set karein";
    case err.TIMEOUT:
      return "Location lene me time lag gaya — phir try karein ya map pe tap karke pin set karein";
    default:
      return err.message || "Location nahi mil paya";
  }
}

export interface PinDropPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (latLng: { lat: number; lng: number }) => void;
  /** Optional callback fired with the service-area check result. */
  onValidate?: (r: ContainsResult) => void;
  className?: string;
  /** Default center if no value yet. Defaults to Naya Raipur central. */
  defaultCenter?: { lat: number; lng: number };
  /** Default zoom. Defaults to 14 (sector-level). */
  defaultZoom?: number;
  /**
   * On mount, automatically try to fill the pin from device location when
   * no `value` is yet set. Browser permission rules still apply — we use
   * the Permissions API to skip the prompt if it's already denied.
   * Default: true.
   */
  autoLocate?: boolean;
}

const DEFAULT_CENTER = { lat: 21.155, lng: 81.78 };

export function PinDropPicker({
  value,
  onChange,
  onValidate,
  className = "",
  defaultCenter = DEFAULT_CENTER,
  defaultZoom = 14,
  autoLocate = true,
}: PinDropPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<PDMap | null>(null);
  const markerRef = useRef<PDMarker | null>(null);
  const LRef = useRef<PDLeaflet | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ContainsResult | null>(null);
  const [locating, setLocating] = useState(false);

  // Pin marker icon — a teardrop with saffron fill.
  const makeMarkerIcon = useCallback(() => {
    const L = LRef.current;
    if (!L) return null;
    return L.divIcon({
      html: `<div style="position:relative;width:32px;height:42px;transform:translate(-16px,-42px);"><div style="position:absolute;top:0;left:0;width:32px;height:32px;background:#FF6B00;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(255,107,0,0.4);"></div><div style="position:absolute;top:7px;left:9px;width:14px;height:14px;background:#fff;border-radius:50%;"></div></div>`,
      className: "",
      iconSize: [32, 42],
      iconAnchor: [0, 0],
    });
  }, []);

  // Mount the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadLeaflet()
      .then(async (L) => {
        if (cancelled || !containerRef.current) return;
        LRef.current = L;

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const center: [number, number] = value
          ? [value.lat, value.lng]
          : [defaultCenter.lat, defaultCenter.lng];
        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: false,
        }).setView(center, defaultZoom);
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        // Service-area overlay (read-only). Best-effort — if the fetch fails
        // we still let the user drop a pin.
        try {
          const r = await fetch("/api/geo/sectors");
          if (r.ok) {
            const data = await r.json();
            L.geoJSON(data, {
              style: () => ({
                color: "#FF6B00",
                weight: 1.5,
                opacity: 0.7,
                fillColor: "#FF6B00",
                fillOpacity: 0.1,
              }),
            }).addTo(map);
          }
        } catch {
          // Silent — overlay is decorative.
        }

        // Drop the initial pin if a value already exists.
        if (value) {
          const icon = makeMarkerIcon();
          markerRef.current = L.marker([value.lat, value.lng], icon ? { icon } : {});
          markerRef.current.addTo(map);
        }

        map.on("click", (e) => {
          const { lat, lng } = e.latlng;
          if (!markerRef.current && LRef.current) {
            const icon = makeMarkerIcon();
            markerRef.current = LRef.current.marker([lat, lng], icon ? { icon } : {});
            markerRef.current.addTo(map);
          } else if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          }
          onChange({ lat, lng });
        });

        // Recompute size in case the modal wasn't fully visible at mount time.
        setTimeout(() => map.invalidateSize(), 100);
        setMapReady(true);
      })
      .catch(() => {
        /* surface inline via mapReady=false guard */
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // Intentionally not depending on `value` — the map is mounted once.
    // Changes to value are handled by the separate sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCenter.lat, defaultCenter.lng, defaultZoom]);

  // Sync marker position when value changes externally (e.g. geolocation).
  useEffect(() => {
    if (!mapReady || !LRef.current || !mapRef.current) return;
    if (!value) return;
    if (!markerRef.current) {
      const icon = makeMarkerIcon();
      markerRef.current = LRef.current.marker(
        [value.lat, value.lng],
        icon ? { icon } : {},
      );
      markerRef.current.addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
    mapRef.current.setView([value.lat, value.lng], defaultZoom);
  }, [value, mapReady, defaultZoom, makeMarkerIcon]);

  // Service-area validation on every value change, debounced.
  useEffect(() => {
    if (!value) {
      setResult(null);
      return;
    }
    const handle = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/geo/contains", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        });
        if (res.ok) {
          const r = (await res.json()) as ContainsResult;
          setResult(r);
          onValidate?.(r);
        }
      } catch {
        // Network error — stay silent, user can still save.
      } finally {
        setChecking(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [value, onValidate]);

  const [geoError, setGeoError] = useState<string | null>(null);

  const useMyLocation = useCallback(
    (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setGeoError(null);

      if (!navigator.geolocation) {
        if (!silent) setGeoError("Browser me location support nahi hai");
        return;
      }
      // Geolocation requires a secure context (HTTPS or localhost). On http://
      // production hosts the browser silently fails — call out the reason so
      // the user doesn't blame the button.
      if (typeof window !== "undefined" && !window.isSecureContext) {
        if (!silent)
          setGeoError("Location abhi use nahi kar sakte — neeche map par tap karke pin set karein.");
        return;
      }

      setLocating(true);

      // Two-pass: try high-accuracy first (GPS — slow on desktop). If it
      // fails with timeout or position-unavailable, fall back to low-accuracy
      // (wifi/IP). This dramatically improves success rate inside browsers /
      // iframes where GPS is blocked.
      const success = (pos: GeolocationPosition) => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      };
      const tryLowAccuracy = () => {
        navigator.geolocation.getCurrentPosition(
          success,
          (err) => {
            setLocating(false);
            if (!silent) setGeoError(geoErrorMessage(err));
          },
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
        );
      };

      navigator.geolocation.getCurrentPosition(
        success,
        (err) => {
          // PERMISSION_DENIED — no point retrying.
          if (err.code === err.PERMISSION_DENIED) {
            setLocating(false);
            if (!silent) setGeoError(geoErrorMessage(err));
            return;
          }
          // Timeout / unavailable — retry without GPS demand.
          tryLowAccuracy();
        },
        { enableHighAccuracy: true, timeout: 6_000 },
      );
    },
    [onChange],
  );

  // Auto-fill the pin from device location on first mount when no value is
  // set yet. We probe the Permissions API first — if location is already
  // denied, skip the silent attempt so we don't spam an error banner.
  // If permission state is "granted" or "prompt", we kick off geolocation;
  // the browser handles the prompt UI as needed.
  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (!autoLocate || autoTriedRef.current || value) return;
    autoTriedRef.current = true;

    const fire = () => useMyLocation({ silent: true });

    // Permissions API is best-effort; fall back to a direct attempt if it's
    // unavailable or rejects (iOS Safari historically lacked navigator.permissions).
    type PermNavigator = Navigator & {
      permissions?: {
        query: (d: { name: PermissionName }) => Promise<PermissionStatus>;
      };
    };
    const perms = (navigator as PermNavigator).permissions;
    if (!perms || typeof perms.query !== "function") {
      fire();
      return;
    }
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "denied") return; // user already refused; respect it
        fire();
      })
      .catch(() => fire());
    // We only ever run this once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="relative h-64 rounded-xl border border-gray-200 overflow-hidden bg-gray-100">
        <div ref={containerRef} className="absolute inset-0" />
        <button
          type="button"
          onClick={() => useMyLocation()}
          disabled={locating}
          className="absolute top-2 right-2 z-[400] bg-white shadow-md px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-brown flex items-center gap-1 disabled:opacity-50"
        >
          {locating ? <Loader2 size={12} className="animate-spin" /> : <Crosshair size={12} className="text-saffron" />}
          {locating ? "Locating…" : "Use my location"}
        </button>
        {!value && (
          <div className="absolute bottom-2 left-2 z-[400] bg-white/95 shadow-md px-2.5 py-1.5 rounded-lg text-[11px] text-brown flex items-center gap-1.5 pointer-events-none">
            <MapPin size={12} className="text-saffron" />
            Map pe tap karein
          </div>
        )}
      </div>

      {value && (
        <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
          <span>
            📍 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </span>
          {checking && (
            <span className="flex items-center gap-1 text-gray-400">
              <Loader2 size={10} className="animate-spin" /> Checking…
            </span>
          )}
        </div>
      )}

      {geoError && (
        <div className="flex items-start gap-1.5 text-[11px] px-2 py-1.5 rounded-md border bg-red-50 border-red-200 text-red-700">
          <XCircle size={12} className="shrink-0 mt-0.5" />
          <span>{geoError}</span>
        </div>
      )}

      {result && !checking && (
        <div
          className={`flex items-start gap-1.5 text-[11px] px-2 py-1.5 rounded-md border ${
            result.in_service
              ? "bg-green-50 border-green-200 text-indian-green"
              : "bg-orange-50 border-orange-200 text-saffron"
          }`}
        >
          {result.in_service ? (
            <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
          ) : (
            <XCircle size={12} className="shrink-0 mt-0.5" />
          )}
          <span>
            {result.in_service
              ? `Hum yahan deliver karte hain — ${result.sector.name}`
              : "Abhi hum is location par deliver nahi karte"}
          </span>
        </div>
      )}
    </div>
  );
}
