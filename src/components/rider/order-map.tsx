"use client";

import { useEffect, useRef } from "react";

/**
 * Compact drop-location preview for a rider order card. Renders the delivery
 * destination as a pin on OSM tiles so the rider sees where to go without
 * leaving the app (the "Navigate" deep-link is supplementary and opens the
 * native maps app on a real device).
 *
 * Component-scoped Leaflet types to avoid colliding with the global window.L
 * declaration used by rider-map.tsx (same pattern as service-area-map.tsx).
 */

type RMap = {
  setView: (latlng: [number, number], zoom: number) => RMap;
  remove: () => void;
  invalidateSize: () => void;
};
type RLayer = { addTo: (m: RMap) => RLayer };
type RLeaflet = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => RMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => RLayer;
  marker: (latlng: [number, number], opts?: Record<string, unknown>) => RLayer;
  divIcon: (opts: Record<string, unknown>) => unknown;
};

const CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let loadPromise: Promise<RLeaflet> | null = null;
function loadLeaflet(): Promise<RLeaflet> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  const winL = (window as unknown as { L?: RLeaflet }).L;
  if (winL) return Promise.resolve(winL);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS_URL;
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = JS_URL;
    s.async = true;
    s.onload = () => {
      const l = (window as unknown as { L?: RLeaflet }).L;
      l ? resolve(l) : reject(new Error("L missing"));
    };
    s.onerror = () => reject(new Error("Leaflet load failed"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

export function OrderMap({
  lat,
  lng,
  className = "",
}: {
  lat: number;
  lng: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<RMap | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const map = L.map(ref.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: true,
          scrollWheelZoom: false,
        }).setView([lat, lng], 15);
        mapRef.current = map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);
        const icon = L.divIcon({
          html: `<div style="position:relative;width:28px;height:36px;transform:translate(-14px,-36px);"><div style="position:absolute;top:0;left:0;width:28px;height:28px;background:#138808;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,0.25);"></div><div style="position:absolute;top:6px;left:8px;width:12px;height:12px;background:#fff;border-radius:50%;"></div></div>`,
          className: "",
          iconSize: [28, 36],
          iconAnchor: [0, 0],
        });
        L.marker([lat, lng], { icon }).addTo(map);
        setTimeout(() => map.invalidateSize(), 100);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng]);

  return (
    <div
      ref={ref}
      className={`w-full h-32 rounded-xl overflow-hidden bg-gray-100 ${className}`}
    />
  );
}
