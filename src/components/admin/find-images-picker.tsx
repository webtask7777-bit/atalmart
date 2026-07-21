"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Check, X, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Client-side background-cleanliness check ─────────────────────────
// Same idea as the server-side passes_quality() in bulk-find-images.py but
// runs in the browser via Canvas so the operator gets a visual cue per
// candidate. Skips the network round-trip that a server-side check would
// need.
//
// Returns one of:
//   "clean"   — ≥75% border pixels are near-white (catalog packshot)
//   "mixed"   — 40-75% white border (product on a soft-coloured background)
//   "colored" — <40% white border (banner, lifestyle, promo art)
//   "unknown" — CORS blocked or load failed; degrade gracefully (no badge)
type BgQuality = "clean" | "mixed" | "colored" | "unknown";

async function scoreBackground(url: string): Promise<BgQuality> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w < 50 || h < 50) {
          resolve("unknown");
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("unknown");
          return;
        }
        ctx.drawImage(img, 0, 0);
        // Sample the four edges, step ~5% of the short side.
        const step = Math.max(4, Math.floor(Math.min(w, h) / 30));
        let total = 0;
        let white = 0;
        const sample = (x: number, y: number) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          total++;
          if (Math.min(d[0], d[1], d[2]) >= 220) white++;
        };
        for (let x = 0; x < w; x += step) {
          sample(x, 0);
          sample(x, h - 1);
        }
        for (let y = 0; y < h; y += step) {
          sample(0, y);
          sample(w - 1, y);
        }
        const pct = white / Math.max(1, total);
        if (pct >= 0.75) resolve("clean");
        else if (pct >= 0.4) resolve("mixed");
        else resolve("colored");
      } catch {
        // Likely SecurityError from CORS taint — Bing's image CDN doesn't
        // serve Access-Control-Allow-Origin for all images. No fault here,
        // just no quality signal.
        resolve("unknown");
      }
    };
    img.onerror = () => resolve("unknown");
    img.src = url;
  });
}

const BG_BADGE: Record<BgQuality, { color: string; title: string; emoji: string } | null> = {
  clean: { color: "bg-indian-green text-white", title: "Clean white background", emoji: "✓" },
  mixed: { color: "bg-yellow-400 text-yellow-900", title: "Mixed background — product may be on a soft colour", emoji: "~" },
  colored: { color: "bg-red-500 text-white", title: "Coloured background — likely a promo banner or lifestyle shot", emoji: "✗" },
  unknown: null,
};

/**
 * Image picker for admin product editing.
 *
 * Searches DuckDuckGo via /api/admin/find-images and shows ranked candidate
 * thumbnails — Blinkit, Zepto, JioMart, BigBasket, Amazon.in, brand-official
 * sites. The operator clicks the ones they want (first selected becomes
 * front-of-pack; additional become gallery angles) and hits Apply.
 *
 * Apply calls /api/admin/apply-product-images which downloads the files
 * server-side, uploads them to Supabase Storage at <product_id>/<role>-<sha>.<ext>,
 * and updates products.image_url + image_urls[].
 *
 * Why this is a picker and not auto-bulk: in practice the auto-pipeline
 * (scripts/bulk-find-images.py) returned the wrong variant ("Cerelac Mixed
 * Vegetables" → "Cerelac Khichdi with Vegetables & Ghee"), back-of-pack
 * instead of front, and promotional combo banners with "GREAT DEAL" badges
 * that passed the white-background quality gate. A human's 10-second
 * visual check is the right place for that judgment.
 */

interface Candidate {
  image: string;
  thumbnail: string;
  url: string;
  title: string;
  host: string;
  width: number;
  height: number;
  score: number;
  front_score: number;
}

interface FindImagesPickerProps {
  productId: string;
  productName: string;
  productUnit: string;
  /** Current FoP image, if any. Shown as a reference card at the top so
   *  the operator can see what's already set before picking replacements. */
  currentImageUrl?: string | null;
  onClose: () => void;
  /** Called after successful apply so the parent can refresh its view. */
  onApplied: (next: { image_url: string; image_urls: string[] }) => void;
  /**
   * Optional "Apply & next" hook: when provided, the picker shows an
   * additional button that, after a successful apply, advances to the
   * next missing-image product. Lets the operator burn through the
   * backlog without closing the modal between each SKU.
   */
  onApplyAndNext?: () => void;
}

