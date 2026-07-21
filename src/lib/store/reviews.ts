import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Review } from "@/types";
import { isDemoMode } from "@/lib/supabase/helpers";

interface ReviewsStore {
  reviews: Review[];
  add: (review: Omit<Review, "id" | "created_at">) => Review;
  remove: (id: string) => void;
  toggleHidden: (id: string) => void;
  reset: () => void;
}

const SEED: Review[] = [
  {
    id: "rv1",
    product_id: "p19", // Amul Taaza Milk
    user_id: "u1",
    user_name: "Ravi S.",
    rating: 5,
    comment: "Fresh milk, always on time! Bahut jaldi pohanch jaata hai.",
    created_at: "2026-05-10T08:30:00Z",
    order_id: "demo-1",
  },
  {
    id: "rv2",
    product_id: "p31", // Aashirvaad Atta
    user_id: "u2",
    user_name: "Priya V.",
    rating: 4,
    comment: "Acchi quality. Rotis soft banti hain. Packing thodi better ho sakti hai.",
    created_at: "2026-05-12T19:15:00Z",
    order_id: "demo-2",
  },
  {
    id: "rv3",
    product_id: "p31",
    user_id: "u3",
    user_name: "Amit Y.",
    rating: 5,
    comment: "Bilkul fresh aata. Family ko bahut pasand aaya.",
    created_at: "2026-05-15T11:00:00Z",
    order_id: "demo-3",
  },
  {
    id: "rv4",
    product_id: "p98", // Maggi
    user_id: "u2",
    user_name: "Priya V.",
    rating: 5,
    comment: "Maggi toh Maggi hai 🍜 Order kiya, 8 minute me mil gaya!",
    created_at: "2026-05-14T22:00:00Z",
  },
];

// Fabricated sample reviews belong to demo mode ONLY — a live store must
// never ship with fake customer reviews. (Their demo product_ids don't match
// live UUIDs anyway, but keep the data out of live localStorage entirely.)
const INITIAL: Review[] = isDemoMode() ? SEED : [];

export const useReviewsStore = create<ReviewsStore>()(
  persist(
    (set) => ({
      reviews: INITIAL,
      add: (review) => {
        const newReview: Review = {
          ...review,
          id: `rv_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          created_at: new Date().toISOString(),
        };
        set((s) => ({ reviews: [newReview, ...s.reviews] }));
        return newReview;
      },
      remove: (id) =>
        set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) })),
      toggleHidden: (id) =>
        set((s) => ({
          reviews: s.reviews.map((r) =>
            r.id === id ? { ...r, hidden: !r.hidden } : r,
          ),
        })),
      reset: () => set({ reviews: INITIAL }),
    }),
    { name: "atalmart-reviews" },
  ),
);

/** Aggregate review stats for a product. */
export interface ProductRating {
  count: number;
  average: number; // 0 if no reviews
  distribution: Record<1 | 2 | 3 | 4 | 5, number>; // count per star
}

export function getProductRating(
  reviews: Review[],
  productId: string,
): ProductRating {
  const productReviews = reviews.filter(
    (r) => r.product_id === productId && !r.hidden,
  );
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let sum = 0;
  for (const r of productReviews) {
    distribution[r.rating]++;
    sum += r.rating;
  }
  return {
    count: productReviews.length,
    average:
      productReviews.length > 0
        ? Math.round((sum / productReviews.length) * 10) / 10
        : 0,
    distribution,
  };
}
