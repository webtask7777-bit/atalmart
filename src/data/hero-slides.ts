export type HeroTone = "forest" | "offer" | "emerald" | "atta" | "popat";

export type HeroProduct = {
  /** Transparent packshot under public/atalmart/hero/products (cut from the
   *  live catalogue image of that SKU; ~720px, WebP with alpha). */
  src: string;
  alt: string;
};

export type HeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  ctaLabel: string;
  href: string;
  meta: string;
  tone: HeroTone;
  /** Left, centre (largest), right packshot — real products from the catalogue. */
  products: readonly HeroProduct[];
  /** Pill shown next to the packs ("₹0 delivery", "SAVE ₹70"…). */
  badge: string;
};

const p = "/atalmart/hero/products";

// Every slide is built like the Popat one: live copy + three real packshots
// floating on the tone gradient. Swap a product by replacing its cutout in
// public/atalmart/hero/products and the entry below; prices/claims must match
// the live catalogue (Aashirvaad 10 kg @ ₹510, MRP ₹580).
export const heroSlides = [
  {
    id: "quick-delivery",
    eyebrow: "⚡ FLASH DELIVERY",
    title: "Atal Nagar ka apna",
    accent: "quick grocery app",
    description: "Groceries, dairy aur snacks — abhi order karo, abhi pao.",
    ctaLabel: "Shop essentials",
    href: "/#daily-essentials",
    meta: "Fresh picks · Local delivery",
    tone: "forest",
    products: [
      { src: `${p}/amul-taaza-1l.webp`, alt: "Amul Taaza milk" },
      { src: `${p}/kurkure-masala-munch.webp`, alt: "Kurkure Masala Munch" },
      { src: `${p}/tropicana-orange.webp`, alt: "Tropicana orange juice" },
    ],
    badge: "● Atal Nagar",
  },
  {
    id: "new-user",
    eyebrow: "FIRST ORDER",
    title: "₹50 off your",
    accent: "first order",
    description: "Use code ATAL50 on ₹199+ orders",
    ctaLabel: "Apply now",
    href: "/cart",
    meta: "Code: ATAL50",
    tone: "offer",
    products: [
      { src: `${p}/dairy-milk-silk.webp`, alt: "Cadbury Dairy Milk Silk" },
      { src: `${p}/haldiram-aloo-bhujia.webp`, alt: "Haldiram Aloo Bhujia" },
      { src: `${p}/pepsi-750.webp`, alt: "Pepsi" },
    ],
    badge: "Code ATAL50",
  },
  {
    id: "free-delivery",
    eyebrow: "FREE DELIVERY",
    title: "Spend ₹299,",
    accent: "save ₹25",
    description: "Free delivery on every order above ₹299",
    ctaLabel: "Browse",
    href: "/#daily-essentials",
    meta: "₹0 delivery fee on eligible orders",
    tone: "emerald",
    products: [
      { src: `${p}/amul-butter-200.webp`, alt: "Amul Butter" },
      { src: `${p}/kelloggs-chocos.webp`, alt: "Kellogg's Chocos" },
      { src: `${p}/red-label-250.webp`, alt: "Red Label tea" },
    ],
    badge: "₹0 delivery",
  },
  {
    id: "aashirvaad-atta",
    eyebrow: "✦ TRENDING DEAL",
    // Two-line headline on phones too (a 3-line title made this slide taller
    // than the others, so the page shifted every time autoplay reached it).
    title: "Aashirvaad Atta",
    accent: "10 kg ab sirf ₹510",
    description: "100% whole wheat · MRP ₹580 se seedhe ₹70 ki bachat.",
    ctaLabel: "Shop this deal",
    href: "/product/9258f450-1fde-43e2-acca-77c0874a354a",
    meta: "₹70 OFF · 10 kg family pack",
    tone: "atta",
    products: [
      { src: `${p}/india-gate-tibar.webp`, alt: "India Gate basmati rice" },
      { src: `${p}/aashirvaad-chakki-10kg.webp`, alt: "Aashirvaad Shudh Chakki Atta 10 kg" },
      { src: `${p}/amul-ghee-1l.webp`, alt: "Amul cow ghee" },
    ],
    badge: "SAVE ₹70",
  },
  {
    id: "popat-namkeen",
    eyebrow: "🥨 POPAT NAMKEEN",
    title: "Har chai ka",
    accent: "crunchy saathi",
    description: "Sev, gathiya, mixture aur bhujiya — Popat ki poori range Atalmart par.",
    ctaLabel: "Shop Popat",
    href: "/?search=popat",
    meta: "Chhattisgarh ka favourite crunch",
    tone: "popat",
    products: [
      { src: `${p}/popat-gathiya.webp`, alt: "Popat Bhavnagri Gathiya" },
      { src: `${p}/popat-aloo-bhujiya.webp`, alt: "Popat Aloo Bhujiya" },
      { src: `${p}/popat-chana-dal.webp`, alt: "Popat Chana Dal Sev Mixture" },
    ],
    badge: "Perfect with chai ☕",
  },
] as const satisfies readonly HeroSlide[];