export function FindImagesPicker({
  productId,
  productName,
  productUnit,
  currentImageUrl,
  onClose,
  onApplied,
  onApplyAndNext,
}: FindImagesPickerProps) {
  const initialQuery = [productName, productUnit].filter(Boolean).join(" ");
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  // Per-image background-quality cache so we don't re-score on every render.
  const [bgQuality, setBgQuality] = useState<Record<string, BgQuality>>({});
  const scoringRef = useRef<Set<string>>(new Set());

  const runSearch = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/admin/find-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: q, unit: "", limit: 18 }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSearchError(data.error || "Search failed");
        setCandidates([]);
      } else {
        setCandidates(data.candidates || []);
      }
    } catch (e) {
      setSearchError((e as Error).message);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
    // Reset selection on new search — old picks may not be in the new list.
    setSelected([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-search on open AND whenever the parent swaps in a new product
  // (the "Apply & next" flow changes productId/Name/Unit without unmounting).
  useEffect(() => {
    const q = [productName, productUnit].filter(Boolean).join(" ");
    setQuery(q);
    runSearch(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Background-quality scan — runs once per candidate URL. Bounded to ~4
  // concurrent loads so we don't hammer Bing's thumbnail CDN.
  useEffect(() => {
    let cancelled = false;
    let inFlight = 0;
    const queue = [...candidates].filter(
      (c) => !bgQuality[c.image] && !scoringRef.current.has(c.image),
    );
    const pump = () => {
      while (inFlight < 4 && queue.length > 0) {
        const c = queue.shift()!;
        scoringRef.current.add(c.image);
        inFlight++;
        scoreBackground(c.thumbnail || c.image).then((q) => {
          inFlight--;
          if (cancelled) return;
          setBgQuality((m) => ({ ...m, [c.image]: q }));
          pump();
        });
      }
    };
    pump();
    return () => {
      cancelled = true;
    };
  }, [candidates, bgQuality]);

  const toggleSelect = (url: string) => {
    setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : [...s, url]));
  };

  const moveSelection = (url: string, dir: -1 | 1) => {
    // Lets the operator reorder picks so the FoP they want lands at index 0.
    setSelected((s) => {
      const i = s.indexOf(url);
      if (i === -1) return s;
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = s.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  // `andNext: true` chains to the next missing-image product instead of
  // closing the picker. Used by the "Apply & next" button for batch flow.
  const apply = async (andNext = false) => {
    if (selected.length === 0) {
      toast.error("Pick at least one image");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/admin/apply-product-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, urls: selected }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error || "Apply failed");
        if (Array.isArray(data.failed) && data.failed.length > 0) {
          console.warn("[find-images] failed downloads:", data.failed);
        }
        return;
      }
      if (Array.isArray(data.failed) && data.failed.length > 0) {
        toast.success(
          `Applied ${data.uploaded} image${data.uploaded === 1 ? "" : "s"} (${data.failed.length} failed)`,
        );
      } else {
        toast.success(`Applied ${data.uploaded} image${data.uploaded === 1 ? "" : "s"}`);
      }
      onApplied({ image_url: data.image_url, image_urls: data.image_urls });
      if (andNext && onApplyAndNext) {
        // Parent will swap the productId/name/unit props; we reset local
        // picker state so the next product starts with a fresh search.
        setSelected([]);
        setCandidates([]);
        setBgQuality({});
        scoringRef.current = new Set();
        onApplyAndNext();
      } else {
        onClose();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Find product images"
      className="!max-w-5xl"
    >
      <div className="space-y-4">
        {/* Current image reference — visible at the top so the operator
            can compare what's already set vs. the new candidates. Helps
            decide whether to keep, replace, or augment with more angles. */}
        {currentImageUrl && (
          <div className="flex items-center gap-3 p-2 bg-gray-50 border border-gray-100 rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImageUrl}
              alt="Current FoP"
              className="w-14 h-14 object-contain rounded-lg bg-white border border-gray-200"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-brown">Currently set as FoP</div>
              <div className="text-[10px] text-gray-500 truncate">
                Picking + Apply will replace this image.
              </div>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Product name + size"
            />
          </div>
          <Button onClick={() => runSearch()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-1.5">Search</span>
          </Button>
        </div>

        {/* Error / empty states */}
        {searchError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
            {searchError}
          </div>
        )}
        {!loading && !searchError && candidates.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-8">
            No candidates yet. Try a more specific query (brand + product + size).
          </div>
        )}

        {/* Candidate grid */}
        {candidates.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {candidates.map((c) => {
              const idx = selected.indexOf(c.image);
              const isSelected = idx !== -1;
              const order = idx === 0 ? "FoP" : idx > 0 ? `#${idx + 1}` : "";
              const bgQ = bgQuality[c.image];
              const badge = bgQ ? BG_BADGE[bgQ] : null;
              return (
                <button
                  key={c.image}
                  type="button"
                  onClick={() => toggleSelect(c.image)}
                  className={`group relative rounded-xl border-2 overflow-hidden text-left transition ${
                    isSelected
                      ? "border-saffron ring-2 ring-saffron/30"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {/* Use a plain <img>; Next/Image needs domain config we don't have for DDG thumbs */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.thumbnail || c.image}
                    alt={c.title}
                    className="w-full aspect-square object-contain bg-gray-50"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                    }}
                  />
                  <div className="px-2 py-1.5 text-[10px] flex items-center justify-between gap-1 bg-white">
                    <span className="font-medium text-brown truncate">{c.host}</span>
                    <span className="text-gray-400 shrink-0">
                      {c.width}×{c.height}
                    </span>
                  </div>
                  {/* Background-quality badge (client-side check). Helps the
                      operator skip promo banners / coloured-bg shots before
                      they spend a click on them. */}
                  {badge && (
                    <div
                      title={badge.title}
                      className={`absolute top-2 left-2 ${badge.color} rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow`}
                    >
                      {badge.emoji}
                    </div>
                  )}
                  {/* Open the source page (amazon.in / blinkit / etc.) so
                      the operator can verify the product variant matches
                      before committing. Stops click propagation so the
                      candidate doesn't get selected when verifying. */}
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-9 right-2 bg-white text-gray-600 hover:text-saffron rounded-full w-6 h-6 flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                      title={`View source on ${c.host}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-saffron text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow">
                      {order}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Selection bar */}
        {selected.length > 0 && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="text-xs text-gray-600">
              Selected ({selected.length}) — first is front-of-pack; reorder with the arrows.
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.map((url, i) => {
                const c = candidates.find((x) => x.image === url);
                return (
                  <div key={url} className="flex items-center gap-1 bg-saffron-light rounded-lg pl-1 pr-2 py-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c?.thumbnail || url} alt="" className="w-8 h-8 object-contain rounded" />
                    <span className="text-[10px] font-medium text-brown">
                      {i === 0 ? "FoP" : `#${i + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveSelection(url, -1)}
                      disabled={i === 0}
                      className="text-gray-500 hover:text-brown disabled:opacity-30 text-xs px-0.5"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelection(url, 1)}
                      disabled={i === selected.length - 1}
                      className="text-gray-500 hover:text-brown disabled:opacity-30 text-xs px-0.5"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSelect(url)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <a
            href={`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-saffron flex items-center gap-1"
          >
            Open on DuckDuckGo <ExternalLink className="w-3 h-3" />
          </a>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={() => apply(false)} disabled={applying || selected.length === 0}>
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span className="ml-1.5">
                Apply {selected.length} image{selected.length === 1 ? "" : "s"}
              </span>
            </Button>
            {onApplyAndNext && (
              <Button
                variant="secondary"
                onClick={() => apply(true)}
                disabled={applying || selected.length === 0}
                title="Apply images, then jump to the next missing-image product"
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span className="ml-1.5">Apply &amp; next ›</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
