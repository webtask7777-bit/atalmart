"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Download, Upload, Link as LinkIcon, Search, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { demoCategories, loadAllDemoProducts } from "@/lib/demo-products";
import type { Product } from "@/types";
import { toast } from "sonner";

type SaveResult = {
  ok: boolean;
  productId?: string;
  path?: string;
  origBytes?: number;
  webpBytes?: number;
  reductionPct?: number;
  error?: string;
};

export default function ImageDownloaderPage() {
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [mode, setMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<SaveResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Lazy-load the whole catalogue on mount. Admin tool, no SSR pressure.
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  useEffect(() => {
    loadAllDemoProducts().then(setAllProducts);
  }, []);

  const categoriesById = useMemo(
    () => Object.fromEntries(demoCategories.map((c) => [c.id, c])),
    []
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allProducts
      .filter(
        (p) =>
          !q ||
          p.id.includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.name_hi.includes(search.trim())
      )
      .slice(0, 60);
  }, [search, allProducts]);

  const selectedProduct = productId
    ? allProducts.find((p) => p.id === productId) ?? null
    : null;

  const setPickedFile = (f: File | null) => {
    setFile(f);
    if (f) {
      const u = URL.createObjectURL(f);
      setPreviewUrl(u);
    } else if (mode === "file") {
      setPreviewUrl(null);
    }
  };

  const onUrlBlur = () => {
    if (mode === "url" && url.trim()) setPreviewUrl(url.trim());
  };

  const reset = () => {
    setUrl("");
    setFile(null);
    setPreviewUrl(null);
  };

  const onSave = async () => {
    if (!productId) {
      toast.error("Pehle product select karo");
      return;
    }
    if (mode === "url" && !url.trim()) {
      toast.error("Image URL daalo");
      return;
    }
    if (mode === "file" && !file) {
      toast.error("File select karo");
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("productId", productId);
      if (mode === "file" && file) fd.append("file", file);
      if (mode === "url") fd.append("url", url.trim());

      const res = await fetch("/api/admin/save-product-image", {
        method: "POST",
        body: fd,
      });
      const data: SaveResult = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");

      toast.success(
        `Saved ${data.productId} — ${(data.webpBytes! / 1024).toFixed(1)} KB (-${data.reductionPct}%)`
      );
      setRecent((r) => [data, ...r].slice(0, 10));
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brown">Image Downloader</h1>
        <p className="text-sm text-gray-500 mt-1">
          Brand site se image URL paste karo, ya browser se &quot;Save As&quot; karke file
          drag karo. Auto WebP + sahi filename + old PNG delete.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Product picker */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="font-semibold text-brown mb-3">1. Product select karo</h2>
          <div className="relative mb-3">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search by name / id (e.g. Cadbury, p80)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-saffron"
            />
          </div>

          <div className="max-h-96 overflow-y-auto -mx-2 px-2 space-y-1">
            {filteredProducts.map((p) => {
              const active = productId === p.id;
              const hasImage = !!p.image_url;
              const isWebp = p.image_url?.endsWith(".webp");
              return (
                <button
                  key={p.id}
                  onClick={() => setProductId(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                    active
                      ? "bg-saffron-light border-2 border-saffron"
                      : "border-2 border-transparent hover:bg-gray-50"
                  }`}
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                    {hasImage ? (
                      <Image
                        src={p.image_url!}
                        alt=""
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-gray-400">📦</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-brown truncate">
                      {p.name}{" "}
                      <span className="text-xs text-gray-400">({p.id})</span>
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {categoriesById[p.category_id]?.icon}{" "}
                      {categoriesById[p.category_id]?.name} • {p.unit}
                    </p>
                  </div>
                  {isWebp ? (
                    <span className="text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      WEBP
                    </span>
                  ) : hasImage ? (
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      PNG
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                      EMPTY
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Source + Preview */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="font-semibold text-brown mb-3">2. Image source</h2>

          <div className="flex gap-2 mb-3 p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setMode("url")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition ${
                mode === "url"
                  ? "bg-white text-brown shadow-sm"
                  : "text-gray-500 hover:text-brown"
              }`}
            >
              <LinkIcon size={14} /> URL paste
            </button>
            <button
              onClick={() => setMode("file")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition ${
                mode === "file"
                  ? "bg-white text-brown shadow-sm"
                  : "text-gray-500 hover:text-brown"
              }`}
            >
              <Upload size={14} /> File upload
            </button>
          </div>

          {mode === "url" ? (
            <Input
              label="Image URL (right-click → Copy image address)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={onUrlBlur}
              placeholder="https://brand.com/.../product.png"
            />
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f && f.type.startsWith("image/")) setPickedFile(f);
                else toast.error("Image file drop karo");
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition ${
                dragOver
                  ? "border-saffron bg-saffron-light/40"
                  : "border-gray-300 hover:border-saffron hover:bg-saffron-light/30"
              }`}
            >
              <Upload className="mx-auto mb-2 text-gray-400" size={28} />
              <p className="text-sm text-brown font-medium">
                Drop image or click to browse
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {file ? file.name : "PNG, JPG, WebP — max 10MB"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => setPickedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-brown mb-2">3. Preview</h3>
            <div className="aspect-square w-full max-w-xs mx-auto bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="preview"
                  className="w-full h-full object-contain"
                  onError={() => toast.error("Preview load nahi hua")}
                />
              ) : (
                <span className="text-gray-300 text-sm">No image yet</span>
              )}
            </div>
          </div>

          <Button
            className="w-full mt-4"
            loading={saving}
            onClick={onSave}
            disabled={!productId || (!url.trim() && !file)}
          >
            <Download size={16} />
            {selectedProduct
              ? `Save as ${selectedProduct.id}.webp`
              : "Save as WebP"}
          </Button>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="font-semibold text-brown mb-3">Recent saves</h2>
          <div className="space-y-2">
            {recent.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 text-sm"
              >
                {r.ok ? (
                  <Check size={16} className="text-green-600 shrink-0" />
                ) : (
                  <X size={16} className="text-red-500 shrink-0" />
                )}
                <span className="font-mono font-semibold text-brown">
                  {r.productId}
                </span>
                {r.ok ? (
                  <>
                    <span className="text-gray-500">{r.path}</span>
                    <span className="text-xs text-gray-400">
                      {(r.origBytes! / 1024).toFixed(1)} KB →{" "}
                      {(r.webpBytes! / 1024).toFixed(1)} KB
                    </span>
                    <span className="ml-auto text-xs font-medium text-green-600">
                      -{r.reductionPct}%
                    </span>
                  </>
                ) : (
                  <span className="text-red-500">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
