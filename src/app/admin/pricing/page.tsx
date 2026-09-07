"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Percent,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Save,
  RefreshCw,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useAllProducts,
  useCategories,
  updateProduct,
} from "@/lib/hooks/use-products";
import { computeMargin, productMargin, priceForTargetMargin } from "@/lib/pnl";
import { formatRupees } from "@/lib/money";
import { toast } from "sonner";
import type { Product } from "@/types";

type FilterMode = "all" | "loss" | "nocost" | "thin";

export default function PricingAdminPage() {
  const { products, loading, refetch } = useAllProducts();
  const { categories } = useCategories();

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  // Local edits: productId → { price?, cost? } overriding the row's inputs
  // until saved. Keeps the table snappy without refetching per keystroke.
  const [edits, setEdits] = useState<Record<string, { price?: number; cost?: number }>>({});

  // Bulk target-margin tool
  const [bulkTarget, setBulkTarget] = useState(20);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => (categoryId ? p.category_id === categoryId : true))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .map((p) => {
        const e = edits[p.id] || {};
        const price = e.price ?? p.price;
        const cost = e.cost ?? p.cost_price ?? 0;
        return { product: p, price, cost, margin: computeMargin(price, cost, p.mrp) };
      })
      .filter((r) => {
        if (filter === "loss") return r.margin.lossMaking;
        if (filter === "nocost") return r.margin.costMissing;
        if (filter === "thin")
          return !r.margin.costMissing && !r.margin.lossMaking && r.margin.marginPct < 8;
        return true;
      });
  }, [products, edits, query, categoryId, filter]);

  // Portfolio stats (over the current filtered rows).
  const stats = useMemo(() => {
    let priced = 0,
      loss = 0,
      nocost = 0,
      marginSum = 0;
    for (const p of products) {
      const m = productMargin(p);
      if (m.costMissing) nocost++;
      else {
        priced++;
        marginSum += m.marginPct;
        if (m.lossMaking) loss++;
      }
    }
    return {
      total: products.length,
      priced,
      loss,
      nocost,
      avgMargin: priced > 0 ? Math.round((marginSum / priced) * 10) / 10 : 0,
    };
  }, [products]);

  const setEdit = (id: string, patch: { price?: number; cost?: number }) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const applyTargetToRow = (p: Product, cost: number) => {
    if (cost <= 0) return toast.error("Enter a cost first");
    const price = priceForTargetMargin(cost, bulkTarget);
    setEdit(p.id, { price });
  };

  const saveRow = async (p: Product, price: number, cost: number) => {
    if (price <= 0) return toast.error("Price must be greater than 0");
    setSavingId(p.id);
    // Only send changed fields.
    const payload: Partial<Product> = {};
    if (price !== p.price) payload.price = price;
    if (cost !== (p.cost_price ?? 0)) payload.cost_price = cost;
    if (Object.keys(payload).length === 0) {
      setSavingId(null);
      return toast.info("No changes");
    }
    const { error } = await updateProduct(p.id, payload);
    setSavingId(null);
    if (error) return toast.error(error.message || "Save failed");
    toast.success(`${p.name} updated`);
    setEdits((e) => {
      const next = { ...e };
      delete next[p.id];
      return next;
    });
    refetch();
  };

  const applyBulkTarget = async () => {
    const targets = rows.filter((r) => r.cost > 0);
    if (targets.length === 0)
      return toast.error("No rows with a cost to reprice — enter costs first");
    const next: typeof edits = { ...edits };
    for (const r of targets) {
      next[r.product.id] = {
        ...next[r.product.id],
        price: priceForTargetMargin(r.cost, bulkTarget),
      };
    }
    setEdits(next);
    toast.success(
      `Previewed ${bulkTarget}% price on ${targets.length} rows — review, then Save each (or per-row).`,
    );
  };

  const dirtyCount = Object.keys(edits).length;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-brown flex items-center gap-2">
            <Percent size={24} className="text-saffron" /> Pricing &amp; margins
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cost vs selling price vs MRP for every SKU. Loss-making and
            no-cost items are flagged so nothing sells in the dark.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Portfolio stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <StatTile label="SKUs" value={String(stats.total)} tone="navy" />
        <StatTile
          label="Avg margin"
          value={`${stats.avgMargin}%`}
          tone="green"
          icon={<TrendingUp size={16} />}
        />
        <StatTile
          label="Loss-making"
          value={String(stats.loss)}
          tone={stats.loss > 0 ? "red" : "gray"}
          icon={<TrendingDown size={16} />}
        />
        <StatTile
          label="No cost set"
          value={String(stats.nocost)}
          tone={stats.nocost > 0 ? "amber" : "gray"}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1 rounded-xl border-2 border-gray-200 px-2 focus-within:border-saffron flex-1 min-w-[180px]">
          <Search size={16} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="w-full py-2 text-sm outline-none bg-transparent"
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-saffron outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden text-sm">
          {(
            [
              ["all", "All"],
              ["loss", "Loss"],
              ["thin", "Thin <8%"],
              ["nocost", "No cost"],
            ] as [FilterMode, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`px-3 py-2 ${
                filter === v ? "bg-saffron text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk target-margin tool */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-navy/5 p-3 text-sm">
        <Calculator size={16} className="text-navy" />
        <span className="text-gray-600">Reprice filtered rows to target margin</span>
        <input
          type="number"
          value={bulkTarget}
          onChange={(e) => setBulkTarget(Number(e.target.value) || 0)}
          className="w-16 rounded-lg border-2 border-gray-200 px-2 py-1 text-right focus:border-saffron outline-none"
        />
        <span className="text-gray-600">%</span>
        <Button size="sm" variant="outline" onClick={applyBulkTarget}>
          Preview prices
        </Button>
        {dirtyCount > 0 && (
          <span className="text-xs text-saffron-dark ml-auto">
            {dirtyCount} unsaved row{dirtyCount > 1 ? "s" : ""} — Save each below
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-3 py-3 font-medium text-right">Cost ₹</th>
              <th className="px-3 py-3 font-medium text-right">Price ₹</th>
              <th className="px-3 py-3 font-medium text-right">MRP</th>
              <th className="px-3 py-3 font-medium text-right">Margin</th>
              <th className="px-3 py-3 font-medium text-right">Stock</th>
              <th className="px-4 py-3 font-medium text-right">Save</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-400">
                  No products match.
                </td>
              </tr>
            ) : (
              rows.slice(0, 300).map(({ product: p, price, cost, margin }) => {
                const dirty = !!edits[p.id];
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-50 ${
                      margin.lossMaking ? "bg-red-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-brown truncate max-w-[220px]">
                        {p.name}
                      </div>
                      <div className="text-xs text-gray-400">{p.unit}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        value={cost || ""}
                        onChange={(e) =>
                          setEdit(p.id, { cost: Number(e.target.value) || 0 })
                        }
                        placeholder="—"
                        className={`w-20 rounded-lg border-2 px-2 py-1 text-right outline-none focus:border-saffron ${
                          margin.costMissing ? "border-amber-300 bg-amber-50" : "border-gray-200"
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        value={price || ""}
                        onChange={(e) =>
                          setEdit(p.id, { price: Number(e.target.value) || 0 })
                        }
                        className="w-20 rounded-lg border-2 border-gray-200 px-2 py-1 text-right outline-none focus:border-saffron"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-400">
                      {formatRupees(p.mrp)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {margin.costMissing ? (
                        <Badge variant="gray">no cost</Badge>
                      ) : margin.lossMaking ? (
                        <Badge variant="red">
                          {formatRupees(margin.marginRupees)}
                        </Badge>
                      ) : (
                        <span
                          className={
                            margin.marginPct < 8
                              ? "text-amber-600 font-semibold"
                              : "text-indian-green font-semibold"
                          }
                        >
                          {formatRupees(margin.marginRupees)}
                          <span className="text-xs text-gray-400 ml-1">
                            {margin.marginPct}%
                          </span>
                        </span>
                      )}
                      <button
                        onClick={() => applyTargetToRow(p, cost)}
                        title={`Set price for ${bulkTarget}% margin`}
                        className="ml-2 text-xs text-navy hover:underline"
                      >
                        →{bulkTarget}%
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{p.stock}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant={dirty ? "primary" : "ghost"}
                        disabled={!dirty}
                        loading={savingId === p.id}
                        onClick={() => saveRow(p, price, cost)}
                      >
                        <Save size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 300 && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Showing first 300 of {rows.length} — narrow with search/category.
        </p>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "navy" | "green" | "red" | "amber" | "gray";
  icon?: React.ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    navy: "bg-blue-50 text-navy",
    green: "bg-green-light text-indian-green",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-700",
    gray: "bg-gray-100 text-gray-500",
  };
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClasses[tone]}`}
        >
          {icon ?? <span className="text-xs font-bold">₹</span>}
        </span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="mt-1.5 text-xl font-bold text-brown">{value}</div>
    </div>
  );
}
