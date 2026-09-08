import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PWAProvider } from "@/components/pwa-provider";
import { APP_NAME, STORE_LOCATION, SUPPORT_PHONE, SUPPORT_EMAIL } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#FF6B00",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled (WCAG 1.4.4). iOS's focus-zoom on small inputs
  // is handled in globals.css by keeping inputs ≥16px on phones instead.
};

export const metadata: Metadata = {
  metadataBase: new URL("https://atalmart.com"),
  title: {
    default: "Atalmart — Atal Nagar ki Atal Delivery",
    template: "%s — Atalmart",
  },
  description:
    "Naya Raipur ka apna quick delivery app. Groceries, dairy, snacks aur daily essentials — seedha aapke darwaze pe.",
  keywords: [
    "Atalmart",
    "Atal Nagar",
    "Naya Raipur",
    "Raipur",
    "Chhattisgarh",
    "delivery",
    "grocery",
    "quick delivery",
    "online grocery",
    "daily essentials",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Atalmart",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: "Atalmart",
    title: "Atalmart — Atal Nagar ki Atal Delivery",
    description:
      "Quick grocery delivery in Naya Raipur. Groceries, dairy, snacks aur daily essentials.",
    // og:image comes from app/opengraph-image.tsx (file convention).
  },
  twitter: {
    card: "summary_large_image",
    title: "Atalmart — Atal Nagar ki Atal Delivery",
    description:
      "Quick grocery delivery in Naya Raipur. Groceries, dairy, snacks aur daily essentials.",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/icons/favicon-32.png",
  },
};

// Organization + WebSite (sitelinks search box) + GroceryStore schema for the
// whole site. Product pages add their own Product node.
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://atalmart.com/#org",
      name: APP_NAME,
      url: "https://atalmart.com/",
      logo: "https://atalmart.com/icons/icon-512.png",
      email: SUPPORT_EMAIL,
      telephone: `+91${SUPPORT_PHONE}`,
    },
    {
      "@type": "WebSite",
      "@id": "https://atalmart.com/#website",
      url: "https://atalmart.com/",
      name: APP_NAME,
      publisher: { "@id": "https://atalmart.com/#org" },
      potentialAction: {
        "@type": "SearchAction",
        target: "https://atalmart.com/?search={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "GroceryStore",
      "@id": "https://atalmart.com/#store",
      name: APP_NAME,
      url: "https://atalmart.com/",
      telephone: `+91${SUPPORT_PHONE}`,
      priceRange: "₹",
      image: "https://atalmart.com/icons/icon-512.png",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Sector 27",
        addressLocality: "Atal Nagar-Nava Raipur",
        addressRegion: "Chhattisgarh",
        postalCode: "492101",
        addressCountry: "IN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: STORE_LOCATION.lat,
        longitude: STORE_LOCATION.lng,
      },
      areaServed: ["492101", "492014", "492015", "492018", "492030"].map(
        (postalCode) => ({ "@type": "PostalAddress", postalCode, addressCountry: "IN" }),
      ),
      parentOrganization: { "@id": "https://atalmart.com/#org" },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-IN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // globals.css sets scroll-behavior: smooth for in-page jumps. Next 16
      // no longer overrides that during route changes unless this attribute
      // is present — without it every navigation would animate scroll-to-top.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-white text-brown" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(SITE_JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
        {children}
        <PWAProvider />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#FF6B00",
              color: "#fff",
              border: "none",
            },
          }}
        />
        {/* Vercel observability — both no-op in dev, start collecting once
            deployed to Vercel. Analytics: page views + top pages.
            Speed Insights: Real User Monitoring (LCP, CLS, FCP). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
