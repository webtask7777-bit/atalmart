"use client";

import { useEffect, useRef } from "react";
import { STORE_LOCATION } from "@/lib/constants";

interface RiderMapProps {
  /** Rider current position (live). Falls back to a path point if missing. */
  rider?: { lat: number | null; lng: number | null } | null;
  /** Customer drop-off coordinates. */
  destination?: { lat: number | null; lng: number | null } | null;
  /** Hide loading shimmer when true. */
  className?: string;
}

type LeafletNS = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => LeafletLayer;
  marker: (latlng: [number, number], opts?: Record<string, unknown>) => LeafletMarker;
  polyline: (latlngs: [number, number][], opts?: Record<string, unknown>) => LeafletLayer;
  divIcon: (opts: Record<string, unknown>) => unknown;
  latLngBounds: (corners: [number, number][]) => unknown;
};
type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  fitBounds: (bounds: unknown, opts?: Record<string, unknown>) => void;
  remove: () => void;
};
type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer };
type LeafletMarker = LeafletLayer & {
  setLatLng: (latlng: [number, number]) => void;
};

declare global {
  interface Window {
    L?: LeafletNS;
  }
}

const CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let loadPromise: Promise<LeafletNS> | null = null;

function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.L) return Promise.resolve(window.L);
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
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error("L missing")));
    script.onerror = () => reject(new Error("Leaflet load failed"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function RiderMap({ rider, destination, className = "" }: RiderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const riderMarkerRef = useRef<LeafletMarker | null>(null);

  const riderLat = rider?.lat ?? null;
  const riderLng = rider?.lng ?? null;
  const destLat = destination?.lat ?? STORE_LOCATION.lat;
  const destLng = destination?.lng ?? STORE_LOCATION.lng;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        // Destroy if hot-reloaded
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const center: [number, number] = [destLat, destLng];
        const map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView(center, 14);
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        // Destination marker
        const destIcon = L.divIcon({
          html: `<div style="width:34px;height:34px;background:#138808;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.2);color:#fff;font-size:18px;">📍</div>`,
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([destLat, destLng], { icon: destIcon }).addTo(map);

        // Rider marker — if we have lat/lng
        if (riderLat != null && riderLng != null) {
          const riderIcon = L.divIcon({
            html: `<div style="width:36px;height:36px;background:#FF6B00;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,107,0,0.4);font-size:18px;animation:pulse 2s infinite;">🛵</div>`,
            className: "",
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
          const marker = L.marker([riderLat, riderLng], { icon: riderIcon });
          marker.addTo(map);
          riderMarkerRef.current = marker;

          // Path between rider and destination
          L.polyline(
            [
              [riderLat, riderLng],
              [destLat, destLng],
            ],
            { color: "#FF6B00", weight: 3, dashArray: "8 6", opacity: 0.85 },
          ).addTo(map);

          map.fitBounds(
            L.latLngBounds([
              [riderLat, riderLng],
              [destLat, destLng],
            ]),
            { padding: [40, 40], maxZoom: 16 },
          );
        }
      })
      .catch((err) => console.warn("[map]", err));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destLat, destLng]);

  // Update or lazily create rider marker without remounting map
  useEffect(() => {
    if (riderLat == null || riderLng == null) return;
    const map = mapRef.current;
    if (!map) return;

    // Marker already exists — just move it
    if (riderMarkerRef.current) {
      riderMarkerRef.current.setLatLng([riderLat, riderLng]);
      return;
    }

    // Marker doesn't exist yet (rider appeared after map mounted) — create now
    const L = window.L;
    if (!L) return;
    const riderIcon = L.divIcon({
      html: `<div style="width:36px;height:36px;background:#FF6B00;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,107,0,0.4);font-size:18px;">🛵</div>`,
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    const marker = L.marker([riderLat, riderLng], { icon: riderIcon });
    marker.addTo(map);
    riderMarkerRef.current = marker;

    // Draw path to destination
    L.polyline(
      [
        [riderLat, riderLng],
        [destLat, destLng],
      ],
      { color: "#FF6B00", weight: 3, dashArray: "8 6", opacity: 0.85 },
    ).addTo(map);

    map.fitBounds(
      L.latLngBounds([
        [riderLat, riderLng],
        [destLat, destLng],
      ]),
      { padding: [40, 40], maxZoom: 16 },
    );
  }, [riderLat, riderLng, destLat, destLng]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="h-48 md:h-64 w-full rounded-2xl overflow-hidden border border-gray-200 bg-gray-100"
        style={{ touchAction: "manipulation" }}
      />
      {riderLat == null && (
        <div className="absolute inset-x-0 bottom-0 mx-3 mb-3 bg-white/95 backdrop-blur rounded-xl px-3 py-2 text-[11px] font-medium text-brown-light shadow">
          Waiting for rider location…
        </div>
      )}
    </div>
  );
}
