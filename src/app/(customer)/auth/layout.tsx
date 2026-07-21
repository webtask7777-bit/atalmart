import type { Metadata } from "next";

// Login is user-specific — unique title/description for the tab, but
// noindex so it never competes with real pages in search results.
export const metadata: Metadata = {
  title: "Login or Sign Up",
  description:
    "Apne phone number se Atalmart mein login karein — OTP ke saath quick aur secure sign in.",
  alternates: { canonical: "/auth" },
  robots: { index: false, follow: true },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
