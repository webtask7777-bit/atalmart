import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PWAProvider } from "@/components/pwa-provider";
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
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Atalmart — Atal Nagar ki Atal Delivery",
  description:
    "Naya Raipur ka apna 10-minute delivery app. Groceries, dairy, snacks aur daily essentials — seedha aapke darwaze pe.",
  keywords: [
    "Atalmart",
    "Atal Nagar",
    "Naya Raipur",
    "Raipur",
    "Chhattisgarh",
    "delivery",
    "grocery",
    "10 minute delivery",
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
    siteName: "Atalmart",
    title: "Atalmart — Atal Nagar ki Atal Delivery",
    description:
      "10-minute grocery delivery in Naya Raipur. Groceries, dairy, snacks aur daily essentials.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-white text-brown" suppressHydrationWarning>
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
