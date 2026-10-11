"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  useCodLedger,
  recordRemittance,
  setCollected,
  type CodRow,
  type RiderCodSummary,
} from "@/lib/hooks/use-cod";

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })
    : "—";

/**
 * COD cash settlement — who is holding how much cash right now.
 *
 * Flow: rider marks a cash order delivered → the rider app stamps
 * `collected` → the rider hands cash to the store at shift end → the admin
 * records the amount here (oldest orders settle first). Variance (collected ≠
 * expected) is derived in the DB view, never typed in.
 */
export default function AdminCodPage() {
  const { rows, summaries, loading, error, refetch } = useCodLedger();
  const totals = useMemo(() => {
    const outstanding = summaries.reduce((s, r) => s + r.outstandingPaise, 0);
    const pending = summaries.reduce((s, r) => s + r.pendingPaise, 0);
    const settledToday = rows
      .filter((r) => r.remitted_at && new Date(r.remitted_at).toDateString() === new Date().toDateString())
      .reduce((s, r) => s + (r.remitted_paise ?? 0), 0);
    return { outstanding, pending, settledToday };
  }, [rows, summaries]);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-brown flex items-center gap-2">
            <Banknote size={24} className="text-saffron" /> COD Cash
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Riders ke paas abhi kitna cash hai, aur shift end par kitna jama hua.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
          Ledger load nahi hua: {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
        <Kpi label="Riders ke paas cash (abhi)" value={rupees(totals.outstanding)} tone={totals.outstanding > 0 ? "amber" : "green"} />
        <Kpi label="Out for delivery (expected)" value={rupees(totals.pending)} tone="gray" />
        <Kpi label="Aaj jama hua" value={rupees(totals.settledToday)} tone="green" />
      </div>

      {!loading && summaries.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Banknote size={36} className="mx-auto mb-2 text-gray-300" />
          Koi COD order nahi — pehla cash order aate hi yahan dikhega.
        </div>
      )}

      <div className="space-y-4">
        {summaries.map((s) => (
          <RiderCard key={s.riderId} summary={s} onChanged={refetch} />
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "amber" | "green" | "gray" }) {
  const cls = { amber: "text-amber-700 bg-amber-50", green: "text-indian-green bg-green-light", gray: "text-brown bg-gray-50" }[tone];
  return (
    <div className={`rounded-2xl border border-gray-100 p-4 ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  );
}

function RiderCard({ summary, onChanged }: { summary: RiderCodSummary; onChanged: () => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const settle = async (paise: number) => {
    const ok = await confirmDialog({
      title: "Cash jama confirm karein",
      message: `${summary.riderName} ne ${rupees(paise)} store par jama kiya? Purane orders pehle settle honge.`,
      confirmLabel: "Haan, jama hua",
    });
    if (!ok) return;
    setBusy(true);
    const { error, settled } = await recordRemittance(summary, paise);
    setBusy(false);
    if (error) toast.error("Record nahi hua: " + error.message);
    else {
      toast.success(`${rupees(settled)} settle hua`);
      setAmount("");
      onChanged();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-brown">{summary.riderName}</p>
          <p className="text-xs text-gray-500">
            {summary.openRows.length} delivered cash order{summary.openRows.length === 1 ? "" : "s"} abhi settle nahi
            {summary.pendingRows.length > 0 && ` · ${summary.pendingRows.length} out for delivery (${rupees(summary.pendingPaise)})`}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${summary.outstandingPaise > 0 ? "text-amber-700" : "text-indian-green"}`}>
            {rupees(summary.outstandingPaise)}
          </p>
          <p className="text-[11px] text-gray-500">rider ke paas</p>
        </div>
      </div>

      {summary.outstandingPaise > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => settle(summary.outstandingPaise)}>
            <CheckCircle2 size={14} /> Poora {rupees(summary.outstandingPaise)} jama
          </Button>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Partial ₹"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !(Number(amount) > 0)}
              onClick={() => settle(Math.round(Number(amount) * 100))}
            >
              Record
            </Button>
          </div>
        </div>
      )}

      {summary.openRows.length > 0 && (
        <table className="w-full text-sm mt-4">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="py-1">Order</th>
              <th>Delivered</th>
              <th className="text-right">Expected</th>
              <th className="text-right">Collected</th>
              <th className="text-right">Baaki</th>
            </tr>
          </thead>
          <tbody>
            {summary.openRows.map((r) => (
              <OpenRow key={r.id} row={r} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      )}

      {summary.pendingRows.length > 0 && (
        <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
          <Clock size={12} /> Out for delivery:{" "}
          {summary.pendingRows.map((r) => (
            <Link key={r.id} href={`/admin/orders?focus=${r.order_id}`} className="font-mono text-saffron hover:underline mr-2">
              #{r.order_id.slice(0, 8)} {rupees(r.expected_paise)}
            </Link>
          ))}
        </p>
      )}

      <button
        onClick={() => setShowHistory((v) => !v)}
        className="text-xs text-gray-400 hover:text-saffron mt-3"
      >
        {showHistory ? "History chhupao" : "History dekho"}
      </button>
      {showHistory && <History riderId={summary.riderId} />}
    </div>
  );
}

function OpenRow({ row, onChanged }: { row: CodRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String((row.collected_paise ?? row.expected_paise) / 100));
  const variance = row.collection_variance_paise;
  const save = async () => {
    const { error } = await setCollected(row, Math.round(Number(val) * 100));
    if (error) toast.error("Save nahi hua");
    else {
      toast.success("Collected amount updated");
      setEditing(false);
      onChanged();
    }
  };
  return (
    <tr className="border-t border-gray-100">
      <td className="py-1.5">
        <Link href={`/admin/orders?focus=${row.order_id}`} className="font-mono text-saffron hover:underline">
          #{row.order_id.slice(0, 8)}
        </Link>
      </td>
      <td className="text-gray-500">{when(row.collected_at)}</td>
      <td className="text-right">{rupees(row.expected_paise)}</td>
      <td className="text-right">
        {editing ? (
          <span className="inline-flex items-center gap-1">
            <Input type="number" value={val} onChange={(e) => setVal(e.target.value)} className="w-24 h-7 text-right" />
            <Button size="sm" onClick={save}>OK</Button>
          </span>
        ) : (
          <button onClick={() => setEditing(true)} className="hover:underline" title="Galat amount? Click karke theek karein">
            {rupees(row.collected_paise ?? 0)}
            {variance !== 0 && (
              <Badge variant="saffron" className="ml-1">
                <AlertTriangle size={10} /> {variance > 0 ? "+" : ""}{rupees(variance)}
              </Badge>
            )}
          </button>
        )}
      </td>
      <td className="text-right font-semibold text-amber-700">{rupees(row.outstanding_paise)}</td>
    </tr>
  );
}

function History({ riderId }: { riderId: string }) {
  const { rows } = useCodLedger();
  const settled = rows.filter((r) => (r.rider_id ?? "unassigned") === riderId && r.remitted_at);
  if (settled.length === 0) return <p className="text-xs text-gray-400 mt-2">Abhi tak koi settlement nahi.</p>;
  return (
    <table className="w-full text-xs mt-2 text-gray-600">
      <tbody>
        {settled.slice(0, 30).map((r) => (
          <tr key={r.id} className="border-t border-gray-100">
            <td className="py-1 font-mono">#{r.order_id.slice(0, 8)}</td>
            <td>{when(r.collected_at)}</td>
            <td className="text-right">{rupees(r.remitted_paise ?? 0)}</td>
            <td className="text-right text-gray-400">settled {when(r.remitted_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
