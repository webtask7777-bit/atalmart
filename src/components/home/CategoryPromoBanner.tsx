import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { CategoryBanner } from "@/data/category-banners";
import styles from "./CategoryPromoBanner.module.css";

type CategoryPromoBannerProps = {
  banner: CategoryBanner;
  className?: string;
  imagePriority?: boolean;
};

type BannerStyle = CSSProperties & {
  "--banner-a": string;
  "--banner-b": string;
  "--banner-c": string;
  "--banner-accent": string;
  "--banner-glow": string;
};

export function CategoryPromoBanner({
  banner,
  className = "",
  imagePriority = false,
}: CategoryPromoBannerProps) {
  const style = {
    "--banner-a": banner.palette.from,
    "--banner-b": banner.palette.via,
    "--banner-c": banner.palette.to,
    "--banner-accent": banner.palette.accent,
    "--banner-glow": banner.palette.glow,
  } as BannerStyle;

  const isComingSoon = banner.availability === "coming-soon";

  return (
    <section
      className={[styles.banner, className].filter(Boolean).join(" ")}
      style={style}
      aria-label={`${banner.name} promotion`}
    >
      <span className={styles.dotField} aria-hidden="true" />
      <span className={styles.orbit} aria-hidden="true" />

      <div className={styles.copy}>
        <span className={styles.eyebrow}>{banner.eyebrow}</span>
        <h2 className={styles.title}>
          {banner.title}
          <span>{banner.accent}</span>
        </h2>
        <p className={styles.description}>{banner.description}</p>

        <div className={styles.actions}>
          {isComingSoon ? (
            <span className={styles.disabledCta} aria-label={`${banner.name} coming soon`}>
              Coming soon
            </span>
          ) : (
            <Link href={banner.href} prefetch={false} className={styles.cta}>
              {banner.ctaLabel}
              <span aria-hidden="true">→</span>
            </Link>
          )}
          <span className={styles.badge}>{banner.badge}</span>
        </div>

        {banner.note && <small className={styles.note}>{banner.note}</small>}
      </div>

      <div className={styles.art}>
        <span className={styles.glow} aria-hidden="true" />
        <div className={styles.productFrame}>
          <Image
          unoptimized
            src={banner.image}
            alt={`${banner.name} products`}
            fill
            priority={imagePriority}
            sizes="(max-width: 640px) 190px, (max-width: 900px) 240px, 300px"
            className={styles.productImage}
          />
        </div>
        <span className={styles.freshChip}>{banner.name}</span>
      </div>
    </section>
  );
}
