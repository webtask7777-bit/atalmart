import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, MapPin, ShieldCheck, Truck, Zap } from "lucide-react";
import { APP_NAME, CATEGORIES_SEED, DELIVERY_FEE, FREE_DELIVERY_ABOVE, SUPPORT_PHONE } from "@/lib/constants";
import { SECTOR_AREAS, findSectorArea } from "@/lib/sectors-data";
import { formatEta } from "@/lib/delivery-zones";
import { CategoryIcon } from "@/components/customer/category-icon";

// One static landing page per mapped sector — "grocery delivery in Sector 24
// Naya Raipur" style queries. Content is generated from sectors-data.ts.

type Props = { params: Promise<{ sector: string }> };

const BASE = "https://atalmart.com";

export function generateStaticParams() {
  return SECTOR_AREAS.map((s) => ({ sector: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sector } = await params;
  const s = findSectorArea(sector);
  if (!s) return { title: "Area not found", robots: { index: false } };
  const title = s.active
    ? `Grocery Delivery in ${s.name}, Naya Raipur — ${formatEta(s.eta)}`
    : `${s.name}, Naya Raipur — Grocery Delivery Coming Soon`;
  const description = s.active
    ? `${s.name} (${s.pincode}) mein ${APP_NAME} se groceries, dairy, snacks aur daily essentials ${formatEta(s.eta)} mein. Free delivery ₹${FREE_DELIVERY_ABOVE}+ par, COD aur UPI dono.`
    : `${APP_NAME} ki quick grocery delivery ${s.name}, Naya Raipur mein jald shuru ho rahi hai. Abhi Sector 19–30 aur Capital Complex mein live.`;
  return {
    title,
    description,
    alternates: { canonical: `/delivery/${s.slug}` },
    openGraph: { title: `${title} — ${APP_NAME}`, description, url: `${BASE}/delivery/${s.slug}`, type: "website" },
    robots: s.active ? undefined : { index: false, follow: true },
  };
}

export default async function SectorDeliveryPage({ params }: Props) {
  const { sector } = await params;
  const s = findSectorArea(sector);
  if (!s) notFound();

  const neighbours = SECTOR_AREAS.filter((x) => x.active && x.slug !== s.slug)
    .map((x) => ({ x, d: Math.hypot(x.lat - s.lat, x.lng - s.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4)
    .map((n) => n.x);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Grocery delivery in ${s.name}, Naya Raipur`,
    serviceType: "Grocery delivery",
    provider: { "@type": "GroceryStore", name: APP_NAME, url: `${BASE}/`, telephone: `+91${SUPPORT_PHONE}` },
    areaServed: {
      "@type": "Place",
      name: `${s.name}, Atal Nagar-Nava Raipur, Chhattisgarh`,
      geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng },
      ...(s.pincodeApprox ? {} : { address: { "@type": "PostalAddress", postalCode: s.pincode, addressCountry: "IN" } }),
    },
    availableChannel: { "@type": "ServiceChannel", serviceUrl: `${BASE}/` },
    ...(s.active ? { hoursAvailable: undefined } : {}),
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav className="text-[11px] text-gray-500 flex items-center gap-1">
        <Link href="/" className="hover:text-saffron">Home</Link> ›{" "}
        <Link href="/delivery" className="hover:text-saffron">Delivery areas</Link> › <span className="text-brown">{s.name}</span>
      </nav>

      <h1 className="text-2xl md:text-3xl font-bold text-brown mt-3">
        {s.active ? `Grocery delivery in ${s.name}, Naya Raipur` : `${s.name}, Naya Raipur — coming soon`}
      </h1>
      <p className="text-sm text-gray-600 mt-1">{s.nameHi} · Atal Nagar-Nava Raipur · Pincode {s.pincode}{s.pincodeApprox ? " (approx.)" : ""}</p>

      {s.active ? (
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Tile icon={<Zap size={16} />} title={formatEta(s.eta)} sub="typical delivery" />
          <Tile icon={<Truck size={16} />} title={`₹${FREE_DELIVERY_ABOVE}+`} sub={`free delivery (else ₹${DELIVERY_FEE})`} />
          <Tile icon={<ShieldCheck size={16} />} title="COD + UPI" sub="pay your way" />
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
          <Clock size={16} className="mt-0.5 shrink-0" />
          {s.name} mapped hai lekin delivery abhi shuru nahi hui. Sector 19–30, Capital Complex, IIIT aur HNLU mein abhi live hain.
        </div>
      )}

      <section className="mt-6 text-sm text-brown-light leading-relaxed space-y-3">
        <p>
          {APP_NAME} ka dark store <strong>Sector 27</strong> mein hai — {s.name} se sirf{" "}
          <strong>{(s.distanceM / 1000).toFixed(1)} km</strong>. Order karte hi hamare electric-scooter
          riders nikalte hain, isliye {s.active ? `${s.name} mein aam taur par ${formatEta(s.eta)} mein delivery ho jaati hai` : "jaise hi service shuru hogi, quick delivery milegi"}.
        </p>
        <p>
          Kya milta hai: dairy (Amul doodh, dahi, paneer), atta-chawal-dal, fruits &amp; vegetables, snacks, cold
          drinks, chocolates, breakfast &amp; instant food, masale-tel, personal care, baby care, cleaning
          essentials aur pet care — 690+ products, sab 100% genuine, MRP se kam.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-brown mb-2">Shop by category</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES_SEED.map((c) => (
            <Link
              key={c.name}
              href={`/?category=${encodeURIComponent(c.name)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-brown hover:border-saffron hover:text-saffron-deep transition-colors"
            >
              <CategoryIcon name={c.name} size={18} fallback={<span>{c.icon}</span>} />
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-brown mb-2">Kaise order karein</h2>
        <ol className="list-decimal pl-5 text-sm text-brown-light space-y-1">
          <li>Pincode <strong>{s.pincode}</strong> daalein ya &quot;Use my current location&quot; dabayein.</li>
          <li>Products cart mein daalein — ₹{FREE_DELIVERY_ABOVE} se upar free delivery.</li>
          <li>Phone number se OTP login, address confirm, COD ya UPI se pay.</li>
          <li>Rider ko live map par track karein.</li>
        </ol>
      </section>

      {neighbours.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-brown mb-2">Paas ke areas</h2>
          <div className="flex flex-wrap gap-2">
            {neighbours.map((n) => (
              <Link key={n.slug} href={`/delivery/${n.slug}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-brown hover:bg-saffron-light hover:text-saffron-deep transition-colors">
                <MapPin size={11} /> {n.name} · {formatEta(n.eta)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-saffron text-white font-bold text-sm hover:bg-saffron-dark transition-colors">
          {s.active ? "Order now" : "Browse products"} <ArrowRight size={16} />
        </Link>
        <Link href="/service-area" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-saffron/40 text-saffron-deep font-bold text-sm hover:bg-saffron-light transition-colors">
          <MapPin size={16} /> Map
        </Link>
      </div>
    </div>
  );
}

function Tile({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="bg-saffron-light rounded-xl p-3 border border-orange-100">
      <div className="text-saffron">{icon}</div>
      <p className="text-sm font-bold text-brown mt-1 leading-tight">{title}</p>
      <p className="text-[10px] text-brown-light mt-0.5">{sub}</p>
    </div>
  );
}
