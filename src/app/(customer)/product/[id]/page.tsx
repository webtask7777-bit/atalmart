import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { isDemoMode } from "@/lib/supabase/helpers";
import {
  getPublicProduct,
  productDisplayName,
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
  const product = await getPublicProduct(id);

  if (!product) {
    // Demo mode or unknown id — keep it out of the index, fall back to defaults.
    return { title: "Product", robots: { index: false, follow: true } };
  }

  const title = `${productDisplayName(product)} — ₹${product.price}`;
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
    const product = await getPublicProduct(id);
    // Real 404 (not a 200 with "Product not found") so dead SKUs drop out of
    // the index and the branded not-found page shows.
    if (!product) notFound();

    const images = [product.image_url, ...(product.image_urls ?? [])].filter(
      (u): u is string => Boolean(u),
    );
    jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      ...(product.name_hi ? { alternateName: product.name_hi } : {}),
      image: images,
      description: productMetaDescription(product),
      sku: product.id,
      ...(product.category?.name ? { category: product.category.name } : {}),
      offers: {
        "@type": "Offer",
        url: `${BASE}/product/${product.id}`,
        priceCurrency: "INR",
        price: product.price,
        itemCondition: "https://schema.org/NewCondition",
        availability:
          product.stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: APP_NAME },
        areaServed: "Naya Raipur, Chhattisgarh",
      },
    };
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
