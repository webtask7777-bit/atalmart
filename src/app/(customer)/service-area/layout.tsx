import type { Metadata } from "next";

// Public "do we deliver to you?" page — indexable, unlike the account pages.
export const metadata: Metadata = {
  title: "Delivery Service Area — Naya Raipur",
  description:
    "Check karein ki Atalmart aapke area mein deliver karta hai ya nahi — Naya Raipur (Atal Nagar) ke serviceable sectors aur pincodes ka map.",
  alternates: { canonical: "/service-area" },
};

export default function ServiceAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
