import type { Metadata } from "next";
import Link from "next/link";
import {
  APP_NAME,
  SUPPORT_PHONE,
  SUPPORT_EMAIL,
} from "@/lib/constants";
import { effectiveReturnPolicy, CATEGORY_EXCEPTIONS } from "@/lib/policy";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description: `${APP_NAME} ki cancellation, return aur refund policy — kab cancel kar sakte hain, return window, aur refund kitne time mein aata hai.`,
  alternates: { canonical: "/refund-policy" },
};

// Every rule here is rendered from the single policy configuration
// (src/lib/policy.ts) that the product page, FAQ and the return-window
// check also use. Change the rule there, not here.
export default function RefundPolicyPage() {
  const policy = effectiveReturnPolicy(null);
  const exceptions = Object.entries(CATEGORY_EXCEPTIONS).filter(
    ([, ex]) => ex.reportWindowHours != null && ex.reportWindowHours !== policy.reportWindowHours,
  );
  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold text-brown">
        Cancellation &amp; Refund Policy
      </h1>
      <p className="text-[13px] text-gray-500 mt-1">
        Order cancel karne, item return karne aur refund se judi saari
        shartein ek jagah.
      </p>

      <div className="mt-6 space-y-6 text-sm text-brown-light leading-relaxed">
        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            1. Order cancellation
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Order &quot;Out for Delivery&quot; status mein jaane se pehle
              free mein cancel kar sakte hain — app ke{" "}
              <Link href="/orders" className="text-saffron hover:underline">
                My Orders
              </Link>{" "}
              section se.
            </li>
            <li>
              Rider ke pickup karne ke baad cancel karne par ₹15 tak ka
              cancellation fee lag sakta hai.
            </li>
            <li>
              Agar order ke baad koi item unavailable ho jaaye, hum aapko call
              karke substitution ya us item ke refund ka option dete hain.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            2. Returns &amp; replacements
          </h2>
          <p>
            Delivery ke <strong>{policy.reportWindowHours} ghante</strong> ke andar
            return ya replacement request kar sakte hain, in cases mein:
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            {policy.eligible.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {exceptions.length > 0 && (
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {exceptions.map(([cat, ex]) => (
                <li key={cat}>
                  <strong>{cat}:</strong> report window {ex.reportWindowHours} ghante.
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2">
            Request app se (order → &quot;Request return&quot;) ya support
            number par bhejein. Fresh items (dairy, fruits &amp; vegetables,
            meat) ke liye delivery ke turant baad photo ke saath report karna
            best rehta hai. Return approve hone par full refund ya replacement
            milta hai — koi sawaal nahi puchha jaata.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            3. Refund timelines
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Cash on Delivery:</strong> cancel karne par kuch charge
              nahi hota — paisa liya hi nahi gaya. Delivered COD order ke
              approved return par refund aapke bataye UPI/bank account mein
              3–5 business days mein aata hai.
            </li>
            <li>
              <strong>Online payment (UPI / card via Razorpay):</strong> refund
              usi source account mein 3–5 business days mein credit hota hai.
              Bank ke hisaab se kabhi-kabhi 7 business days tak lag sakte
              hain.
            </li>
            <li>
              <strong>Direct UPI payment:</strong> refund usi UPI ID par bheja
              jaata hai jisse payment aaya tha, 3–5 business days mein.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            4. Non-returnable items
          </h2>
          <p>Hygiene aur safety ke kaaran ye items return nahi hote:</p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            {policy.notEligible.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">5. Help chahiye?</h2>
          <p>
            Support:{" "}
            <a
              href={`tel:+91${SUPPORT_PHONE}`}
              className="text-saffron hover:underline"
            >
              +91 {SUPPORT_PHONE}
            </a>{" "}
            ·{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-saffron hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            . Poori shartein{" "}
            <Link href="/terms" className="text-saffron hover:underline">
              Terms &amp; Conditions
            </Link>{" "}
            mein hain.
          </p>
        </section>
      </div>
    </div>
  );
}
