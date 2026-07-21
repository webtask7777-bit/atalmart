import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Wallet",
  description: "Apna Atalmart wallet balance aur transaction history dekhein.",
  alternates: { canonical: "/wallet" },
  robots: { index: false, follow: true },
};

export default function WalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
