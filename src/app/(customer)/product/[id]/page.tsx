import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { isDemoMode } from "@/lib/supabase/helpers";
import {
  getPublicProductResult,
  primaryOffer,
  productDisplayName,
  productFamilyName,
  productMetaDescription,
  productOgImage,
} from "@/lib/server/public-product";
import { ProductDetailClient } from "./product-detail-client";

// The interactive detail view lives in product-detail-client.tsx ("use
// client"). This server wrapper exists so every product URL gets its own
// <title>, description, canonical, og:image and Product JSON-LD — without
// it, all 670+ product pages shipped the generic home metadata and were
// invisible to Google for "<product> Naya Raipur" searches.

type Props = { params: Promise<{ id: string }> };

const BASE = "https://atalmart.com";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { product, failed } = await getPublicProductResult(id);

  if (!product) {
    // Lookup failed (outage / env) → plain title, indexable, so a blip never
    // de-indexes a live SKU. Genuinely unknown id → noindex.
    return failed
      ? { title: "Product" }
      : { title: "Product", robots: { index: false, follow: true } };
  }

  // Price of the pack the page opens on (default variant when present) — the
  // same number the PDP, card and cart start from.
  const title = `${productDisplayName(product)} — ₹${primaryOffer(product).price}`;
  const description = productMetaDescription(product);
  const image = productOgImage(product);
  const url = `${BASE}/product/${product.id}`;

  return {
    title,
    description,
    alternates: { canonical: `/product/${product.id}` },
    openGraph: {
      title: `${title} — ${APP_NAME}`,
      description,
      url,
      siteName: APP_NAME,
      locale: "en_IN",
      type: "website",
      images: image
        ? [{ url: image, width: 800, height: 800, alt: product.name }]
        : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: `${title} — ${APP_NAME}`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  let jsonLd: Record<string, unknown> | null = null;
  if (!isDemoMode()) {
    const { product, failed } = await getPublicProductResult(id);
    // Real 404 (not a 200 with "Product not found") so dead SKUs drop out of
    // the index and the branded not-found page shows — but only when the
    // lookup actually ran. On a Supabase error we fall through and let the
    // client component fetch (and show its own not-found state if needed).
    if (!product && !failed) notFound();
    if (product) {

    const images = [product.image_url, ...(product.image_urls ?? [])].filter(
      (u): u is string => Boolean(u),
    );
    const offer = primaryOffer(product);
    const url = `${BASE}/product/${product.id}`;
    const availability = (stock: number) =>
      stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
    const seller = { "@type": "Organization", name: APP_NAME };
    // One Offer per sellable pack. A product with variants lists each pack
    // under an AggregateOffer so the structured data never quotes a price
    // the page doesn't sell at.
    const offers =
      offer.packs.length > 1
        ? {
            "@type": "AggregateOffer",
            url,
            priceCurrency: "INR",
            lowPrice: Math.min(...offer.packs.map((p) => p.price)),
            highPrice: Math.max(...offer.packs.map((p) => p.price)),
            offerCount: offer.packs.length,
            offers: offer.packs.map((p) => ({
              "@type": "Offer",
              url,
              name: p.unit,
              priceCurrency: "INR",
              price: p.price,
              itemCondition: "https://schema.org/NewCondition",
              availability: availability(p.stock),
              seller,
            })),
          }
        : {
            "@type": "Offer",
            url,
            priceCurrency: "INR",
            price: offer.price,
            itemCondition: "https://schema.org/NewCondition",
            availability: availability(offer.stock),
            seller,
            areaServed: "Naya Raipur, Chhattisgarh",
          };
    jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: productFamilyName(product),
      ...(product.name_hi ? { alternateName: product.name_hi } : {}),
      image: images,
      description: productMetaDescription(product),
      sku: product.id,
      ...(product.category?.name ? { category: product.category.name } : {}),
      offers,
    };
    }
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // JSON.stringify output is escaped so a "</script>" in a product
          // description can't break out of the tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <ProductDetailClient />
    </>
  );
}
