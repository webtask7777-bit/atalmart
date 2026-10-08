#!/usr/bin/env node
// Rebuild public/categories/<slug>.{png,webp} from the "vintage stall" art set
// (Oct 2026, 19 category shopfronts dropped in ~/Downloads). Run from the repo
// root: node scripts/build-category-covers-from-stalls.mjs

import sharp from "sharp";
import { copyFileSync } from "node:fs";
const D = "/Users/vivekkumar/Downloads/";
const MAP = {
  "Vintage Diwali Paan Shopfront-1.png": "paan-corner",
  "Charming Dairy Shopfront-2.png": "dairy",
  "Colorful Indian snacks shopfront-3.png": "snacks-munchies",
  "Fresh sabzi and fruit storefront-4.png": "fruits-vegetables",
  "Vintage Cold Drinks Shopfront-5.png": "cold-drinks-juices",
  "Breakfast and instant food shop-6.png": "breakfast-instant",
  "Vintage bakery and biscuit shop-7.png": "bakery-biscuits",
  "Mithai Shop with Diwali Sweets-8.png": "chocolates-sweets",
  "Chai and Coffee Shopfront-9.png": "tea-coffee",
  "Classic atta, rice and dal shop-10.png": "atta-rice-dal",
  "Ornate meat and fish shop-11.png": "chicken-meat-fish",
  "Masala & Oil Spice Shop-12.png": "masala-oil",
  "Baby Care Essentials Shop-13.png": "baby-care",
  "Vintage sauces and spreads storefront-14.png": "sauces-spreads",
  "Wellness essentials shopfront-15.png": "pharma-wellness",
  "Charming Cleaning Essentials Shop-16.png": "cleaning-essentials",
  "Personal care essentials shop-17.png": "personal-care",
  "Vintage Stationery Shop with Colorful Supplies-18.png": "stationery-office-school",
  "Pet Care Shopfront with Pet Essentials-19.png": "pet-care",
};
const BG = { r: 247, g: 248, b: 246, alpha: 1 }; // tile canvas #F7F8F6
for (const [file, slug] of Object.entries(MAP)) {
  const src = D + file;
  // Master copy (same convention as the existing <slug>.png next to each webp).
  copyFileSync(src, `public/categories/${slug}.png`);
  // Trim the empty margin so the stall fills the tile, then fit into a
  // 416×416 square (2× the 208px tile) on the tile's own background colour.
  const buf = await sharp(src).flatten({ background: BG }).trim({ threshold: 12 }).toBuffer();
  const out = await sharp(buf)
    .resize(416, 416, { fit: "contain", background: BG })
    .webp({ quality: 82, effort: 6 })
    .toFile(`public/categories/${slug}.webp`);
  console.log(`${slug}.webp ${out.width}x${out.height} ${(out.size / 1024).toFixed(1)}KB`);
}
