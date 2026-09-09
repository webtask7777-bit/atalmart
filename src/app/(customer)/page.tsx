import type { Metadata } from "next";
import HomeClient from "./home-client";
import { getHomeData } from "@/lib/server/home-data";

// The interactive home page lives in home-client.tsx ("use client") — this
// server wrapper exports the route metadata and fetches the catalogue so the
// first HTML already contains rails, category thumbnails and product cards.
export const metadata: Metadata = {
  description:
    "Naya Raipur ka apna quick delivery app. Groceries, dairy, snacks aur daily essentials — seedha aapke darwaze pe.",
  alternates: { canonical: "/" },
};

// Static page regenerated in the background (ISR): served from the CDN edge,
// catalogue at most a minute old. ?search= / ?category= are applied on the
// client after hydration (see SearchParamsBridge in home-client.tsx), so
// reading them never forces this page to render per request.
// Keep in step with HOME_REVALIDATE_SECONDS (segment config must be a literal).
export const revalidate = 60;

export default async function HomePage() {
  const data = await getHomeData();
  return (
    <>
      {/* Page h1 for SEO/accessibility — visually the hero carousel is the
          headline, so it stays screen-reader-only. */}
      <h1 className="sr-only">
        Atalmart — Naya Raipur (Atal Nagar) ka quick grocery delivery app
      </h1>
      <HomeClient
        initialProducts={data?.products}
        initialCategories={data?.categories}
      />
    </>
  );
}
