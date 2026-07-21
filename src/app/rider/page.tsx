"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bike,
  Phone,
  MapPin,
  Navigation,
  Power,
  LogOut,
  Package,
  IndianRupee,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { OrderMap } from "@/components/rider/order-map";
import {
  login as apiLogin,
  fetchMe,
  fetchOrders,
  fetchStats,
  setOnlineStatus,
  pushLocation,
  updateOrderStatus,
  getToken,
  setToken,
  clearToken,
  type RiderProfile,
  type RiderOrder,
  type RiderStats,
} from "@/lib/rider-api";

type View = "loading" | "login" | "dashboard";

export default function RiderApp() {
  const [view, setView] = useState<View>("loading");
  const [rider, setRider] = useState<RiderProfile | null>(null);

  // Restore session on mount.
  useEffect(() => {
    if (!getToken()) {
      setView("login");
      return;
    }
    fetchMe()
      .then(({ rider }) => {
        setRider(rider);
        setView("dashboard");
      })
      .catch(() => {
        clearToken();
        setView("login");
      });
  }, []);

  const onLoggedIn = (r: RiderProfile) => {
    setRider(r);
    setView("dashboard");
  };
  const onLogout = () => {
    clearToken();
    setRider(null);
    setView("login");
  };

  if (view === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="animate-spin text-saffron" size={28} />
      </div>
    );
  }
  if (view === "login") return <LoginScreen onLoggedIn={onLoggedIn} />;
  return <Dashboard rider={rider!} setRider={setRider} onLogout={onLogout} />;
}

// ─────────────────────────── Login ───────────────────────────

function LoginScreen({ onLoggedIn }: { onLoggedIn: (r: RiderProfile) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (phone.length !== 10 || !code) {
      toast.error("Phone (10 digit) aur access code daalein");
      return;
    }
    setLoading(true);
    try {
      const { token, rider } = await apiLogin(phone, code);
      setToken(token);
      toast.success(`Welcome, ${rider.name}!`);
      onLoggedIn(rider);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 max-w-md mx-auto">
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-saffron rounded-2xl flex items-center justify-center mb-3">
          <Bike className="text-white" size={32} />
        </div>
        <h1 className="text-2xl font-bold text-brown">Atalmart Rider</h1>
        <p className="text-sm text-gray-500 mt-1">Delivery partner login</p>
      </div>

      <label className="text-sm font-medium text-brown-light mb-1">Phone number</label>
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">+91</span>
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="98765 43210"
          className="w-full pl-11 pr-3 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-saffron text-base"
        />
      </div>

      <label className="text-sm font-medium text-brown-light mb-1">Access code</label>
      <input
        type="text"
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="6-digit code from admin"
        className="w-full px-3 py-3 mb-5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-saffron text-base font-mono tracking-widest"
      />

      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3.5 bg-saffron text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="animate-spin" size={18} /> : <Power size={18} />}
        Login
      </button>
      <p className="text-[11px] text-gray-400 text-center mt-4">
        Access code admin se milega. Bhul gaye? Admin se dobara maangein.
      </p>
    </div>
  );
}

// Two-tone chime via Web Audio (no asset). Best-effort — browsers block audio
// until the rider has interacted with the page, which by login time they have.
function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [880, 1175];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // ignore — audio is a nicety, not a requirement
  }
}

function notifyNewOrder(count: number) {
  playChime();
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate([120, 60, 120]);
    } catch {
      /* ignore */
    }
  }
  toast.success(
    count > 1 ? `${count} naye order aaye! 🛵` : "Naya order aaya! 🛵",
    { duration: 6000 },
  );
}

// ─────────────────────────── Dashboard ───────────────────────────

