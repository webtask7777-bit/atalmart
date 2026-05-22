"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  QrCode,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Download,
  Eye,
  EyeOff,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  useCampaignsStore,
  campaignUrl,
  type Campaign,
} from "@/lib/store/campaigns";
import { useCampaignAnalyticsStore } from "@/lib/store/acquisition";
import { toast } from "sonner";

const MEDIUM_OPTIONS: { value: Campaign["medium"]; label: string }[] = [
  { value: "qr", label: "QR Poster" },
  { value: "flyer", label: "Flyer / Pamphlet" },
  { value: "newspaper", label: "Newspaper Insert" },
  { value: "referral", label: "Referral / Ambassador" },
  { value: "social", label: "Social Media" },
  { value: "other", label: "Other" },
];

export default function AdminCampaignsPage() {
  const { campaigns, add, update, remove, toggleActive } = useCampaignsStore();
  const analytics = useCampaignAnalyticsStore((s) => s.byCampaign);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qrCampaignId, setQrCampaignId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    source: "",
    medium: "qr" as Campaign["medium"],
    notes: "",
    budgetInr: 0,
  });

  const totals = useMemo(() => {
    let totalScans = 0;
    let totalSignups = 0;
    let totalOrders = 0;
    let totalRevenue = 0;
    let totalBudget = 0;
    for (const c of campaigns) {
      const a = analytics[c.source];
      if (a) {
        totalScans += a.scans;
        totalSignups += a.signups;
        totalOrders += a.orders;
        totalRevenue += a.revenue;
      }
      totalBudget += c.budgetInr || 0;
    }
    return { totalScans, totalSignups, totalOrders, totalRevenue, totalBudget };
  }, [campaigns, analytics]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", source: "", medium: "qr", notes: "", budgetInr: 0 });
    setModalOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      source: c.source,
      medium: c.medium,
      notes: c.notes || "",
      budgetInr: c.budgetInr || 0,
    });
    setModalOpen(true);
  };

  const save = () => {
    const name = form.name.trim();
    const source = form.source
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_");
    if (!name) return toast.error("Campaign name required");
    if (!source) return toast.error("Source slug required");

    // Source must be unique
    const duplicate = campaigns.find(
      (c) => c.source === source && c.id !== editingId,
    );
    if (duplicate) {
      return toast.error(
        `Source "${source}" already used by "${duplicate.name}"`,
      );
    }

    if (editingId) {
      update(editingId, { ...form, source });
      toast.success("Campaign updated");
    } else {
      add({ ...form, source });
      toast.success("Campaign created");
    }
    setModalOpen(false);
  };

  const onRemove = async (c: Campaign) => {
    const ok = await confirmDialog({
      title: `Delete campaign "${c.name}"?`,
      message: "The campaign URL will stop working but historical analytics will be preserved.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    remove(c.id);
    toast.success("Campaign deleted");
  };

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-brown">Marketing Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            QR posters, flyers, ads — track CPA per channel
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          New Campaign
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Kpi
          label="Campaigns"
          value={String(campaigns.length)}
          color="bg-blue-50 text-blue-600"
        />
        <Kpi
          label="Total scans"
          value={String(totals.totalScans)}
          color="bg-saffron-light text-saffron"
        />
        <Kpi
          label="Signups"
          value={String(totals.totalSignups)}
          color="bg-purple-50 text-purple-600"
        />
        <Kpi
          label="Orders"
          value={String(totals.totalOrders)}
          color="bg-green-light text-indian-green"
        />
        <Kpi
          label="Revenue"
          value={`₹${totals.totalRevenue.toLocaleString("en-IN")}`}
          color="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Campaigns table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Campaign</th>
                <th className="text-left px-3 py-3">Source / Medium</th>
                <th className="text-right px-3 py-3">Budget</th>
                <th className="text-right px-3 py-3">Scans</th>
                <th className="text-right px-3 py-3">Orders</th>
                <th className="text-right px-3 py-3">Revenue</th>
                <th className="text-right px-3 py-3">CPA</th>
                <th className="text-center px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-gray-400"
                  >
                    No campaigns yet — create one to start tracking
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => {
                  const a = analytics[c.source];
                  const orders = a?.orders || 0;
                  const cpa =
                    orders > 0 && c.budgetInr
                      ? Math.round(c.budgetInr / orders)
                      : null;
                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-gray-50 ${!c.active ? "opacity-60" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-brown">{c.name}</p>
                        {c.notes && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                            {c.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                          {c.source}
                        </code>
                        <p className="text-[10px] text-gray-400 mt-0.5 uppercase">
                          {c.medium}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right text-brown tabular-nums">
                        {c.budgetInr ? `₹${c.budgetInr.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {a?.scans || 0}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-indian-green">
                        {orders}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        ₹{(a?.revenue || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {cpa != null ? (
                          <span
                            className={
                              cpa < 100
                                ? "text-indian-green font-semibold"
                                : cpa < 250
                                  ? "text-amber-600"
                                  : "text-red-500"
                            }
                          >
                            ₹{cpa}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setQrCampaignId(c.id)}
                            title="View QR code"
                            className="p-1.5 hover:bg-saffron-light rounded text-saffron"
                          >
                            <QrCode size={14} />
                          </button>
                          <button
                            onClick={() => toggleActive(c.id)}
                            title={c.active ? "Pause" : "Resume"}
                            className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                          >
                            {c.active ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            title="Edit"
                            className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => onRemove(c)}
                            title="Delete"
                            className="p-1.5 hover:bg-red-50 rounded text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick how-to */}
      <div className="mt-5 bg-saffron-light/40 border border-orange-200 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-brown flex items-center gap-1.5">
          <TrendingUp size={14} className="text-saffron" />
          How to use
        </h3>
        <ol className="text-xs text-brown-light mt-2 space-y-1 list-decimal list-inside">
          <li>
            Create a campaign with a unique <b>source slug</b> (e.g.{" "}
            <code className="bg-white px-1 rounded">sector27_lift</code>)
          </li>
          <li>
            Download the QR code → print on poster / flyer / share digitally
          </li>
          <li>
            When someone scans → they land on the home page with the source
            attributed. First-touch wins.
          </li>
          <li>
            When they place an order → CPA & revenue auto-updates in this
            table.
          </li>
        </ol>
      </div>

      {/* Edit/create modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit campaign" : "New campaign"}
      >
        <div className="space-y-3">
          <Input
            label="Campaign name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Sector 27 Society Lift QR — May"
            autoFocus
          />
          <Input
            label="Source slug (URL-safe)"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="sector27_lift"
          />
          <div>
            <label className="block text-xs font-medium text-brown-light mb-1.5 ml-1">
              Medium
            </label>
            <select
              value={form.medium}
              onChange={(e) =>
                setForm({
                  ...form,
                  medium: e.target.value as Campaign["medium"],
                })
              }
              className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron"
            >
              {MEDIUM_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Budget (₹) — optional"
            type="number"
            value={String(form.budgetInr || "")}
            onChange={(e) =>
              setForm({ ...form, budgetInr: Number(e.target.value) || 0 })
            }
            placeholder="5000"
          />
          <div>
            <label className="block text-xs font-medium text-brown-light mb-1.5 ml-1">
              Notes (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Where the poster is placed, ambassador name, etc."
              rows={2}
              maxLength={200}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron resize-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={save}>
              {editingId ? "Save changes" : "Create campaign"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* QR code modal */}
      <QrModal
        campaign={campaigns.find((c) => c.id === qrCampaignId) || null}
        onClose={() => setQrCampaignId(null)}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}
      >
        <TrendingUp size={14} />
      </div>
      <p className="text-xl font-bold text-brown leading-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function QrModal({
  campaign,
  onClose,
}: {
  campaign: Campaign | null;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = campaign ? campaignUrl(campaign.source) : "";

  useEffect(() => {
    if (!campaign) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const QRCode = (await import("qrcode")).default;
      try {
        const dataUrl = await QRCode.toDataURL(url, {
          width: 600,
          margin: 2,
          color: { dark: "#1a1a1a", light: "#ffffff" },
          errorCorrectionLevel: "H",
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign, url]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const downloadQR = () => {
    if (!qrDataUrl || !campaign) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `atalmart-qr-${campaign.source}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("QR downloaded");
  };

  return (
    <Modal
      open={campaign !== null}
      onClose={onClose}
      title={campaign?.name || ""}
    >
      {campaign && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-2xl p-6 flex flex-col items-center">
            {qrDataUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR for ${campaign.source}`}
                  className="w-56 h-56"
                />
                <canvas ref={canvasRef} className="hidden" />
              </>
            ) : (
              <div className="w-56 h-56 bg-white border border-gray-200 rounded animate-pulse" />
            )}
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-3">
              Source
            </p>
            <code className="text-sm font-mono text-brown font-bold">
              {campaign.source}
            </code>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
              Trackable URL
            </p>
            <p className="text-xs font-mono text-brown break-all">{url}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyUrl}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 bg-white text-brown text-sm font-semibold rounded-xl border-2 border-gray-200 hover:border-saffron"
            >
              <Copy size={14} />
              Copy URL
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 bg-white text-brown text-sm font-semibold rounded-xl border-2 border-gray-200 hover:border-saffron"
            >
              <ExternalLink size={14} />
              Preview
            </a>
            <button
              onClick={downloadQR}
              disabled={!qrDataUrl}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 bg-saffron text-white text-sm font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50"
            >
              <Download size={14} />
              Download
            </button>
          </div>

          <p className="text-[11px] text-gray-500 text-center">
            Print at 4×4 inch or larger for reliable scanning. Add{" "}
            <b>&ldquo;Scan to order in 10 min&rdquo;</b> as caption.
          </p>
        </div>
      )}
    </Modal>
  );
}
