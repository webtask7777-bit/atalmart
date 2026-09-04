"use client";

import { useState, useMemo } from "react";
import { CheckCircle2, MessageSquare, Star } from "lucide-react";
import { useReviewsStore, getProductRating } from "@/lib/store/reviews";
import { StarRating, StarPicker } from "@/components/customer/star-rating";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";

export function ProductReviews({ productId }: { productId: string }) {
  const reviews = useReviewsStore((s) => s.reviews);
  const addReview = useReviewsStore((s) => s.add);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const stats = useMemo(() => getProductRating(reviews, productId), [reviews, productId]);
  const productReviews = useMemo(
    () =>
      reviews
        .filter((r) => r.product_id === productId && !r.hidden)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
    [reviews, productId],
  );

  const submit = async () => {
    if (rating < 1 || rating > 5) return toast.error("Please pick a rating");
    if (!name.trim()) return toast.error("Please enter your name");
    if (!comment.trim() || comment.trim().length < 5)
      return toast.error("Comment must be at least 5 characters");

    setSubmitting(true);
    addReview({
      product_id: productId,
      user_id: `demo_${Date.now()}`,
      user_name: name.trim(),
      rating: rating as 1 | 2 | 3 | 4 | 5,
      comment: comment.trim(),
    });
    setSubmitting(false);
    setOpen(false);
    setName("");
    setComment("");
    setRating(5);
    toast.success("Thanks for your review! 🙏");
  };

  return (
    <section className="mt-8 bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-brown flex items-center gap-2">
          <MessageSquare size={16} className="text-saffron" />
          Customer Reviews
        </h3>
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-saffron border border-saffron rounded-full px-3 py-1.5 hover:bg-saffron-light"
        >
          Write a review
        </button>
      </div>

      {/* Stats summary */}
      {stats.count > 0 ? (
        <div className="flex items-start gap-4 mb-5 pb-4 border-b border-gray-100">
          <div className="text-center shrink-0">
            <p className="text-3xl font-bold text-brown leading-none">
              {stats.average}
            </p>
            <StarRating rating={stats.average} size={14} className="mt-1" />
            <p className="text-[11px] text-gray-500 mt-1">
              {stats.count} review{stats.count === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex-1 space-y-1">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const n = stats.distribution[star];
              const pct = stats.count > 0 ? (n / stats.count) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-gray-500">{star}</span>
                  <Star size={10} className="text-amber-500 fill-amber-500" />
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-gray-500 tabular-nums">
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-5 text-center py-4">
          No reviews yet — be the first to review this product!
        </p>
      )}

      {/* Reviews list */}
      <div className="space-y-4">
        {productReviews.map((r) => (
          <div key={r.id} className="border-b border-gray-100 pb-4 last:border-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-saffron-light text-saffron rounded-full flex items-center justify-center font-bold text-xs">
                  {r.user_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-brown leading-tight">
                    {r.user_name}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <StarRating rating={r.rating} size={11} />
                    {r.order_id && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indian-green bg-green-light px-1 py-0.5 rounded">
                        <CheckCircle2 size={8} />
                        Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-gray-500">
                {new Date(r.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <p className="text-sm text-brown-light leading-relaxed mt-2">
              {r.comment}
            </p>
          </div>
        ))}
      </div>

      {/* Write review modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Write a review"
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-brown-light mb-2">
              Your rating
            </p>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brown-light mb-1.5">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya V."
              maxLength={40}
              className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-brown-light mb-1.5">
              Your review
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience with this product..."
              rows={4}
              maxLength={500}
              className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-saffron focus:ring-2 focus:ring-saffron/20 resize-none"
            />
            <p className="text-[10px] text-gray-500 mt-1 text-right">
              {comment.length}/500
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" loading={submitting} onClick={submit}>
              Post review
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
