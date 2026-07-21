import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Orders",
  description:
    "Apne Atalmart orders ki history dekhein aur current order track karein.",
  alternates: { canonical: "/orders" },
  robots: { index: false, follow: true },
};

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
