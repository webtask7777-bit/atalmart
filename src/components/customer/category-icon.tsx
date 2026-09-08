import { ALL_CATEGORIES_ICON, categoryIconSrc } from "@/lib/category-icons";

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
 * Category outline icon from the SVG pack. A plain <img>: the files are
 * 2–5 KB static SVGs, so next/image would only add overhead.
 */
export function CategoryIcon({
  name,
  size = 20,
  label,
  className,
  fallback = null,
}: CategoryIconProps) {
  const src = name === "All" ? ALL_CATEGORIES_ICON : categoryIconSrc(name);
  if (!src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={className}
      draggable={false}
      loading="lazy"
      decoding="async"
    />
  );
}
