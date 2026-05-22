"use client";

import { Star } from "lucide-react";

/**
 * Read-only star display. Supports half-stars via fractional rating.
 * Default size 14px (good for product cards); pass size for larger.
 */
export function StarRating({
  rating,
  size = 14,
  showNumber = false,
  count,
  className = "",
}: {
  rating: number;
  size?: number;
  showNumber?: boolean;
  count?: number;
  className?: string;
}) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3 && rating - full <= 0.7;
  const fullCount = hasHalf ? full : Math.round(rating);

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const isFull = i < fullCount;
        const isHalf = hasHalf && i === fullCount;
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star
              size={size}
              className="text-gray-300 fill-gray-200 absolute inset-0"
            />
            {(isFull || isHalf) && (
              <Star
                size={size}
                className="text-amber-500 fill-amber-500 absolute inset-0"
                style={isHalf ? { clipPath: "inset(0 50% 0 0)" } : undefined}
              />
            )}
          </span>
        );
      })}
      {showNumber && rating > 0 && (
        <span
          className="ml-1 font-semibold text-brown tabular-nums"
          style={{ fontSize: size }}
        >
          {rating.toFixed(1)}
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span
          className="ml-1 text-gray-500"
          style={{ fontSize: Math.max(10, size - 2) }}
        >
          ({count})
        </span>
      )}
    </span>
  );
}

/**
 * Interactive star input — click/keyboard to pick a rating.
 */
export function StarPicker({
  value,
  onChange,
  size = 24,
}: {
  value: number;
  onChange: (rating: number) => void;
  size?: number;
}) {
  return (
    <div className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-label={`${r} star${r === 1 ? "" : "s"}`}
          className="hover:scale-110 transition-transform"
        >
          <Star
            size={size}
            className={
              r <= value
                ? "text-amber-500 fill-amber-500"
                : "text-gray-300 fill-gray-200"
            }
          />
        </button>
      ))}
    </div>
  );
}
