import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Clock, ArrowRight, Zap } from "lucide-react";
import { APP_NAME, FREE_DELIVERY_ABOVE } from "@/lib/constants";
import { SECTOR_AREAS } from "@/lib/sectors-data";
import { formatEta } from "@/lib/delivery-zones";

export const metadata: Metadata = {
  title: "Grocery Delivery in Naya Raipur — All Sectors",
  description:
    "Atalmart ki quick grocery delivery Naya Raipur (Atal Nagar) ke har sector mein — Sector 19 se 30, Capital Complex, IIIT, HNLU. Apna sector chuno, ETA dekho, order karo.",
  alternates: { canonical: "/delivery" },
};

// Static hub for the sector landing pages — the "grocery delivery in Naya
// Raipur" entry point for search, linking to every sector page.
export default function DeliveryHubPage() {
  const active = SECTOR_AREAS.filter((s) => s.active).sort((a, b) => a.distanceM - b.distanceM);
  const soon = SECTOR_AREAS.filter((s) => !s.active);
  const fastest = active[0];

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4 pb-24">
      <p className="text-xs font-bold tracking-widest text-saffron-deep uppercase">Service area</p>
      <h1 className="text-2xl md:text-3xl font-bold text-brown mt-1">
        Grocery delivery in Naya Raipur, sector by sector
      </h1>
      <p className="text-sm text-gray-600 mt-2 max-w-2xl">
        {APP_NAME} ka dark store Sector 27, Atal Nagar mein hai. Wahan se electric
        scooters par groceries, dairy, snacks aur daily essentials {fastest ? formatEta(fastest.eta) : "minutes"} se
        lekar {formatEta(active[active.length - 1].eta)} mein aapke darwaze tak. Free delivery ₹{FREE_DELIVERY_ABOVE}+ par.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {active.map((s) => (
          <Link
            key={s.slug}
            href={`/delivery/${s.slug}`}
            className="group rounded-2xl border border-gray-200 bg-white p-4 hover:border-saffron hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-brown group-hover:text-saffron-deep">{s.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.nameHi} · {s.pincode}
                  {s.pincodeApprox && "*"}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-light px-2 py-1 text-[11px] font-bold text-indian-green whitespace-nowrap">
                <Zap size={11} /> {formatEta(s.eta)}
              </span>
            </div>
            <p className="mt-3 text-[11px] text-gray-500 flex items-center gap-1">
              <MapPin size={11} /> {(s.distanceM / 1000).toFixed(1)} km from store
              <ArrowRight size={12} className="ml-auto text-saffron opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
          </Link>
        ))}
      </div>

      {soon.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-brown flex items-center gap-2">
            <Clock size={14} className="text-saffron" /> Jald aa rahe hain
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {soon.map((s) => s.name).join(", ")} — mapped hain, delivery jald shuru hogi.
          </p>
        </div>
      )}

      <p className="mt-8 text-[11px] text-gray-500">
        * Pincode nearest serviceable pincode ke hisaab se; checkout par apna sahi
        pincode daalein. Delivery time traffic aur order volume par depend karta hai.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-saffron text-white font-bold text-sm hover:bg-saffron-dark transition-colors">
          Shop now <ArrowRight size={16} />
        </Link>
        <Link href="/service-area" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-saffron/40 text-saffron-deep font-bold text-sm hover:bg-saffron-light transition-colors">
          <MapPin size={16} /> Map par check karein
        </Link>
      </div>
    </div>
  );
}
