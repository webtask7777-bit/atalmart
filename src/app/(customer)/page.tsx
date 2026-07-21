import type { Metadata } from "next";
import HomeClient from "./home-client";

// The interactive home page lives in home-client.tsx ("use client") — this
// server wrapper exists so the route can export its own metadata.
export const metadata: Metadata = {
  description:
    "Naya Raipur ka apna quick delivery app. Groceries, dairy, snacks aur daily essentials — seedha aapke darwaze pe.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      {/* Page h1 for SEO/accessibility — rendered here (server side, outside
          the useSearchParams Suspense boundary) so it's present in the static
          HTML; visually the hero carousel is the headline, so it stays
          screen-reader-only. */}
      <h1 className="sr-only">
        Atalmart — Naya Raipur (Atal Nagar) ka quick grocery delivery app
      </h1>
      <HomeClient />
    </>
  );
}
