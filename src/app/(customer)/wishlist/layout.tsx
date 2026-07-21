import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Wishlist",
  description: "Aapke save kiye hue products — Atalmart wishlist.",
  alternates: { canonical: "/wishlist" },
  robots: { index: false, follow: true },
};

export default function WishlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
