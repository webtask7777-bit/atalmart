import { APP_NAME, INCORPORATION_DATE } from "@/lib/constants";

export const metadata = {
  title: "Terms & Conditions",
  description: `${APP_NAME} ke terms and conditions — ordering, delivery, payments, returns aur refunds se judi shartein.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold text-brown">Terms & Conditions</h1>
      <p className="text-[12px] text-gray-500 mt-1">
        Last updated: {INCORPORATION_DATE}
      </p>

      <div className="mt-6 space-y-6 text-[13px] text-gray-600 leading-relaxed">
        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            1. Acceptance of terms
          </h2>
          <p>
            By placing an order on {APP_NAME}, you agree to these Terms &
            Conditions. If you do not agree, please do not use the app or
            website.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            2. Service area
          </h2>
          <p>
            {APP_NAME} currently delivers only within specific pincodes in
            Naya Raipur, Chhattisgarh. Orders placed from outside our
            serviceable area cannot be fulfilled. Check the{" "}
            <a href="/service-area" className="text-saffron hover:underline">
              coverage map
            </a>{" "}
            before placing an order.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            3. Orders and pricing
          </h2>
          <p>
            Product prices, availability, and delivery charges shown at
            checkout are final at the time of order confirmation. A minimum
            order value applies; a delivery fee is charged below the
            free-delivery threshold, both shown at checkout.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">4. Payments</h2>
          <p>
            We accept Cash on Delivery, UPI, and Credit/Debit cards
            (processed via Razorpay). No additional charges apply for COD.
            Online payments are handled by our third-party payment
            processor and are subject to their terms.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            5. Cancellations
          </h2>
          <p>
            Orders can be cancelled free of charge before they move to
            &quot;Out for Delivery&quot;. Once a rider has picked up the
            order, a cancellation fee may apply.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            6. Returns and refunds
          </h2>
          <p>
            Damaged, incorrect, or quality-issue items can be reported within
            24 hours of delivery for a replacement or refund. See our{" "}
            <a href="/faq" className="text-saffron hover:underline">
              FAQ
            </a>{" "}
            for details. Refunds for cancelled COD orders are instant;
            refunds for online payments are credited back to the source
            account within 3–5 business days.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            7. User conduct
          </h2>
          <p>
            You agree not to misuse the platform, place fraudulent orders, or
            attempt to interfere with the normal operation of the service.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            8. Limitation of liability
          </h2>
          <p>
            {APP_NAME} is not liable for delays caused by circumstances
            beyond our reasonable control, including but not limited to
            weather, traffic, or force majeure events.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            9. Changes to these terms
          </h2>
          <p>
            We may update these terms from time to time. Continued use of
            the app after changes constitutes acceptance of the revised
            terms.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">10. Contact</h2>
          <p>
            For questions about these terms, reach us at{" "}
            <a
              href="mailto:webtask7777@gmail.com"
              className="text-saffron hover:underline"
            >
              webtask7777@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
