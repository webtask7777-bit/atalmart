"use client";

import { useMemo, useState } from "react";
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
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import {
  useAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/hooks/use-products";
import { CATEGORIES_SEED } from "@/lib/constants";
import { toast } from "sonner";
import type { Product } from "@/types";

const emptyForm = {
  name: "",
  name_hi: "",
  description: "",
  category_id: "1",
  price: 0,
  mrp: 0,
  unit: "1 pc",
  image_url: null as string | null,
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

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock" | "inactive";

export default function AdminProductsPage() {
  const { products, loading, refetch } = useAllProducts();
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // ─── Category aggregation ─────────────────────────
  const categoryStats = useMemo(() => {
    return CATEGORIES_SEED.map((cat, i) => {
      const id = String(i + 1);
      const inCat = products.filter((p) => p.category_id === id);
      return {
        id,
        ...cat,
        total: inCat.length,
        inStock: inCat.filter((p) => p.stock > 0 && p.active).length,
        lowStock: inCat.filter((p) => p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD).length,
        outOfStock: inCat.filter((p) => p.stock === 0).length,
      };
    });
  }, [products]);

  const overallStats = useMemo(() => {
    return {
      total: products.length,
      inStock: products.filter((p) => p.stock > 0 && p.active).length,
      lowStock: products.filter((p) => p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD).length,
      outOfStock: products.filter((p) => p.stock === 0).length,
      inactive: products.filter((p) => !p.active).length,
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
      }
      return true;
    });
  }, [products, search, selectedCategoryId, stockFilter]);

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

  const bulkSetActive = async (active: boolean) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    await Promise.all(ids.map((id) => updateProduct(id, { active })));
    toast.success(`${ids.length} product${ids.length > 1 ? "s" : ""} ${active ? "activated" : "deactivated"}`);
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
    await Promise.all(ids.map((id) => deleteProduct(id)));
    toast.success(`${ids.length} product${ids.length > 1 ? "s" : ""} deleted`);
    clearSelection();
    refetch();
  };

  // ─── Form helpers ─────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, category_id: selectedCategoryId || "1" });
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
      price: p.price,
      mrp: p.mrp,
      unit: p.unit,
      image_url: p.image_url,
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
      price: f.price,
      mrp: f.mrp,
      unit: f.unit,
      image_url: f.image_url,
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
    if (form.price <= 0) return toast.error("Price must be greater than 0");
    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (editingId) {
        await updateProduct(editingId, payload as Parameters<typeof updateProduct>[1]);
        toast.success("Product updated");
      } else {
        await createProduct(payload as Parameters<typeof createProduct>[0]);
        toast.success("Product created");
      }
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
              {(["all", "in_stock", "low_stock", "out_of_stock", "inactive"] as StockFilter[]).map(
                (f) => (
                  <button
                    key={f}
                    onClick={() => setStockFilter(f)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap capitalize transition-colors ${
                      stockFilter === f
                        ? "bg-saffron text-white"
                        : "bg-white text-brown-light border border-gray-200 hover:border-saffron"
                    }`}
                  >
                    {f.replace("_", " ")}
                  </button>
                ),
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
                          checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                          onChange={() =>
                            selectedIds.size === filtered.length
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
                              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-lg overflow-hidden shrink-0">
                                {product.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={product.image_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  "📦"
                                )}
                              </div>
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
              {CATEGORIES_SEED.map((cat, i) => (
                <option key={cat.name} value={String(i + 1)}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
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
            <Input
              label="Stock"
              type="number"
              value={form.stock || ""}
              onChange={(e) => updateField("stock", Number(e.target.value))}
            />
          </div>
          <Input
            label="Unit"
            value={form.unit}
            onChange={(e) => updateField("unit", e.target.value)}
            placeholder="500 ml, 1 kg, etc."
          />
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
                  placeholder="support@atalmart.in"
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
