"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Package,
  AlertTriangle,
  TrendingDown,
  CheckCircle2,
  X,
  Filter,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportProductsToExcel } from "@/lib/excel-export";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ImageUpload } from "@/components/ui/image-upload";
import { FindImagesPicker } from "@/components/admin/find-images-picker";
import { subcatsFor } from "@/lib/subcategories";
import { computeMargin } from "@/lib/pnl";
import { formatRupees } from "@/lib/money";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import {
  useAllProducts,
  useCategories,
  useStockMovements,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/hooks/use-products";
import { toast } from "sonner";
import type { Product } from "@/types";

const emptyForm = {
  name: "",
  name_hi: "",
  description: "",
  // Real category id is injected when the create modal opens (see openCreate).
  // Empty string here means "needs a real id before submit"; the <select>
  // below picks the first available category as its initial value.
  category_id: "",
  // Blinkit-style subcategory within the category (migration 012). "" = none.
  subcategory: "" as string,
  price: 0,
  mrp: 0,
  // Landed wholesale cost per unit (migration 016). Drives margin/P&L.
  cost_price: 0,
  unit: "1 pc",
  image_url: null as string | null,
  // Additional gallery angles (BoP, side, ingredients). The picker writes
  // both image_url (FoP) and image_urls[] (the rest); this lets the edit
  // form display, reorder, and delete them.
  image_urls: [] as string[],
  stock: 0,
  active: true,
  // ─── Blinkit-style detail fields (optional) ───
  key_features_text: "",      // one bullet per line, joined to text[] on save
  processing_type: "",
  fat_profile: "",
  sugar_profile: "",
  biological_source: "",
  fssai_license: "",
  shelf_life: "",
  country_of_origin: "India",
  seller_name: "",
  seller_fssai: "",
  seller_address: "",
  return_policy: "",
  customer_care_email: "",
  customer_care_phone: "",
  disclaimer: "",
  // Nutrition (per 100 g)
  n_protein: "" as string | number,
  n_carbs: "" as string | number,
  n_total_sugar: "" as string | number,
  n_added_sugars: "" as string | number,
  n_total_fat: "" as string | number,
  n_sat_fat: "" as string | number,
  n_trans_fat: "" as string | number,
  n_calcium: "" as string | number,
  n_calories: "" as string | number,
};

const LOW_STOCK_THRESHOLD = 10;

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock" | "inactive" | "no_image";

/**
 * Read-only audit log of recent stock changes for a single product.
 * Backed by `public.stock_movements` (migration 006) which the trigger
 * populates automatically on every change to `products.stock` — admin
 * edits, order placements, restores, future GRN/wastage entries.
 *
 * Rendered inside the product edit modal so the operator can see what
 * happened to the count without leaving the page.
 */
function StockHistoryPanel({ productId }: { productId: string }) {
  const { movements, loading } = useStockMovements(productId, 20);

  if (loading) {
    return (
      <div className="text-xs text-gray-500 py-2">Loading stock history…</div>
    );
  }
  if (movements.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-2">
        No stock changes recorded yet. Future edits + order placements will
        appear here.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-3 py-2 font-medium">When</th>
            <th className="text-right px-3 py-2 font-medium">Δ</th>
            <th className="text-right px-3 py-2 font-medium">Before → After</th>
            <th className="text-left px-3 py-2 font-medium">Reason</th>
            <th className="text-left px-3 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => {
            const sign = m.delta > 0 ? "+" : "";
            const tone =
              m.delta > 0
                ? "text-indian-green"
                : m.delta < 0
                  ? "text-red-500"
                  : "text-gray-500";
            return (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                  {new Date(m.created_at).toLocaleString()}
                </td>
                <td className={`px-3 py-2 text-right font-semibold ${tone}`}>
                  {sign}
                  {m.delta}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {m.before_stock} → {m.after_stock}
                </td>
                <td className="px-3 py-2 text-brown">{m.reason}</td>
                <td className="px-3 py-2 text-gray-500">{m.source}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminProductsPage() {
  const { products, loading, refetch } = useAllProducts();
  const { categories } = useCategories();
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  // Find Images picker — opens a sub-modal over the edit form. When it
  // applies, it writes the new image_url/image_urls to Supabase directly
  // and we mirror those values onto the local form so the user sees the
  // result without re-fetching.
  const [pickerOpen, setPickerOpen] = useState(false);

  // ─── Category aggregation ─────────────────────────
  // Drives both the sidebar counts AND the per-row Category label. Uses the
  // real categories (live mode = Supabase UUIDs; demo mode = "1".."20") so
  // that products.category_id === categories.id actually matches. Before
  // this, the page hardcoded String(i+1) as the id which never matched the
  // UUIDs returned by Supabase, leaving every count at 0 and the table's
  // Category column blank.
  const categoryStats = useMemo(() => {
    return categories.map((cat) => {
      const inCat = products.filter((p) => p.category_id === cat.id);
      return {
        id: cat.id,
        name: cat.name,
        name_hi: cat.name_hi,
        icon: cat.icon,
        total: inCat.length,
        inStock: inCat.filter((p) => p.stock > 0 && p.active).length,
        lowStock: inCat.filter((p) => p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD).length,
        outOfStock: inCat.filter((p) => p.stock === 0).length,
      };
    });
  }, [products, categories]);

  const overallStats = useMemo(() => {
    return {
      total: products.length,
      inStock: products.filter((p) => p.stock > 0 && p.active).length,
      lowStock: products.filter((p) => p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD).length,
      outOfStock: products.filter((p) => p.stock === 0).length,
      inactive: products.filter((p) => !p.active).length,
      // "No image" — used by the missing-images filter so the operator can
      // walk straight through the catalog backlog (~1100 SKUs at time of
      // writing) without scrolling past products that already have shots.
      noImage: products.filter((p) => !p.image_url).length,
    };
  }, [products]);

  // ─── Filter pipeline ──────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategoryId && p.category_id !== selectedCategoryId) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.name_hi.includes(search.trim())) return false;
      switch (stockFilter) {
        case "in_stock":
          return p.stock > 0 && p.active;
        case "low_stock":
          return p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD;
        case "out_of_stock":
          return p.stock === 0;
        case "inactive":
          return !p.active;
        case "no_image":
          return !p.image_url;
      }
      return true;
    });
  }, [products, search, selectedCategoryId, stockFilter]);

  // Keep the selection honest: drop any id that no longer exists in the
  // catalog (after a delete + refetch). Otherwise bulk actions target ghost
  // ids and the header "select all" checkbox miscounts.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(products.map((p) => p.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [products]);

  // ─── Bulk actions ─────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(filtered.map((p) => p.id)));
  const clearSelection = () => setSelectedIds(new Set());

  // These helpers RESOLVE with { error } rather than rejecting, so a plain
  // Promise.all never surfaces a failure. Count the { error } results and
  // report the real outcome instead of a blanket "success".
  const countFailures = (results: { error: unknown }[]) =>
    results.filter((r) => r.error).length;

  const bulkSetActive = async (active: boolean) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const results = await Promise.all(ids.map((id) => updateProduct(id, { active })));
    const failed = countFailures(results);
    const ok = ids.length - failed;
    const verb = active ? "activated" : "deactivated";
    if (failed === 0) {
      toast.success(`${ok} product${ok > 1 ? "s" : ""} ${verb}`);
    } else if (ok === 0) {
      toast.error(`Couldn't ${active ? "activate" : "deactivate"} — ${failed} failed`);
    } else {
      toast.warning(`${ok} ${verb}, ${failed} failed`);
    }
    clearSelection();
    refetch();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: `Delete ${ids.length} product${ids.length > 1 ? "s" : ""}?`,
      message: "Selected products will be removed permanently. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const results = await Promise.all(ids.map((id) => deleteProduct(id)));
    const failed = countFailures(results);
    const done = ids.length - failed;
    if (failed === 0) {
      toast.success(`${done} product${done > 1 ? "s" : ""} deleted`);
    } else if (done === 0) {
      toast.error(`Couldn't delete — all ${failed} failed`);
    } else {
      toast.warning(`${done} deleted, ${failed} failed`);
    }
    clearSelection();
    refetch();
  };

  // ─── Form helpers ─────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    // Default to the sidebar-selected category, else the first real category
    // from the live list. Falls back to "" if categories haven't loaded yet —
    // the <select> below will pick its first option on render.
    const fallback = categories[0]?.id ?? "";
    setForm({ ...emptyForm, category_id: selectedCategoryId || fallback });
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      ...emptyForm,
      name: p.name,
      name_hi: p.name_hi,
      description: p.description || "",
      category_id: p.category_id,
      subcategory: p.subcategory ?? "",
      price: p.price,
      mrp: p.mrp,
      cost_price: p.cost_price ?? 0,
      unit: p.unit,
      image_url: p.image_url,
      image_urls: p.image_urls ?? [],
      stock: p.stock,
      active: p.active,
      // Load existing detail fields
      key_features_text: (p.key_features ?? []).join("\n"),
      processing_type: p.processing_type ?? "",
      fat_profile: p.fat_profile ?? "",
      sugar_profile: p.sugar_profile ?? "",
      biological_source: p.biological_source ?? "",
      fssai_license: p.fssai_license ?? "",
      shelf_life: p.shelf_life ?? "",
      country_of_origin: p.country_of_origin ?? "India",
      seller_name: p.seller_name ?? "",
      seller_fssai: p.seller_fssai ?? "",
      seller_address: p.seller_address ?? "",
      return_policy: p.return_policy ?? "",
      customer_care_email: p.customer_care?.email ?? "",
      customer_care_phone: p.customer_care?.phone ?? "",
      disclaimer: p.disclaimer ?? "",
      n_protein: p.nutrition_per_100g?.protein ?? "",
      n_carbs: p.nutrition_per_100g?.carbs ?? "",
      n_total_sugar: p.nutrition_per_100g?.total_sugar ?? "",
      n_added_sugars: p.nutrition_per_100g?.added_sugars ?? "",
      n_total_fat: p.nutrition_per_100g?.total_fat ?? "",
      n_sat_fat: p.nutrition_per_100g?.sat_fat ?? "",
      n_trans_fat: p.nutrition_per_100g?.trans_fat ?? "",
      n_calcium: p.nutrition_per_100g?.calcium ?? "",
      n_calories: p.nutrition_per_100g?.calories ?? "",
    });
    setModalOpen(true);
  };

  /**
   * Map our flat form state to the structured Product shape the DB expects.
   * Nutrition + customer_care get re-packed into JSONB objects; key_features
   * splits the textarea by newline; empty strings become null so they don't
   * overwrite real data with blanks.
   */
  const buildPayload = (f: typeof form) => {
    const nullable = (s: string) => (s.trim() ? s.trim() : null);
    const num = (v: string | number) => {
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const nutrition = {
      protein: num(f.n_protein),
      carbs: num(f.n_carbs),
      total_sugar: num(f.n_total_sugar),
      added_sugars: num(f.n_added_sugars),
      total_fat: num(f.n_total_fat),
      sat_fat: num(f.n_sat_fat),
      trans_fat: num(f.n_trans_fat),
      calcium: num(f.n_calcium),
      calories: num(f.n_calories),
    };
    const hasAnyNutrition = Object.values(nutrition).some((v) => v != null);
    const customerCare = {
      email: nullable(f.customer_care_email),
      phone: nullable(f.customer_care_phone),
    };
    const hasAnyCare = customerCare.email || customerCare.phone;
    const features = f.key_features_text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      name: f.name,
      name_hi: f.name_hi,
      description: nullable(f.description),
      category_id: f.category_id,
      subcategory: nullable(f.subcategory),
      price: f.price,
      mrp: f.mrp,
      cost_price: f.cost_price || 0,
      unit: f.unit,
      image_url: f.image_url,
      image_urls: f.image_urls,
      stock: f.stock,
      active: f.active,
      nutrition_per_100g: hasAnyNutrition ? nutrition : null,
      key_features: features.length > 0 ? features : null,
      processing_type: nullable(f.processing_type),
      fat_profile: nullable(f.fat_profile),
      sugar_profile: nullable(f.sugar_profile),
      biological_source: nullable(f.biological_source),
      fssai_license: nullable(f.fssai_license),
      shelf_life: nullable(f.shelf_life),
      country_of_origin: nullable(f.country_of_origin) ?? "India",
      seller_name: nullable(f.seller_name),
      seller_fssai: nullable(f.seller_fssai),
      seller_address: nullable(f.seller_address),
      return_policy: nullable(f.return_policy),
      customer_care: hasAnyCare ? customerCare : null,
      disclaimer: nullable(f.disclaimer),
    };
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Product name is required");
    if (!form.category_id) return toast.error("Please choose a category");
    if (form.price <= 0) return toast.error("Price must be greater than 0");
    if (form.mrp > 0 && form.mrp < form.price)
      return toast.error("MRP can't be less than the selling price");
    setSaving(true);
    try {
      const payload = buildPayload(form);
      // These helpers RETURN { error } (they don't throw), so we must inspect
      // it — otherwise a rejected write shows a success toast and closes the
      // modal with nothing saved.
      const { error } = editingId
        ? await updateProduct(editingId, payload as Parameters<typeof updateProduct>[1])
        : await createProduct(payload as Parameters<typeof createProduct>[0]);
      if (error) {
        toast.error(error.message || "Failed to save product");
        return; // keep the modal open so the operator can retry
      }
      toast.success(editingId ? "Product updated" : "Product created");
      setModalOpen(false);
      refetch();
    } catch {
      toast.error("Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: `Delete "${name}"?`,
      message: "This product will be removed from the catalog permanently.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await deleteProduct(id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Deleted");
      refetch();
    }
  };

  const updateField = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  // ─── Render ───────────────────────────────────────
  const selectedCat = selectedCategoryId
    ? categoryStats.find((c) => c.id === selectedCategoryId)
    : null;

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-brown">Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {overallStats.total} total · {overallStats.inStock} in stock ·{" "}
            <span className="text-red-500">{overallStats.outOfStock} out of stock</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                await exportProductsToExcel(products);
                toast.success(`Exported ${products.length} products to Excel`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Export failed");
              }
            }}
            disabled={products.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-indian-green border-2 border-indian-green rounded-xl hover:bg-green-light transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet size={14} />
            Export
          </button>
          <Link
            href="/admin/products/import"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-saffron border-2 border-saffron rounded-xl hover:bg-saffron-light transition-colors"
          >
            <Upload size={14} />
            Bulk Import
          </Link>
          <Button size="sm" onClick={openCreate}>
            <Plus size={16} />
            Add Product
          </Button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Kpi label="Total" value={overallStats.total} icon={<Package size={14} />} color="bg-blue-50 text-blue-600" />
        <Kpi
          label="In stock"
          value={overallStats.inStock}
          icon={<CheckCircle2 size={14} />}
          color="bg-green-light text-indian-green"
        />
        <Kpi
          label="Low stock"
          value={overallStats.lowStock}
          icon={<TrendingDown size={14} />}
          color="bg-orange-50 text-orange-600"
        />
        <Kpi
          label="Out of stock"
          value={overallStats.outOfStock}
          icon={<AlertTriangle size={14} />}
          color="bg-red-50 text-red-500"
        />
        <Kpi label="Inactive" value={overallStats.inactive} icon={<X size={14} />} color="bg-gray-100 text-gray-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        {/* ─── Categories sidebar ─── */}
        <aside className="bg-white rounded-2xl border border-gray-100 p-2 lg:sticky lg:top-4 h-fit max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="px-3 py-2 flex items-center gap-2">
            <Filter size={14} className="text-saffron" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Categories
            </h2>
          </div>
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
              selectedCategoryId === null
                ? "bg-saffron text-white font-medium"
                : "text-brown hover:bg-gray-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-base">🏪</span>
              All products
            </span>
            <span
              className={`text-xs font-semibold ${selectedCategoryId === null ? "text-white" : "text-gray-400"}`}
            >
              {overallStats.total}
            </span>
          </button>

          <div className="mt-1 space-y-0.5">
            {categoryStats.map((c) => {
              const active = selectedCategoryId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategoryId(c.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    active
                      ? "bg-saffron text-white font-medium"
                      : c.total === 0
                        ? "text-gray-400 hover:bg-gray-50"
                        : "text-brown hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{c.icon}</span>
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      active ? "text-white" : c.outOfStock > 0 ? "text-red-500" : "text-gray-400"
                    }`}
                  >
                    {c.total}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ─── Main content ─── */}
        <div>
          {/* Selected category header + stats */}
          {selectedCat && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-saffron-light rounded-2xl flex items-center justify-center text-2xl shrink-0">
                {selectedCat.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-brown">{selectedCat.name}</h2>
                <p className="text-xs text-gray-500">
                  {selectedCat.total} total · {selectedCat.inStock} in stock ·{" "}
                  {selectedCat.lowStock} low stock ·{" "}
                  <span className="text-red-500">{selectedCat.outOfStock} out</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedCategoryId(null)}
                className="p-1.5 text-gray-400 hover:text-brown"
                aria-label="Clear filter"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Filters bar */}
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search by name or hindi name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-saffron"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {(["all", "in_stock", "low_stock", "out_of_stock", "inactive", "no_image"] as StockFilter[]).map(
                (f) => {
                  // Show the count next to "no_image" since it's the
                  // backlog the operator is most likely walking through.
                  const count =
                    f === "no_image"
                      ? overallStats.noImage
                      : f === "out_of_stock"
                        ? overallStats.outOfStock
                        : f === "low_stock"
                          ? overallStats.lowStock
                          : f === "inactive"
                            ? overallStats.inactive
                            : f === "in_stock"
                              ? overallStats.inStock
                              : null;
                  return (
                    <button
                      key={f}
                      onClick={() => setStockFilter(f)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap capitalize transition-colors ${
                        stockFilter === f
                          ? "bg-saffron text-white"
                          : "bg-white text-brown-light border border-gray-200 hover:border-saffron"
                      }`}
                    >
                      {f === "no_image" ? "missing image" : f.replace("_", " ")}
                      {count !== null && (
                        <span
                          className={`ml-1.5 ${stockFilter === f ? "text-white/80" : "text-gray-400"}`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="bg-saffron text-white rounded-2xl px-4 py-2.5 mb-3 flex items-center justify-between sticky top-0 z-10">
              <span className="text-sm font-bold">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => bulkSetActive(true)}
                  className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded hover:bg-white/30"
                >
                  Activate
                </button>
                <button
                  onClick={() => bulkSetActive(false)}
                  className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded hover:bg-white/30"
                >
                  Deactivate
                </button>
                <button
                  onClick={bulkDelete}
                  className="text-xs font-bold bg-red-600 px-2.5 py-1 rounded hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={clearSelection}
                  aria-label="clear selection"
                  className="text-xs font-bold p-1 hover:bg-white/20 rounded"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Products table */}
          {loading ? (
            <ProductGridSkeleton count={6} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          // "All selected" = every VISIBLE row is selected, not
                          // just a matching count (selection can span filters).
                          checked={
                            filtered.length > 0 &&
                            filtered.every((p) => selectedIds.has(p.id))
                          }
                          onChange={() =>
                            filtered.length > 0 &&
                            filtered.every((p) => selectedIds.has(p.id))
                              ? clearSelection()
                              : selectAll()
                          }
                          className="accent-saffron"
                          aria-label="Select all"
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Price</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">MRP</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Stock</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((product) => {
                      const cat = categoryStats.find((c) => c.id === product.category_id);
                      const stockStyle =
                        product.stock === 0
                          ? "bg-red-500"
                          : product.stock < LOW_STOCK_THRESHOLD
                            ? "bg-orange-500"
                            : "bg-indian-green";
                      return (
                        <tr
                          key={product.id}
                          className={`border-b border-gray-50 hover:bg-gray-50/50 ${
                            selectedIds.has(product.id) ? "bg-saffron-light/30" : ""
                          }`}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(product.id)}
                              onChange={() => toggleSelect(product.id)}
                              className="accent-saffron"
                              aria-label={`Select ${product.name}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ProductThumb src={product.image_url} name={product.name} />
                              <div className="min-w-0">
                                <p className="font-medium text-brown truncate">{product.name}</p>
                                <p className="text-xs text-gray-500">
                                  {product.id} · {product.unit}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {cat && (
                              <button
                                onClick={() => setSelectedCategoryId(cat.id)}
                                className="text-xs text-brown-light hover:text-saffron flex items-center gap-1"
                              >
                                <span>{cat.icon}</span>
                                <span className="truncate max-w-[120px]">{cat.name}</span>
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-brown">₹{product.price}</td>
                          <td className="px-4 py-3 text-gray-500">₹{product.mrp}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${stockStyle}`} />
                              <span
                                className={`font-medium ${
                                  product.stock === 0
                                    ? "text-red-500"
                                    : product.stock < LOW_STOCK_THRESHOLD
                                      ? "text-orange-600"
                                      : "text-brown"
                                }`}
                              >
                                {product.stock}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={product.active ? "green" : "red"}>
                              {product.active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEdit(product)}
                                className="p-1.5 text-gray-400 hover:text-saffron rounded-lg hover:bg-saffron-light transition-colors"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(product.id, product.name)}
                                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && (
                <div className="text-center py-16">
                  <Package size={36} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">No products match your filters</p>
                  {(selectedCategoryId || stockFilter !== "all" || search) && (
                    <button
                      onClick={() => {
                        setSelectedCategoryId(null);
                        setStockFilter("all");
                        setSearch("");
                      }}
                      className="text-xs text-saffron font-semibold hover:underline mt-2"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Product" : "Add Product"}
      >
        <div className="space-y-4">
          <ImageUpload
            value={form.image_url}
            onChange={(url) => updateField("image_url", url)}
          />
          {/* Gallery (image_urls[]) — additional angles like BoP, ingredient
              label, side shots. The Find Images picker writes both image_url
              and image_urls[], but until now there was no way to see or
              edit the gallery from the admin. Showing them here lets the
              operator delete a bad angle without re-running the picker. */}
          {form.image_urls.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-brown-light">
                  Gallery angles ({form.image_urls.length})
                </label>
                <button
                  type="button"
                  onClick={() => updateField("image_urls", [])}
                  className="text-[11px] text-red-500 hover:underline"
                >
                  Clear all
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {form.image_urls.map((url, idx) => (
                  <div
                    key={url + idx}
                    className="relative group border-2 border-gray-200 rounded-xl overflow-hidden bg-gray-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Angle ${idx + 2}`}
                      className="w-full aspect-square object-contain"
                    />
                    <div className="absolute top-1 left-1 bg-white/90 text-[10px] font-bold text-brown px-1.5 py-0.5 rounded">
                      #{idx + 2}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        updateField(
                          "image_urls",
                          form.image_urls.filter((_, i) => i !== idx),
                        );
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove this angle"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
                      {/* Promote to FoP — swaps this angle with the current FoP */}
                      <button
                        type="button"
                        onClick={() => {
                          const currentFop = form.image_url;
                          const rest = form.image_urls.slice();
                          rest[idx] = currentFop ?? rest[idx];
                          updateField("image_url", url);
                          updateField("image_urls", currentFop ? rest : rest.filter((_, i) => i !== idx));
                        }}
                        className="bg-white text-brown text-[9px] font-bold px-1.5 py-0.5 rounded shadow"
                        title="Make this the front-of-pack"
                      >
                        ↑ FoP
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5">
                Hover an image to delete or promote it to the front-of-pack.
              </p>
            </div>
          )}
          {/* Find Images — only for existing products (the picker uploads
              directly via the productId, which we don't have until save). */}
          {editingId && (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPickerOpen(true)}
                className="w-full"
              >
                <Search className="w-4 h-4" />
                <span className="ml-2">Find images from the web</span>
              </Button>
              <p className="text-[11px] text-gray-500 mt-1.5">
                Searches Blinkit, Zepto, JioMart, BigBasket, Amazon.in and brand sites.
                Pick the front-of-pack first, then any angles you want as gallery shots.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Name (English)"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Amul Milk"
            />
            <Input
              label="Name (Hindi)"
              value={form.name_hi}
              onChange={(e) => updateField("name_hi", e.target.value)}
              placeholder="अमूल दूध"
            />
          </div>
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Short description..."
          />
          <div>
            <label className="block text-sm font-medium text-brown-light mb-1.5">Category</label>
            <select
              value={form.category_id}
              onChange={(e) => updateField("category_id", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-brown focus:outline-none focus:border-saffron"
            >
              {/* Explicit placeholder so an unset category_id isn't rendered as
                  a silently-picked first option (which never fires onChange). */}
              {!form.category_id && <option value="">— select a category —</option>}
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>
          {/* Subcategory — options depend on the picked category (migration 012) */}
          {(() => {
            const catName = categories.find((c) => c.id === form.category_id)?.name;
            const subs = subcatsFor(catName);
            if (!subs.length) return null;
            return (
              <div>
                <label className="block text-sm font-medium text-brown-light mb-1.5">
                  Subcategory
                </label>
                <select
                  value={form.subcategory}
                  onChange={(e) => updateField("subcategory", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-brown focus:outline-none focus:border-saffron"
                >
                  <option value="">— none —</option>
                  {subs.map((sc) => (
                    <option key={sc.name} value={sc.name}>
                      {sc.icon ? `${sc.icon} ` : ""}
                      {sc.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })()}
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Cost (₹)"
              type="number"
              value={form.cost_price || ""}
              onChange={(e) => updateField("cost_price", Number(e.target.value))}
              placeholder="wholesale"
            />
            <Input
              label="Price (₹)"
              type="number"
              value={form.price || ""}
              onChange={(e) => updateField("price", Number(e.target.value))}
            />
            <Input
              label="MRP (₹)"
              type="number"
              value={form.mrp || ""}
              onChange={(e) => updateField("mrp", Number(e.target.value))}
            />
          </div>
          {(() => {
            const m = computeMargin(form.price, form.cost_price, form.mrp);
            if (m.costMissing)
              return (
                <p className="text-xs text-amber-600">
                  No cost set — margin &amp; P&amp;L can&apos;t be tracked for this SKU.
                </p>
              );
            return (
              <p
                className={`text-xs ${
                  m.lossMaking ? "text-red-600 font-semibold" : "text-indian-green"
                }`}
              >
                {m.lossMaking
                  ? `⚠ Selling ${formatRupees(-m.marginRupees)} below cost`
                  : `Margin ${formatRupees(m.marginRupees)} (${m.marginPct}% of price · ${m.markupPct}% markup)`}
              </p>
            );
          })()}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Stock"
              type="number"
              value={form.stock || ""}
              onChange={(e) => updateField("stock", Number(e.target.value))}
            />
            <Input
              label="Unit"
              value={form.unit}
              onChange={(e) => updateField("unit", e.target.value)}
              placeholder="500 ml, 1 kg, etc."
            />
          </div>
          {editingId && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-brown-light">
                Stock history (last 20 changes)
              </label>
              <StockHistoryPanel productId={editingId} />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => updateField("active", e.target.checked)}
              className="accent-saffron w-4 h-4"
            />
            <span className="text-sm text-brown">Active (visible to customers)</span>
          </label>

          {/* ═══ Blinkit-style detail fields ═══════════════════════ */}
          <details className="border border-gray-100 rounded-xl">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brown bg-gray-50 rounded-xl">
              📋 Product Details (optional — Blinkit-style)
            </summary>
            <div className="p-4 space-y-3">
              <Input
                label="Key Features (one per line)"
                value={form.key_features_text}
                onChange={(e) => updateField("key_features_text", e.target.value)}
                placeholder={"Wholesome taste\nRich in calcium\n..."}
                as="textarea"
                rows={3}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Processing Type"
                  value={form.processing_type}
                  onChange={(e) => updateField("processing_type", e.target.value)}
                  placeholder="Pasteurized"
                />
                <Input
                  label="Fat Profile"
                  value={form.fat_profile}
                  onChange={(e) => updateField("fat_profile", e.target.value)}
                  placeholder="Toned / Full Cream / Skimmed"
                />
                <Input
                  label="Sugar Profile"
                  value={form.sugar_profile}
                  onChange={(e) => updateField("sugar_profile", e.target.value)}
                  placeholder="No Added Sugar"
                />
                <Input
                  label="Biological Source"
                  value={form.biological_source}
                  onChange={(e) => updateField("biological_source", e.target.value)}
                  placeholder="Cow Milk"
                />
                <Input
                  label="FSSAI License"
                  value={form.fssai_license}
                  onChange={(e) => updateField("fssai_license", e.target.value)}
                  placeholder="14-digit number"
                />
                <Input
                  label="Shelf Life"
                  value={form.shelf_life}
                  onChange={(e) => updateField("shelf_life", e.target.value)}
                  placeholder="2 days / 6 months"
                />
                <Input
                  label="Country of Origin"
                  value={form.country_of_origin}
                  onChange={(e) => updateField("country_of_origin", e.target.value)}
                />
              </div>
            </div>
          </details>

          <details className="border border-gray-100 rounded-xl">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brown bg-gray-50 rounded-xl">
              🥗 Nutrition (per 100 g)
            </summary>
            <div className="p-4 grid grid-cols-2 gap-3">
              <Input
                label="Protein (g)"
                value={String(form.n_protein)}
                onChange={(e) => updateField("n_protein", e.target.value)}
                placeholder="3"
              />
              <Input
                label="Total Carbs (g)"
                value={String(form.n_carbs)}
                onChange={(e) => updateField("n_carbs", e.target.value)}
                placeholder="4"
              />
              <Input
                label="Total Sugar (g)"
                value={String(form.n_total_sugar)}
                onChange={(e) => updateField("n_total_sugar", e.target.value)}
                placeholder="4.7"
              />
              <Input
                label="Added Sugars (g)"
                value={String(form.n_added_sugars)}
                onChange={(e) => updateField("n_added_sugars", e.target.value)}
                placeholder="0"
              />
              <Input
                label="Total Fat (g)"
                value={String(form.n_total_fat)}
                onChange={(e) => updateField("n_total_fat", e.target.value)}
                placeholder="3"
              />
              <Input
                label="Saturated Fat (g)"
                value={String(form.n_sat_fat)}
                onChange={(e) => updateField("n_sat_fat", e.target.value)}
                placeholder="2"
              />
              <Input
                label="Trans Fat (g)"
                value={String(form.n_trans_fat)}
                onChange={(e) => updateField("n_trans_fat", e.target.value)}
                placeholder="0"
              />
              <Input
                label="Calcium (g)"
                value={String(form.n_calcium)}
                onChange={(e) => updateField("n_calcium", e.target.value)}
                placeholder="0.1"
              />
              <Input
                label="Calories (kcal)"
                value={String(form.n_calories)}
                onChange={(e) => updateField("n_calories", e.target.value)}
                placeholder="58"
              />
            </div>
          </details>

          <details className="border border-gray-100 rounded-xl">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brown bg-gray-50 rounded-xl">
              🏢 Seller, Returns, Customer Care
            </summary>
            <div className="p-4 space-y-3">
              <Input
                label="Seller Name"
                value={form.seller_name}
                onChange={(e) => updateField("seller_name", e.target.value)}
                placeholder="Atalmart Hyperpure Private Limited"
              />
              <Input
                label="Seller FSSAI"
                value={form.seller_fssai}
                onChange={(e) => updateField("seller_fssai", e.target.value)}
              />
              <Input
                label="Seller Address"
                value={form.seller_address}
                onChange={(e) => updateField("seller_address", e.target.value)}
                as="textarea"
                rows={2}
              />
              <Input
                label="Return Policy"
                value={form.return_policy}
                onChange={(e) => updateField("return_policy", e.target.value)}
                as="textarea"
                rows={3}
                placeholder="Only Replacement of the item is permitted, within 24 hours..."
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Customer Care Email"
                  value={form.customer_care_email}
                  onChange={(e) => updateField("customer_care_email", e.target.value)}
                  placeholder="webtask7777@gmail.com"
                />
                <Input
                  label="Customer Care Phone"
                  value={form.customer_care_phone}
                  onChange={(e) => updateField("customer_care_phone", e.target.value)}
                  placeholder="+91-91120-00000"
                />
              </div>
              <Input
                label="Disclaimer"
                value={form.disclaimer}
                onChange={(e) => updateField("disclaimer", e.target.value)}
                as="textarea"
                rows={3}
                placeholder="Every effort is made to maintain the accuracy of all information..."
              />
            </div>
          </details>

          <Button className="w-full" loading={saving} onClick={handleSave}>
            {editingId ? "Update Product" : "Create Product"}
          </Button>
        </div>
      </Modal>

      {/* Find Images picker — DDG-powered candidate search. Renders as a
          second modal on top of the edit form. The picker writes directly
          to Supabase (storage + DB patch), so when it returns we mirror
          the new URLs onto the local form for instant UI feedback.

          "Apply & next" lets the operator walk through the missing-image
          backlog without closing the picker — we find the next product
          without an image_url and swap the picker's props in place. */}
      {pickerOpen && editingId && (
        <FindImagesPicker
          productId={editingId}
          productName={form.name}
          productUnit={form.unit}
          currentImageUrl={form.image_url}
          onClose={() => setPickerOpen(false)}
          onApplied={(next) => {
            updateField("image_url", next.image_url);
            updateField("image_urls", next.image_urls ?? []);
            refetch();
          }}
          onApplyAndNext={() => {
            // Find the next product with no image_url in the same filtered
            // list. If none, close. This works best when the user has the
            // "missing image" stock filter active — the queue is exactly
            // the backlog they're walking.
            const candidates = filtered.filter(
              (p) => !p.image_url && p.id !== editingId,
            );
            const next = candidates[0];
            if (next) {
              openEdit(next);
            } else {
              setPickerOpen(false);
              toast.success("All caught up — no more missing-image products in this filter.");
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Product row thumbnail. Lazy-loads the image (the list can render hundreds of
 * rows, so eager loading fired hundreds of requests at once) and falls back to
 * the 📦 placeholder if the URL fails to load (many images are external URLs
 * that can 404 — without this the browser shows its broken-image glyph).
 */
function ProductThumb({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-lg overflow-hidden shrink-0">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        "📦"
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        {icon}
      </div>
      <p className="text-lg font-bold text-brown leading-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
