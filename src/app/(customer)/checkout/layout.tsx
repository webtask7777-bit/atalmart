import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Delivery address aur payment method select karke apna Atalmart order place karein.",
  alternates: { canonical: "/checkout" },
  robots: { index: false, follow: true },
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
