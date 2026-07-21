import { Toaster } from "sonner";

/**
 * Rider app shell — deliberately standalone (no customer header/footer/bottom-
 * nav). It's a separate operator app that happens to live in the same Next.js
 * project so it can share the API + design tokens.
 */
export const metadata = {
  // absolute: opt out of the root "%s — Atalmart" template — the name
  // already contains the brand.
  title: { absolute: "Atalmart Rider" },
  description: "Delivery partner app",
  robots: { index: false, follow: false },
};

export default function RiderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-gray-50">
      {children}
      <Toaster position="top-center" richColors />
    </div>
  );
}
