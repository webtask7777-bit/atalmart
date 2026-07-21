import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: "FAQs",
  description: `Frequently asked questions about ${APP_NAME} delivery, payments, and returns.`,
  alternates: { canonical: "/faq" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "Aap kahan deliver karte hain?",
    a: "Sirf Naya Raipur ke 5 pincodes mein — 492101, 492014, 492015, 492018, 492030 (Atal Nagar Sector 21–29, Sector 17, Naya Raipur Township, Capital Complex, Mantralaya).",
  },
  {
    q: "Delivery charge kitna hai?",
    a: "₹25 per order, lekin ₹299 se upar ke order par delivery bilkul free hai.",
  },
  {
    q: "Minimum order value kya hai?",
    a: "₹49.",
  },
  {
    q: "Kaunse payment methods available hain?",
    a: "Cash on Delivery (COD), UPI (GPay/PhonePe/Paytm/BHIM), aur Credit/Debit cards (Razorpay ke through). Koi COD charge ya hidden fee nahi hai.",
  },
  {
    q: "Delivery fleet kaisi hai?",
    a: "100% electric scooters — eco-friendly delivery.",
  },
  {
    q: "Store ke hours kya hain?",
    a: "Subah 7 baje se raat 11 baje tak, saptaah ke saatho din.",
  },
  {
    q: "Damaged ya galat item mile to kya karein?",
    a: "Delivery ke 24 ghante ke andar replacement request kar sakte hain — full refund/replacement, koi sawaal nahi puchha jaayega.",
  },
  {
    q: "Order cancel kaise karein?",
    a: "'Out for Delivery' status se pehle free cancellation. Rider pickup karne ke baad ₹15 ka cancellation fee lag sakta hai.",
  },
  {
    q: "Refund kitne time mein aata hai?",
    a: "COD order cancel karne par instant. Online payment ka refund 3-5 business days mein source account mein wapas aata hai.",
  },
  {
    q: "Coupon codes kaunse chal rahe hain?",
    a: "ATAL50 (₹50 off first order, min ₹199), NAYA10 (10% off max ₹100, min ₹299), GROCERY100 (₹100 off on ₹699+).",
  },
  {
    q: "Item stock mein nahi hai to?",
    a: "Agar order ke baad koi item unavailable ho jaaye, hum 2 minute ke andar call karke substitution ya refund ka option dete hain.",
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold text-brown">
        Frequently asked questions
      </h1>
      <p className="text-[13px] text-gray-500 mt-1">
        Order, delivery, payment aur returns se related common sawaalon ke
        jawaab.
      </p>

      <div className="mt-6 space-y-3">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="group bg-white border border-gray-200 rounded-xl p-4 open:border-saffron"
          >
            <summary className="text-sm font-semibold text-brown cursor-pointer list-none flex items-center justify-between gap-2">
              {f.q}
              <span className="text-saffron shrink-0 transition-transform group-open:rotate-45 text-lg leading-none">
                +
              </span>
            </summary>
            <p className="text-[13px] text-gray-600 mt-2 leading-relaxed">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
