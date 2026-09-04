import type { Metadata } from "next";
import { NotFoundView } from "@/components/customer/not-found-view";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

// Used when notFound() is thrown inside the storefront (e.g. a product id
// that no longer exists) — keeps the customer header/footer around the 404.
export default function CustomerNotFound() {
  return <NotFoundView />;
}
