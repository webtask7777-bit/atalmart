import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shopping Cart",
  description:
    "Apne Atalmart cart ke products dekhein, quantity badlein aur checkout karein.",
  alternates: { canonical: "/cart" },
  robots: { index: false, follow: true },
};

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
