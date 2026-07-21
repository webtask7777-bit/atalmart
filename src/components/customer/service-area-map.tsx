"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ServiceAreaMap — renders Atalmart's service-area polygon set on OSM tiles.
 *
 * Data flow: GET /api/geo/sectors → GeoJSON FeatureCollection → Leaflet polygons.
 *
 * Designed as the visualisation primitive for the Naya Raipur geo backbone.
 * Other apps (future) can import the same `/api/geo/sectors` endpoint or
 * lift this component into a shared package.
 */

// Local Leaflet typings (component-scoped to avoid colliding with
// rider-map.tsx's own minimal typings). Both files share `window.L` at
// runtime — that's fine; TypeScript just can't have two `declare global`
// blocks define the same Window property with different types, so this
// file accesses L by casting at the use site.
type SAMap = {
  setView: (latlng: [number, number], zoom: number) => SAMap;
  fitBounds: (bounds: unknown, opts?: Record<string, unknown>) => void;
  remove: () => void;
};
type SALayer = { addTo: (map: SAMap) => SALayer };
type SAGeoLayer = SALayer & { getBounds: () => unknown };
type SALeaflet = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => SAMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => SALayer;
  geoJSON: (data: unknown, opts?: Record<string, unknown>) => SAGeoLayer;
  divIcon: (opts: Record<string, unknown>) => unknown;
  marker: (latlng: [number, number], opts?: Record<string, unknown>) => SALayer;
};

const CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let loadPromise: Promise<SALeaflet> | null = null;

function loadLeaflet(): Promise<SALeaflet> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  const winL = (window as unknown as { L?: SALeaflet }).L;
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
      const loaded = (window as unknown as { L?: SALeaflet }).L;
      if (loaded) resolve(loaded);
      else reject(new Error("L missing"));
    };
    script.onerror = () => reject(new Error("Leaflet load failed"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

interface SectorFeature {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    name_hi: string | null;
    pincode: string;
    area_type: string;
    centroid: [number, number]; // [lng, lat]
    source: string | null;
  };
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

interface FeatureCollection {
  type: "FeatureCollection";
  features: SectorFeature[];
}

export interface ServiceAreaMapProps {
  className?: string;
  /** Show centroid labels (sector names). Default: true. */
  showLabels?: boolean;
  /** Override polygon fill color. */
  fillColor?: string;
}

export function ServiceAreaMap({
  className = "",
  showLabels = true,
  fillColor = "#FF6B00",
}: ServiceAreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<SAMap | null>(null);
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch service-area data once.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo/sectors")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as FeatureCollection;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the Leaflet map when both Leaflet and data are ready.
  useEffect(() => {
    if (!containerRef.current || !data) return;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: false,
          scrollWheelZoom: false,
        }).setView([21.155, 81.78], 13);
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        const layer = L.geoJSON(data, {
          style: () => ({
            color: fillColor,
            weight: 2,
            opacity: 0.85,
            fillColor,
            fillOpacity: 0.18,
          }),
        });
        layer.addTo(map);

        if (showLabels) {
          for (const f of data.features) {
            const [lng, lat] = f.properties.centroid;
            const icon = L.divIcon({
              html: `<span style="font-size:11px;font-weight:700;color:#5C2C0C;background:rgba(255,255,255,0.85);padding:2px 6px;border-radius:6px;border:1px solid rgba(255,107,0,0.4);white-space:nowrap;">${f.properties.name}</span>`,
              className: "",
              iconSize: [60, 18],
              iconAnchor: [30, 9],
            });
            L.marker([lat, lng], { icon }).addTo(map);
          }
        }

        try {
          map.fitBounds(layer.getBounds(), { padding: [30, 30] });
        } catch {
          // ignore — single-feature fallback already covered by setView
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err));
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [data, fillColor, showLabels]);

  return (
    <div className={`relative w-full ${className}`}>
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50 text-xs text-red-600 p-4 text-center">
          Service area load nahi ho paya: {error}
        </div>
      )}
      <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden bg-gray-100" />
    </div>
  );
}
