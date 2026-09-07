import styles from "./PopatHero.module.css";

export type PopatBannerVariant =
  | "full-range"
  | "tea-time"
  | "premium"
  | "crunch-party"
  | "everyday-munching";

const bannerFiles: Record<PopatBannerVariant, string> = {
  "full-range": "popat-01-full-range",
  "tea-time": "popat-02-tea-time",
  premium: "popat-03-premium",
  "crunch-party": "popat-04-crunch-party",
  "everyday-munching": "popat-05-everyday-munching",
};

export type PopatStaticBannerProps = {
  variant?: PopatBannerVariant;
  alt?: string;
  className?: string;
  loading?: "eager" | "lazy";
};

export function PopatStaticBanner({
  variant = "full-range",
  alt = "Popat snacks collection",
  className = "",
  loading = "lazy",
}: PopatStaticBannerProps) {
  const filename = bannerFiles[variant];

  return (
    <picture
      className={[styles.staticBanner, className].filter(Boolean).join(" ")}
    >
      <source
        media="(max-width: 640px)"
        srcSet={"/popat/banners/mobile/" + filename + "-1080x1080.webp"}
      />
      <source
        media="(max-width: 1024px)"
        srcSet={"/popat/banners/promo/" + filename + "-1200x400.webp"}
      />
      <img
        src={"/popat/banners/desktop/" + filename + "-1920x600.webp"}
        width={1920}
        height={600}
        alt={alt}
        loading={loading}
        decoding="async"
      />
    </picture>
  );
}
