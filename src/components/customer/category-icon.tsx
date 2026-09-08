import { CATEGORY_SLUGS, CATEGORY_SPRITE } from "@/lib/category-icons";

interface CategoryIconProps {
  /** Category display name, or "All". */
  name: string;
  size?: number;
  /** Omit when visible category text sits next to the icon (decorative). */
  label?: string;
  className?: string;
  /** Rendered when the pack has no icon for this name (e.g. the seed emoji). */
  fallback?: React.ReactNode;
}

/**
 * Category outline icon from the SVG pack, drawn from the shared sprite.
 */
export function CategoryIcon({
  name,
  size = 20,
  label,
  className,
  fallback = null,
}: CategoryIconProps) {
  const slug = name === "All" ? "all" : CATEGORY_SLUGS[name];
  if (!slug) return <>{fallback}</>;
  return (
    // One external sprite (public/icons/category-sprite.svg, 12 KB, cached)
    // instead of a request per icon — 18 chips used to mean 18 fetches.
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      focusable="false"
    >
      <use href={`${CATEGORY_SPRITE}#category-${slug}`} />
    </svg>
  );
}
