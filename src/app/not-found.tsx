import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { NotFoundView } from "@/components/customer/not-found-view";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

// Root-level 404 for URLs that match no route at all. It renders inside the
// root layout only (no storefront header), so it carries a minimal top bar.
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-100 px-4 py-3">
        <Link href="/" aria-label="Atalmart home" className="inline-block">
          <Logo className="text-2xl" />
        </Link>
      </header>
      <main className="flex-1">
        <NotFoundView />
      </main>
    </div>
  );
}
