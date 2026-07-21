import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refer & Earn",
  description:
    "Dosto ko Atalmart refer karein aur wallet rewards paayein.",
  alternates: { canonical: "/refer" },
  robots: { index: false, follow: true },
};

export default function ReferLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
