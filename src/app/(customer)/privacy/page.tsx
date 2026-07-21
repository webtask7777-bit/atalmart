import { APP_NAME, INCORPORATION_DATE } from "@/lib/constants";

export const metadata = {
  title: "Privacy Policy",
  description: `${APP_NAME} ki privacy policy — hum aapki personal information kaise collect, use aur protect karte hain.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold text-brown">Privacy Policy</h1>
      <p className="text-[12px] text-gray-400 mt-1">
        Last updated: {INCORPORATION_DATE}
      </p>

      <div className="mt-6 space-y-6 text-[13px] text-gray-600 leading-relaxed">
        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            1. Information we collect
          </h2>
          <p>
            To process your orders, we collect your name, phone number,
            delivery address, and order history. Payment details (card/UPI)
            are collected and processed directly by our payment partner
            (Razorpay) — we do not store your card or UPI credentials.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            2. How we use your information
          </h2>
          <p>
            Your information is used to fulfil orders, coordinate delivery,
            send order status updates, provide customer support, and
            improve our service. We do not sell your personal data to third
            parties.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            3. Location data
          </h2>
          <p>
            With your permission, we use your device location to check
            delivery eligibility and to help our delivery riders reach you
            faster. You can decline location access, though this may limit
            certain features (e.g. the &quot;check my location&quot; tool on
            the coverage map).
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            4. Data sharing
          </h2>
          <p>
            We share order and delivery details with our delivery riders and
            payment processor only to the extent necessary to fulfil your
            order. We do not share your data with advertisers.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            5. Data retention
          </h2>
          <p>
            We retain order history and account information for as long as
            your account is active, or as required to comply with legal and
            tax obligations.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">6. Your rights</h2>
          <p>
            You can request access to, correction of, or deletion of your
            personal data by writing to{" "}
            <a
              href="mailto:webtask7777@gmail.com"
              className="text-saffron hover:underline"
            >
              webtask7777@gmail.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-brown mb-1">
            7. Changes to this policy
          </h2>
          <p>
            We may update this policy from time to time. Material changes
            will be reflected on this page with an updated date.
          </p>
        </section>
      </div>
    </div>
  );
}
