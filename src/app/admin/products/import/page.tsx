"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  X,
  Eye,
} from "lucide-react";
import { upsertDemoProducts } from "@/lib/store/demo-products";
import { isDemoMode } from "@/lib/supabase/helpers";
import { createProduct, updateProduct } from "@/lib/hooks/use-products";
import { useAllProducts } from "@/lib/hooks/use-products";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Product } from "@/types";

interface ParsedRow {
  rowNumber: number;
  sku: string;
  name: string;
  name_hi: string;
  category: string;
  category_id: string;
  price: number;
  mrp: number;
  unit: string;
  stock: number;
  description: string;
  active: boolean;
}

interface ParseError {
  rowNumber: number;
  field: string;
  message: string;
}

type ParseResult =
  | { rows: ParsedRow[]; errors: ParseError[]; totalParsed: number }
  | { error: string };

export default function BulkImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const { products: existingProducts, refetch } = useAllProducts();

  const existingIds = new Set(existingProducts.map((p) => p.id));

  const handleFile = async (f: File) => {
    setFile(f);
    setResult(null);
    setParsing(true);

    const formData = new FormData();
    formData.append("file", f);

    try {
      const res = await fetch("/api/admin/parse-products-excel", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as ParseResult;
      setResult(data);
      if ("error" in data) {
        toast.error(data.error);
      } else if (data.errors.length > 0) {
        toast.warning(
          `Parsed ${data.totalParsed} rows · ${data.errors.length} errors found`,
        );
      } else {
        toast.success(`Parsed ${data.totalParsed} products successfully`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setResult({ error: msg });
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!result || "error" in result) return;
    if (result.rows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setImporting(true);

    const products: Product[] = result.rows.map((r) => ({
      id: r.sku,
      name: r.name,
      name_hi: r.name_hi,
      description: r.description || null,
      category_id: r.category_id,
      price: r.price,
      mrp: r.mrp,
      unit: r.unit,
      image_url: null,
      stock: r.stock,
      active: r.active,
      created_at: new Date().toISOString(),
    }));

    if (isDemoMode()) {
      const summary = upsertDemoProducts(products);
      toast.success(
        `Imported ${products.length} products — ${summary.created} new, ${summary.updated} updated`,
      );
      await refetch();
      // Reset and offer to import more
      setFile(null);
      setResult(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      // Supabase path — insert/update per row
      let created = 0;
      let updated = 0;
      let failed = 0;
      for (const p of products) {
        if (existingIds.has(p.id)) {
          const { error } = await updateProduct(p.id, p);
          if (error) failed++;
          else updated++;
        } else {
          const { error } = await createProduct(p);
          if (error) failed++;
          else created++;
        }
      }
      toast.success(
        `Imported ${products.length} products — ${created} new, ${updated} updated${failed ? `, ${failed} failed` : ""}`,
      );
      await refetch();
      setFile(null);
      setResult(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

    setImporting(false);
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validRows = result && !("error" in result) ? result.rows : [];
  const parseErrors = result && !("error" in result) ? result.errors : [];
  const topLevelError = result && "error" in result ? result.error : null;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/products"
            className="p-2 rounded-full hover:bg-saffron-light"
          >
            <ArrowLeft size={18} className="text-brown" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-brown">Bulk Product Import</h1>
            <p className="text-sm text-gray-500">
              Excel file (.xlsx) se 100s of products ek baar mein add karein
            </p>
          </div>
        </div>
        <a
          href="/templates/atalmart-products-template.xlsx"
          download
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-saffron border-2 border-saffron rounded-xl hover:bg-saffron-light transition-colors"
        >
          <Download size={14} />
          Template download
        </a>
      </div>

      {/* Upload area */}
      {!file && (
        <label
          htmlFor="excel-upload"
          className="block bg-white rounded-2xl border-2 border-dashed border-gray-300 hover:border-saffron hover:bg-saffron-light/20 transition-colors p-12 text-center cursor-pointer"
        >
          <input
            id="excel-upload"
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
          <Upload size={36} className="mx-auto text-saffron mb-3" />
          <p className="text-brown font-semibold mb-1">Click to upload .xlsx file</p>
          <p className="text-xs text-gray-500">
            Max 10 MB · use the template above for correct format
          </p>
        </label>
      )}

      {/* Parsing state */}
      {file && parsing && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Loader2 size={28} className="mx-auto text-saffron animate-spin mb-3" />
          <p className="text-sm font-medium text-brown">
            Parsing <span className="font-bold">{file.name}</span>…
          </p>
        </div>
      )}

      {/* Top-level error */}
      {topLevelError && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-red-700">Could not parse file</p>
              <p className="text-sm text-red-600 mt-1">{topLevelError}</p>
            </div>
            <button
              onClick={clearFile}
              className="p-1 hover:bg-red-100 rounded-lg"
              aria-label="Clear"
            >
              <X size={16} className="text-red-600" />
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && !("error" in result) && !parsing && (
        <div className="space-y-4">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryTile
              icon={<FileSpreadsheet size={16} />}
              label="File"
              value={file?.name || "—"}
              accent="brown"
            />
            <SummaryTile
              icon={<CheckCircle2 size={16} />}
              label="Valid rows"
              value={String(validRows.length)}
              accent="green"
            />
            <SummaryTile
              icon={<AlertCircle size={16} />}
              label="Errors"
              value={String(parseErrors.length)}
              accent={parseErrors.length > 0 ? "red" : "gray"}
            />
            <SummaryTile
              icon={<Eye size={16} />}
              label="Will update"
              value={String(validRows.filter((r) => existingIds.has(r.sku)).length)}
              accent="orange"
            />
          </div>

          {/* Errors list */}
          {parseErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-red-700 mb-2">
                {parseErrors.length} validation error{parseErrors.length === 1 ? "" : "s"} — these rows will be skipped
              </h3>
              <div className="max-h-48 overflow-y-auto">
                <ul className="text-xs space-y-1">
                  {parseErrors.slice(0, 20).map((e, i) => (
                    <li key={i} className="text-red-700">
                      Row {e.rowNumber} · <b>{e.field}</b>: {e.message}
                    </li>
                  ))}
                  {parseErrors.length > 20 && (
                    <li className="text-red-600 italic">
                      + {parseErrors.length - 20} more…
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Preview table */}
          {validRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-brown">
                  Preview <span className="text-gray-400 text-sm font-normal">· first 10 rows</span>
                </h3>
                <span className="text-xs text-gray-500">{validRows.length} total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2">SKU</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-right px-3 py-2">Price</th>
                      <th className="text-right px-3 py-2">MRP</th>
                      <th className="text-left px-3 py-2">Unit</th>
                      <th className="text-right px-3 py-2">Stock</th>
                      <th className="text-center px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {validRows.slice(0, 10).map((r) => {
                      const isUpdate = existingIds.has(r.sku);
                      return (
                        <tr key={r.sku} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-brown">{r.name}</p>
                            {r.name_hi && (
                              <p className="text-xs text-gray-500">{r.name_hi}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {r.category}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-brown tabular-nums">
                            ₹{r.price}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-gray-400 line-through tabular-nums">
                            ₹{r.mrp}
                          </td>
                          <td className="px-3 py-2 text-xs">{r.unit}</td>
                          <td className="px-3 py-2 text-right text-xs">{r.stock}</td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                isUpdate
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-green-light text-indian-green"
                              }`}
                            >
                              {isUpdate ? "UPDATE" : "NEW"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Confirm bar */}
          <div className="bg-white border-2 border-saffron rounded-2xl p-4 flex items-center justify-between sticky bottom-3 shadow-lg">
            <div>
              <p className="text-sm font-bold text-brown">
                Ready to import {validRows.length} product{validRows.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-gray-500">
                {validRows.filter((r) => !existingIds.has(r.sku)).length} new ·{" "}
                {validRows.filter((r) => existingIds.has(r.sku)).length} update
                {parseErrors.length > 0 && ` · ${parseErrors.length} skipped`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearFile}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                loading={importing}
                disabled={validRows.length === 0}
              >
                <Upload size={14} />
                Import {validRows.length}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "green" | "red" | "orange" | "brown" | "gray";
}) {
  const accentMap: Record<typeof accent, string> = {
    green: "bg-green-light text-indian-green",
    red: "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
    brown: "bg-saffron-light text-saffron",
    gray: "bg-gray-100 text-gray-500",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${accentMap[accent]}`}>
        {icon}
      </div>
      <p className="text-base font-bold text-brown truncate" title={value}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
