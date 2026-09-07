export type PopatTheme =
  | "chai"
  | "tea-time"
  | "premium"
  | "party"
  | "everyday";

export type PopatProduct = {
  src: string;
  alt: string;
};

export type PopatSlide = {
  id: string;
  theme: PopatTheme;
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  cta: string;
  href: string;
  badge: string;
  products: readonly PopatProduct[];
};

const product = {
  alooBhujiya: {
    src: "/popat/products/aloo-bhujiya.webp",
    alt: "Popat Aloo Bhujiya",
  },
  bhavanagri: {
    src: "/popat/products/bhavanagri-gathiya.webp",
    alt: "Popat Bhavanagri Gathiya",
  },
  chanaDal: {
    src: "/popat/products/chana-dal-sev-mixture.webp",
    alt: "Popat Chana Dal Sev Mixture",
  },
  dalMoth: {
    src: "/popat/products/dal-moth.webp",
    alt: "Popat Dal Moth",
  },
  haraMatar: {
    src: "/popat/products/hara-matar.webp",
    alt: "Popat Hara Matar",
  },
  murukku: {
    src: "/popat/products/murukku.webp",
    alt: "Popat Murukku",
  },
  nylonSaloni: {
    src: "/popat/products/nylon-saloni.webp",
    alt: "Popat Nylon Saloni",
  },
  samosaStick: {
    src: "/popat/products/samosa-stick.webp",
    alt: "Popat Samosa Stick",
  },
  superSpecial: {
    src: "/popat/products/super-special-namkeen.webp",
    alt: "Popat Super Special Namkeen",
  },
  teaTime: {
    src: "/popat/products/tea-time.webp",
    alt: "Popat Tea Time",
  },
} as const satisfies Record<string, PopatProduct>;

// hrefs are live Atalmart routes: the range slides open the Popat search,
// the SKU-led slides deep-link to that product's page (ids from the live
// catalogue — same convention as the Aashirvaad hero banner).
export const popatSlides: readonly PopatSlide[] = [
  {
    id: "full-range",
    theme: "chai",
    eyebrow: "Popat Snacks Collection",
    title: "हर चाय का",
    accent: "Crunchy Saathi",
    description: "Favourite flavours. One trusted taste. हर break को बनाइए मज़ेदार।",
    cta: "Shop on Atalmart",
    href: "/?search=popat",
    badge: "10+ flavours",
    products: [
      product.alooBhujiya,
      product.haraMatar,
      product.dalMoth,
      product.murukku,
      product.chanaDal,
    ],
  },
  {
    id: "tea-time",
    theme: "tea-time",
    eyebrow: "Tea-Time Favourites",
    title: "Break हो तो",
    accent: "Popat के साथ",
    description: "चाय, बातें और हर bite में familiar crunchy taste.",
    cta: "Explore the range",
    href: "/product/5fba382d-0605-464c-a1f7-ba3a72be5c06",
    badge: "Tea-time ready",
    products: [
      product.teaTime,
      product.haraMatar,
      product.murukku,
      product.nylonSaloni,
      product.alooBhujiya,
    ],
  },
  {
    id: "premium",
    theme: "premium",
    eyebrow: "Premium Namkeen",
    title: "कुछ खास",
    accent: "हर Bite में",
    description: "Get-together हो या me-time—serve a crunch that stands out.",
    cta: "Order on Atalmart",
    href: "/product/9c3e6e4d-6218-4778-8b65-80a148d4faa3",
    badge: "Party favourite",
    products: [
      product.samosaStick,
      product.dalMoth,
      product.superSpecial,
      product.murukku,
      product.teaTime,
    ],
  },
  {
    id: "crunch-party",
    theme: "party",
    eyebrow: "Crunch Party",
    title: "हर Mood का",
    accent: "अपना Crunch",
    description: "Spicy, tangy, crispy—अपना favourite flavour चुनिए।",
    cta: "See all flavours",
    href: "/?search=popat",
    badge: "Mood = sorted",
    products: [
      product.samosaStick,
      product.nylonSaloni,
      product.murukku,
      product.chanaDal,
      product.bhavanagri,
    ],
  },
  {
    id: "everyday",
    theme: "everyday",
    eyebrow: "Everyday Munching",
    title: "छोटा Break",
    accent: "बड़ा Taste",
    description: "Everyday moments के लिए easy, crunchy और full-on tasty.",
    cta: "View the range",
    href: "/?search=popat",
    badge: "Anytime snack",
    products: [
      product.dalMoth,
      product.chanaDal,
      product.haraMatar,
      product.murukku,
      product.alooBhujiya,
    ],
  },
] as const;
