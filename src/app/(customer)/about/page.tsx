import Image from "next/image";
import Link from "next/link";
import { Zap, ShieldCheck, Leaf, MapPin } from "lucide-react";
import { APP_NAME, INCORPORATION_DATE } from "@/lib/constants";

export const metadata = {
  title: "About Us",
  description: `${APP_NAME} is Atal Nagar's quick delivery app for groceries, dairy, snacks and daily essentials.`,
  alternates: { canonical: "/about" },
};

const STATS = [
  { label: "Products", value: "670+" },
  { label: "Categories", value: "19" },
  { label: "Serviceable pincodes", value: "5" },
  { label: "Delivery fleet", value: "100% electric" },
];

const VALUES = [
  {
    icon: Zap,
    title: "Quick delivery",
    body: "Order karo, jaldi se jaldi pohanchega — groceries, dairy, snacks aur daily essentials seedha aapke darwaze pe.",
  },
  {
    icon: Leaf,
    title: "100% electric fleet",
    body: "Hamari poori delivery fleet electric scooters pe chalti hai — eco-friendly delivery, Atal Nagar ki hawa saaf.",
  },
  {
    icon: ShieldCheck,
    title: "100% genuine",
    body: "Sabhi products verified sellers se, original packaging ke saath. Damaged ya galat item mila to 24 ghante mein replacement.",
  },
  {
    icon: MapPin,
    title: "Sirf Naya Raipur",
    body: "Hum jaanbujh kar sirf Atal Nagar, Naya Raipur ke 5 pincodes mein deliver karte hain — taaki service fast aur reliable rahe.",
  },
];

export default function AboutPage() {
  return (
    <div className="pb-24">
      {/* Hero */}
      <section className="relative w-full aspect-[1600/912] bg-brown overflow-hidden">
        <Image
          src="/about/hero-rider.webp"
          alt="Atalmart delivery rider on an electric scooter in Naya Raipur"
          fill
          preload
          className="object-contain"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-start justify-end px-4 sm:px-8 pb-6 sm:pb-10 max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-4xl font-bold text-white drop-shadow">
            Atal Nagar ki Atal Delivery
          </h1>
          <p className="text-sm sm:text-base text-white/90 mt-2 max-w-xl drop-shadow">
            {APP_NAME} Naya Raipur ka apna quick delivery app hai — groceries,
            dairy, snacks aur daily essentials, seedha aapke darwaze pe.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 pt-8 space-y-10">
        {/* Story */}
        <section>
          <h2 className="text-lg font-bold text-brown">Hum kaun hain</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            {APP_NAME} ek quick-commerce grocery delivery service hai jo sirf
            Atal Nagar, Naya Raipur (Chhattisgarh) ke residents ko serve
            karta hai. Company {INCORPORATION_DATE} ko incorporate hui thi.
            Hamara maqsad simple hai — mohalle ki dukaan jaisi familiarity,
            lekin app ki speed aur convenience ke saath.
          </p>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="bg-white border border-gray-200 rounded-xl p-4 text-center"
            >
              <div className="text-xl font-bold text-saffron">{s.value}</div>
              <div className="text-[11px] text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Values */}
        <section>
          <h2 className="text-lg font-bold text-brown mb-4">
            Humara vaada aapse
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3"
              >
                <div className="shrink-0 w-9 h-9 rounded-lg bg-saffron-light flex items-center justify-center">
                  <v.icon size={18} className="text-saffron" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-brown">
                    {v.title}
                  </h3>
                  <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">
                    {v.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Service area */}
        <section className="bg-saffron-light border border-orange-100 rounded-xl p-4">
          <h2 className="text-sm font-bold text-brown">
            Hum kahan deliver karte hain
          </h2>
          <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
            Abhi hum sirf Naya Raipur ke 5 pincodes mein deliver karte hain —
            492101, 492014, 492015, 492018, 492030 (Sector 17–29, Atal Nagar,
            Naya Raipur Township, Capital Complex aur Mantralaya area).
          </p>
          <Link
            href="/service-area"
            className="inline-block mt-3 text-saffron text-sm font-semibold hover:underline"
          >
            Apna area check karein →
          </Link>
        </section>

        {/* CTA */}
        <section className="text-center border-t border-gray-200 pt-8">
          <p className="text-sm text-gray-500">
            Sawaal ya suggestion hai?
          </p>
          <Link
            href="/contact"
            className="inline-block mt-2 px-5 py-2.5 bg-saffron text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors"
          >
            Contact us
          </Link>
        </section>
      </div>
    </div>
  );
}