function Dashboard({
  rider,
  setRider,
  onLogout,
}: {
  rider: RiderProfile;
  setRider: (r: RiderProfile) => void;
  onLogout: () => void;
}) {
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [stats, setStats] = useState<RiderStats | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const online = rider.status !== "offline";

  // Track which orders we've already shown so a newly-assigned order can ping
  // the rider instead of silently appearing on the next 20s poll.
  const seenOrderIds = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const [{ orders }, s] = await Promise.all([fetchOrders(), fetchStats()]);

      // Detect genuinely new assignments (skip the very first load).
      if (seenOrderIds.current === null) {
        seenOrderIds.current = new Set(orders.map((o) => o.id));
      } else {
        const fresh = orders.filter((o) => !seenOrderIds.current!.has(o.id));
        if (fresh.length > 0) {
          fresh.forEach((o) => seenOrderIds.current!.add(o.id));
          notifyNewOrder(fresh.length);
        }
        // Forget orders that are gone so re-assignment re-pings.
        const current = new Set(orders.map((o) => o.id));
        seenOrderIds.current.forEach((id) => {
          if (!current.has(id)) seenOrderIds.current!.delete(id);
        });
      }

      setOrders(orders);
      setStats(s);
    } catch (e) {
      if (e instanceof Error && "status" in e && (e as { status?: number }).status === 401) {
        onLogout();
        return;
      }
      toast.error("Orders load nahi hue");
    } finally {
      setLoadingOrders(false);
    }
  }, [onLogout]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20_000); // keep orders fresh
    return () => clearInterval(id);
  }, [refresh]);

  // ── Live location broadcast while online ──
  const lastPushRef = useRef(0);
  useEffect(() => {
    if (!online || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPushRef.current < 8000) return; // throttle to ~8s
        lastPushRef.current = now;
        pushLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [online]);

  const toggleOnline = async () => {
    setTogglingOnline(true);
    const next = online ? "offline" : "available";
    try {
      await setOnlineStatus(next);
      setRider({ ...rider, status: next });
      toast.success(next === "available" ? "Aap online ho 🟢" : "Aap offline ho");
    } catch {
      toast.error("Status change nahi hua");
    } finally {
      setTogglingOnline(false);
    }
  };

  return (
    <div className="max-w-md mx-auto pb-10">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-saffron rounded-xl flex items-center justify-center">
            <Bike className="text-white" size={20} />
          </div>
          <div className="leading-tight">
            <p className="font-bold text-brown text-[15px]">{rider.name}</p>
            <p className="text-[11px] text-gray-500">
              {rider.vehicle_number || "Atalmart Rider"}
            </p>
          </div>
        </div>
        <button onClick={onLogout} className="p-2 text-gray-400 hover:text-red-500" aria-label="Logout">
          <LogOut size={18} />
        </button>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Online toggle */}
        <button
          onClick={toggleOnline}
          disabled={togglingOnline}
          className={`w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-colors ${
            online ? "bg-indian-green hover:bg-green-700" : "bg-gray-400 hover:bg-gray-500"
          }`}
        >
          {togglingOnline ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Power size={18} />
          )}
          {online ? "Online — taking orders" : "Offline — tap to go online"}
        </button>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Package size={16} />}
            label="Aaj deliveries"
            value={stats ? String(stats.today.deliveries) : "—"}
          />
          <StatCard
            icon={<IndianRupee size={16} />}
            label="Aaj kamai"
            value={stats ? `₹${stats.today.earnings}` : "—"}
            accent
          />
        </div>
        {stats && (
          <p className="text-[11px] text-gray-400 text-center -mt-1">
            All-time: {stats.allTime.deliveries} deliveries · ₹{stats.allTime.earnings}
          </p>
        )}

        {/* Orders */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="font-bold text-brown">
            Active orders {orders.length > 0 && `(${orders.length})`}
          </h2>
          <button
            onClick={refresh}
            className="text-gray-400 hover:text-saffron p-1"
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={loadingOrders ? "animate-spin" : ""} />
          </button>
        </div>

        {loadingOrders && orders.length === 0 ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="animate-spin text-saffron" size={24} />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-5xl mb-2">🛵</div>
            <p className="text-brown font-semibold">Koi active order nahi</p>
            <p className="text-sm text-gray-500 mt-1">
              {online ? "Naye orders yahan aayenge" : "Online jao orders lene ke liye"}
            </p>
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard key={o.id} order={o} onChanged={refresh} />
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
          accent ? "bg-green-light text-indian-green" : "bg-saffron-light text-saffron"
        }`}
      >
        {icon}
      </div>
      <p className="text-xl font-bold text-brown leading-none">{value}</p>
      <p className="text-[11px] text-gray-500 mt-1">{label}</p>
    </div>
  );
}

// Next action per status along the delivery leg.
const NEXT_ACTION: Record<string, { to: string; label: string } | null> = {
  confirmed: { to: "picked", label: "Mark Picked Up" },
  picking: { to: "picked", label: "Mark Picked Up" },
  picked: { to: "out_for_delivery", label: "Start Delivery" },
  out_for_delivery: { to: "delivered", label: "Mark Delivered" },
};

function OrderCard({
  order,
  onChanged,
}: {
  order: RiderOrder;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const action = NEXT_ACTION[order.status];
  const itemsLabel = order.items
    .map((i) => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
    .join(", ");

  const advance = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await updateOrderStatus(order.id, action.to);
      toast.success(
        action.to === "delivered" ? "Delivered! 🎉" : "Status updated",
      );
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-brown">
            {order.customer?.name || "Customer"}
          </p>
          <p className="text-[11px] text-gray-400 font-mono">
            #{order.id.slice(0, 8)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold text-brown">₹{Math.round(order.total)}</p>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
              order.payment_method === "online"
                ? "bg-green-light text-indian-green"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {order.payment_method === "online" ? "Paid" : "COD"}
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2 text-sm text-gray-600">
        <MapPin size={15} className="text-saffron shrink-0 mt-0.5" />
        <span>{order.address_line}</span>
      </div>

      {/* Inline drop-location preview (Navigate button below opens full maps app) */}
      <OrderMap lat={order.lat} lng={order.lng} />

      {itemsLabel && (
        <p className="text-[12px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">
          {itemsLabel}
        </p>
      )}

      <div className="flex gap-2">
        {order.phone && (
          <a
            href={`tel:${order.phone}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-brown hover:bg-gray-50"
          >
            <Phone size={15} /> Call
          </a>
        )}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-brown hover:bg-gray-50"
        >
          <Navigation size={15} /> Navigate
        </a>
      </div>

      {action ? (
        <button
          onClick={advance}
          disabled={busy}
          className="w-full py-3 bg-saffron text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : null}
          {action.label}
        </button>
      ) : (
        <div className="w-full py-2.5 bg-green-light text-indian-green font-semibold rounded-xl flex items-center justify-center gap-2 text-sm">
          <CheckCircle2 size={16} /> {order.status.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}
