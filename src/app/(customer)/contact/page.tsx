import { Mail, MapPin, Phone } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: "Contact Us",
  description: `Get in touch with ${APP_NAME} — support email, phone, and store address.`,
  alternates: { canonical: "/contact" },
};

// Owner-confirmed facts only (phone + email confirmed by Vivek 2026-07-21).
const CARDS = [
  {
    icon: Mail,
    label: "Email",
    value: "webtask7777@gmail.com",
    href: "mailto:webtask7777@gmail.com",
  },
  {
    icon: Phone,
    label: "Phone",
    value: "+91 7777066666",
    href: "tel:+917777066666",
  },
  {
    icon: MapPin,
    label: "Address",
    value: "Sector 28, Nawagaon Parsatti, Atal Nagar-Nava Raipur, Chhattisgarh 492018",
  },
];

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold text-brown">Contact us</h1>
      <p className="text-[13px] text-gray-500 mt-1">
        Order, delivery ya payment se related koi bhi sawaal ho, hum yahan
        hain.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        {CARDS.map((c) => {
          const Comp = c.href ? "a" : "div";
          return (
            <Comp
              key={c.label}
              {...(c.href ? { href: c.href } : {})}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3 hover:border-saffron transition-colors"
            >
              <div className="shrink-0 w-9 h-9 rounded-lg bg-saffron-light flex items-center justify-center">
                <c.icon size={18} className="text-saffron" />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                  {c.label}
                </div>
                <div className="text-sm font-medium text-brown mt-0.5">
                  {c.value}
                </div>
              </div>
            </Comp>
          );
        })}
      </div>

      <section className="mt-8 bg-saffron-light border border-orange-100 rounded-xl p-4">
        <h2 className="text-sm font-bold text-brown">Order-related help</h2>
        <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
          Apne order ka live status <a href="/orders" className="text-saffron font-medium hover:underline">My Orders</a> page
          par track kar sakte hain. Damaged ya galat item ke liye replacement
          ki request delivery ke 24 ghante ke andar kar sakte hain.
        </p>
      </section>
    </div>
  );
}
