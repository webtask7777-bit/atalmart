import Link from "next/link";
import styles from "./DevbhogBanner.module.css";

export type DevbhogBannerProps = {
  className?: string;
  loading?: "eager" | "lazy";
};

/**
 * Devbhog dairy hero — the brand's art-directed creative from the owner's
 * visual set (Devbhog-Visual-Set-v2): 2560×860 desktop scene resized to
 * 1920×645, and the 1080×1350 portrait cut on phones. The whole banner links
 * to the Devbhog listing; copy is baked into the artwork.
 */
export function DevbhogBanner({ className = "", loading = "lazy" }: DevbhogBannerProps) {
  return (
    <Link
      href="/?search=devbhog"
      aria-label="Devbhog — everyday dairy: milk, dahi, ghee, sweets. Explore Devbhog"
      className={[styles.banner, className].filter(Boolean).join(" ")}
    >
      <picture>
        <source media="(max-width: 640px)" srcSet="/devbhog/devbhog-hero-1080x1350.webp" />
        <img
          src="/devbhog/devbhog-hero-1920x645.webp"
          width={1920}
          height={645}
          alt="Devbhog — Everyday dairy, made delightful. Milk, dahi, ghee, sweets."
          loading={loading}
          decoding="async"
        />
      </picture>
    </Link>
  );
}
