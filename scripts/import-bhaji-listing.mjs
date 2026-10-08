#!/usr/bin/env node
/**
 * Import the leafy-greens (bhaji) listing set — 13 studio images dropped on
 * 8 Oct 2026 — into the live catalogue.
 *
 *   node scripts/import-bhaji-listing.mjs            # dry run — prints the plan
 *   node scripts/import-bhaji-listing.mjs --apply    # upload + write to DB
 *
 * Source: incoming-images/bhaji/<n>.webp (1254², cream background).
 * Storage path follows the admin picker convention: product-images/<id>/<role>-<sha8>.webp
 *
 * Existing rows are matched by name and UPDATED (name, Hindi name, copy,
 * images, subcategory, active=true); their price/MRP/stock are left alone.
 * Rows that don't exist yet (poi, munga, kulfa) are CREATED at the same
 * introductory bhaji price as the earlier set — adjust in admin after.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const SRC = "incoming-images/bhaji";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("Supabase env missing");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const BUCKET = "product-images";

const COMMON = {
  country_of_origin: "India",
  seller_name: "Atalmart",
  disclaimer: "Taazi bhaji hai — size, rang aur weight thoda alag ho sakta hai. Photo indicative hai. Istemaal se pehle dho lein.",
};
const LEAFY = "Leafy Greens & Bhaji";
const NEW = { unit: "250 g", price: 25, mrp: 30, stock: 30 };

// `match` = existing product name in the DB (null = create). `fop` = image
// number for the card; `gallery` = extra image numbers.
const PRODUCTS = [
  {
    match: "Bathua Saag", fop: 2,
    name: "Bathua Bhaji (Chenopodium)", name_hi: "बथुआ भाजी", subcategory: LEAFY,
    description: "Sardiyon ki khaas bathua bhaji — mulayam hare patte, halki khattaas aur mitti-si khushboo. Bathua raita, bathua ka saag, paratha ya dal mein. Roz subah ka fresh lot.",
    key_features: ["Winter special — bathua / chenopodium", "Tender leaves, handpicked", "Iron, calcium aur vitamin A se bharpoor", "Raita, saag, paratha ke liye ideal"],
    shelf_life: "1–2 din (fridge mein dhak kar 3 din)",
  },
  {
    match: "Chana Saag", fop: 3,
    name: "Chana Bhaji (Chickpea Greens)", name_hi: "चना भाजी", subcategory: LEAFY,
    description: "Chhattisgarh ki pasandeeda chana bhaji — chane ke paudhe ke komal patte, halki khattaas ke saath. Lehsun-mirch ke tadke mein sookhi bhaji, ya dal ke saath. Sardi ke season ki bhaji.",
    key_features: ["Regional favourite — chana bhaji / chane ka saag", "Tender young chickpea leaves", "Protein aur fibre ka accha source", "Best with garlic tadka and bhaat"],
    shelf_life: "1–2 din (fridge mein 3 din)",
  },
  {
    match: "Methi Patta (Fenugreek)", fop: 4,
    name: "Methi Bhaji (Fenugreek)", name_hi: "मेथी भाजी", subcategory: LEAFY,
    description: "Taazi hari methi — chhote teen-patte wale komal patte aur halki kadwi, khushboodar swaad. Methi paratha, aloo-methi, methi matar malai ya dal ke liye. Roz subah fresh lot.",
    key_features: ["Fresh fenugreek leaves, handpicked", "Iron aur fibre se bharpoor", "Methi paratha, aloo-methi ke liye ideal", "Dho kar, patte tod kar use karein"],
    shelf_life: "1–2 din (fridge mein 3–4 din)",
  },
  {
    match: "Palak Bhaji (Spinach)", fop: 5, keepGallery: true,
    name: "Palak Bhaji (Spinach)", name_hi: "पालक भाजी", subcategory: LEAFY,
    description: "Taaza, gehri hari palak — chaude patte aur soft dandiyan. Palak paneer, dal palak, saag ya paratha ke liye. Roz subah fresh lot, bina murjhaye patte.",
    key_features: ["Fresh, deep-green leaves", "Iron, vitamin A aur K se bharpoor", "Palak paneer, dal palak, paratha ke liye ideal", "Dho kar seedha use karein"],
    shelf_life: "2 din (fridge mein 3–4 din)",
  },
  {
    match: null, fop: 7, ...NEW,
    name: "Poi Bhaji (Malabar Spinach)", name_hi: "पोई भाजी", subcategory: LEAFY,
    description: "Poi bhaji (Malabar spinach) — mote, chikne dil-jaise patte aur rasili dandi. Chhattisgarh aur Bengal ki favourite: lehsun-pyaaz ke saath bhooni hui, chana dal ke saath ya pakode mein. Monsoon-winter ki bhaji.",
    key_features: ["Poi / pui saag — Malabar spinach", "Thick glossy leaves, juicy stems", "Vitamin A, C aur iron se bharpoor", "Bhaji, dal ya pakode ke liye"],
    shelf_life: "2 din (fridge mein 3–4 din)",
  },
  {
    match: null, fop: 8, ...NEW,
    name: "Munga Bhaji (Moringa Leaves)", name_hi: "मुनगा भाजी", subcategory: LEAFY,
    description: "Munga (sahjan / moringa) ke chhote hare patte — Chhattisgarhi rasoi ki superfood bhaji. Lehsun-mirch mein bhoon kar bhaat ke saath, dal mein, ya besan ke pakode mein. Roz subah ka fresh tod.",
    key_features: ["Moringa / sahjan leaves — munga bhaji", "Protein, iron aur calcium se bharpoor", "Tender leaves, stripped easily from stems", "Sookhi bhaji, dal ya pakode ke liye"],
    shelf_life: "1–2 din (fridge mein 3 din)",
  },
  {
    match: "Sarson ka Saag (Mustard Greens)", fop: 9,
    name: "Sarson Bhaji (Mustard Greens)", name_hi: "सरसों भाजी", subcategory: LEAFY,
    description: "Taazi sarson ki bhaji — bade, lehraate hare patte aur halki teekhi khushboo. Sarson ka saag (makki ki roti ke saath), sookhi bhaji ya dal mein. Sardi ki sabse mashhoor bhaji.",
    key_features: ["Fresh mustard greens, large leaves", "Vitamin K, A aur C se bharpoor", "Sarson ka saag, bhaji, dal ke liye", "Dho kar, moti dandi hata kar use karein"],
    shelf_life: "2 din (fridge mein 3–4 din)",
  },
  {
    match: null, fop: 10, ...NEW,
    name: "Kulfa Bhaji (Purslane)", name_hi: "कुल्फा / नोनिया भाजी", subcategory: LEAFY,
    description: "Kulfa (nonia / purslane) bhaji — gol, mote, rasile patte aur laal-gulabi dandi, halki khatti-namkeen swaad. Lehsun ke tadke mein sookhi bhaji, dal ke saath ya raita mein. Garmi-barsaat ki desi bhaji.",
    key_features: ["Purslane — kulfa / nonia bhaji", "Omega-3 aur vitamin C se bharpoor", "Juicy leaves, tangy taste", "Bhaji, dal ya raita ke liye"],
    shelf_life: "1–2 din (fridge mein 3 din)",
  },
  {
    match: "Lettuce Iceberg", fop: 11, gallery: [12, 13, 1, 6],
    name: "Iceberg Lettuce", name_hi: "आइसबर्ग लेटस", subcategory: "Exotics",
    description: "Crisp, crunchy iceberg lettuce — kasa hua gol head, halke hare kurkure patte. Salad, burger, sandwich aur wraps ke liye. Thanda aur fresh deliver hota hai.",
    key_features: ["Crisp iceberg head, approx 400–500 g", "Salad, burger, sandwich, wraps ke liye", "Low calorie, high water content", "Dho kar fridge mein rakhein — 5–7 din crisp"],
    shelf_life: "5–7 din (fridge mein)",
  },
];

async function getJson(path) { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`); return r.json(); }

const cats = await getJson("categories?select=id,name");
const fv = cats.find((c) => c.name === "Fruits & Vegetables");
if (!fv) throw new Error("Fruits & Vegetables category missing");
const existing = await getJson(`products?select=id,name,price,mrp,unit,stock,active,image_url,image_urls&category_id=eq.${fv.id}`);
const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));

async function upload(productId, n, role) {
  const file = join(SRC, `${n}.webp`);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  const body = readFileSync(file);
  const sha = createHash("sha1").update(body).digest("hex").slice(0, 8);
  const path = `${productId}/${role}-${sha}.webp`;
  if (APPLY) {
    const r = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { ...H, "Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "public, max-age=31536000" },
      body,
    });
    if (!r.ok) throw new Error(`upload ${path}: ${r.status} ${await r.text()}`);
  }
  return `${URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

let created = 0, updated = 0, uploaded = 0;
for (const p of PRODUCTS) {
  const row = p.match ? byName.get(p.match.toLowerCase()) : null;
  if (p.match && !row) { console.log(`⚠️  expected existing "${p.match}" not found — skipping`); continue; }
  if (!p.match && byName.get(p.name.toLowerCase())) { console.log(`⚠️  "${p.name}" already exists — skipping create`); continue; }

  let id = row?.id;
  if (!id) {
    console.log(`+ CREATE ${p.name} — ${p.unit} ₹${p.price}/₹${p.mrp}, stock ${p.stock}`);
    if (APPLY) {
      const r = await fetch(`${URL}/rest/v1/products`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ name: p.name, name_hi: p.name_hi, category_id: fv.id, unit: p.unit, price: p.price, mrp: p.mrp, stock: p.stock, active: false, description: p.description }),
      });
      if (!r.ok) throw new Error(`create ${p.name}: ${r.status} ${await r.text()}`);
      id = (await r.json())[0].id;
    } else id = `(new:${p.fop})`;
    created++;
  } else {
    console.log(`~ UPDATE ${row.name} → ${p.name}  (₹${row.price}/₹${row.mrp}, ${row.unit}, stock ${row.stock}${row.active ? "" : ", was inactive"})`);
    updated++;
  }

  const fop = await upload(id, p.fop, "fop"); uploaded++;
  const gallery = [];
  for (const n of p.gallery ?? []) { gallery.push(await upload(id, n, `view${n}`)); uploaded++; }
  // Palak keeps its existing 7-card gallery behind the new front-of-pack.
  if (p.keepGallery && row) gallery.push(...[row.image_url, ...(row.image_urls ?? [])].filter(Boolean));

  const patch = {
    name: p.name, name_hi: p.name_hi, description: p.description, key_features: p.key_features,
    shelf_life: p.shelf_life, subcategory: p.subcategory, image_url: fop, image_urls: gallery,
    active: true, ...COMMON,
  };
  console.log(`    fop=${fop.split("/").slice(-2).join("/")} + ${gallery.length} gallery · ${p.subcategory}`);
  if (APPLY) {
    const r = await fetch(`${URL}/rest/v1/products?id=eq.${id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error(`patch ${p.name}: ${r.status} ${await r.text()}`);
  }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"}: ${created} created, ${updated} updated, ${uploaded} images${APPLY ? " uploaded" : " to upload"}.`);
if (!APPLY) console.log("Re-run with --apply to write.");
