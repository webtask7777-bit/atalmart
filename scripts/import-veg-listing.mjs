#!/usr/bin/env node
/**
 * Import the Fruits & Vegetables listing set (12 products × 7 cards) into the
 * live catalogue.
 *
 *   node scripts/import-veg-listing.mjs            # dry run — prints the plan
 *   node scripts/import-veg-listing.mjs --apply    # upload + write to DB
 *
 * Source: ~/Downloads/full-source-included-132-v1/01-final-listing-84/<slug>/webp-1600/
 *   07-clean-catalog → products.image_url (white-background pack shot for cards)
 *   01,03,06,04,05,02 → products.image_urls (gallery, in that order)
 * Storage path follows the admin picker convention: product-images/<id>/<role>-<sha8>.webp
 *
 * Existing products are matched by name and UPDATED (name, Hindi name, copy,
 * images, subcategory, active). Three Chhattisgarhi bhajis have no row yet
 * and are CREATED with introductory prices — adjust in admin after.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const SET = join(process.env.HOME, "Downloads/full-source-included-132-v1/01-final-listing-84");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const BUCKET = "product-images";

const CARDS = [
  ["07-clean-catalog", "fop"],
  ["01-main-listing", "main"],
  ["03-freshness", "fresh"],
  ["06-storage-prep", "storage"],
  ["04-recipe", "recipe"],
  ["05-serving", "serving"],
  ["02-product-label", "label"],
];

const COMMON = {
  country_of_origin: "India",
  seller_name: "Atalmart",
  return_policy: "Fresh produce: damaged, wilted ya galat item mile to delivery ke 24 ghante ke andar photo ke saath report karein — replacement ya full refund.",
  disclaimer: "Taazi sabzi hai — size, rang aur weight thoda alag ho sakta hai. Photo indicative hai. Istemaal se pehle dho lein.",
};

// slug → listing content. `match` = existing product name in the DB (null = create).
const PRODUCTS = [
  {
    slug: "lal-bhaji", match: null,
    name: "Lal Bhaji (Red Amaranth)", name_hi: "लाल भाजी", unit: "1 bunch", price: 25, mrp: 30, stock: 30,
    subcategory: "Leafy Greens & Bhaji",
    description: "Chhattisgarh ki sabse pasandeeda bhaji — gehre laal patte, komal dandi aur halki mitti-si mithaas. Lehsun-mirch ke tadke ke saath sookhi bhaji, ya dal aur bhaat ke saath. Subah khet se, shaam tak aapki rasoi mein.",
    key_features: ["Chhattisgarhi regional leafy green — lal bhaji", "Handpicked, tender leaves and stems", "Iron aur fibre se bharpoor", "Best for sookhi bhaji, dal-bhaji, saag"],
    shelf_life: "1–2 din (fridge mein dhak kar 3 din)",
  },
  {
    slug: "palak-bhaji", match: "Palak (Spinach)",
    name: "Palak Bhaji (Spinach)", name_hi: "पालक भाजी", subcategory: "Leafy Greens & Bhaji",
    description: "Taaza, gehri hari palak — chaude patte aur soft dandiyan. Palak paneer, dal palak, saag ya paratha ke liye. Roz subah fresh lot, bina murjhaye patte.",
    key_features: ["Fresh, deep-green leaves", "Iron, vitamin A aur K se bharpoor", "Palak paneer, dal palak, paratha ke liye ideal", "Dho kar seedha use karein"],
    shelf_life: "2 din (fridge mein 3–4 din)",
  },
  {
    slug: "chench-bhaji", match: null,
    name: "Chench Bhaji (Jute Leaves)", name_hi: "चेंच भाजी", unit: "1 bunch", price: 25, mrp: 30, stock: 30,
    subcategory: "Leafy Greens & Bhaji",
    description: "Chhattisgarh ki desi chench bhaji (pat saag) — chhote hare patte, halki lasdaar texture aur alag hi swaad. Lehsun, mirch aur pyaaz ke saath bhoon kar bhaat ke saath khaayi jaati hai. Monsoon ki special bhaji.",
    key_features: ["Regional favourite — chench / pat saag", "Tender young leaves, handpicked", "Calcium aur fibre ka accha source", "Best with garlic tadka and rice"],
    shelf_life: "1–2 din (fridge mein 3 din)",
  },
  {
    slug: "karmatta-bhaji", match: null,
    name: "Karmatta Bhaji (Water Spinach)", name_hi: "करमत्ता भाजी", unit: "1 bunch", price: 25, mrp: 30, stock: 30,
    subcategory: "Leafy Greens & Bhaji",
    description: "Karmatta (kalmi saag / water spinach) — lambe hare patte aur crunchy khokhli dandiyan jo tadke mein kurkuri rehti hain. Chhattisgarhi ghar ki roz ki bhaji: lehsun-mirch mein bhooni hui, ya dal ke saath.",
    key_features: ["Chhattisgarhi karmatta / kalmi saag", "Crunchy hollow stems, tender leaves", "Low calorie, vitamin C se bharpoor", "Quick stir-fry mein 5 minute mein ready"],
    shelf_life: "1–2 din (fridge mein 3 din)",
  },
  {
    slug: "dhaniya", match: "Dhaniya Patta (Coriander)",
    name: "Dhaniya Patta (Coriander)", name_hi: "धनिया पत्ती", subcategory: "Herbs & Seasonings",
    description: "Khushbudaar taaza dhaniya — har sabzi, dal aur chutney ki jaan. Chhote, gehre hare patte, jadd ke saath taaki der tak fresh rahe. Garnish, hari chutney ya raita ke liye.",
    key_features: ["Fresh, aromatic leaves with roots", "Garnish, chutney, raita ke liye", "Vitamin C aur antioxidants", "Jadd sahit — lambi freshness"],
    shelf_life: "2–3 din (fridge mein paper mein lapet kar 5 din)",
  },
  {
    slug: "hari-mirchi", match: "Mirchi Hari (Green Chilli)",
    name: "Hari Mirch (Green Chilli)", name_hi: "हरी मिर्च", subcategory: "Herbs & Seasonings",
    description: "Teekhi, taazi hari mirch — chamakdaar hara rang aur crunchy body. Tadka, chutney, achaar ya salad ke saath kaccha. Har din ki rasoi ka zaroori saathi.",
    key_features: ["Medium-hot desi green chilli", "Fresh, firm and glossy", "Tadka, chutney, achaar ke liye", "Vitamin C se bharpoor"],
    shelf_life: "4–5 din (fridge mein 10 din)",
  },
  {
    slug: "desi-tomato", match: "Tamatar (Tomato)",
    name: "Desi Tamatar (Tomato)", name_hi: "देसी टमाटर", subcategory: "Fresh Vegetables",
    description: "Laal, rasile desi tamatar — khatta-meetha swaad jo gravy, dal aur chutney mein alag hi rang laata hai. Haath se chhante hue, sahi pakke, na zyada naram na kacche.",
    key_features: ["Desi variety — tangy, juicy", "Hand-sorted, evenly ripe", "Gravy, dal, salad, chutney sab ke liye", "Lycopene aur vitamin C ka source"],
    shelf_life: "3–4 din room temperature (fridge mein 7 din)",
  },
  {
    slug: "adrak", match: "Adrak (Ginger)",
    name: "Adrak (Ginger)", name_hi: "अदरक", subcategory: "Herbs & Seasonings",
    description: "Taaza, khushboodar adrak — mota, ras se bhara, halki jhurri wala chhilka. Chai, tadka, adrak-lehsun paste aur kadha ke liye. Saaf-suthra, mitti dho kar bheja gaya.",
    key_features: ["Fresh, plump rhizomes", "Chai, paste, tadka, kadha ke liye", "Saaf, mitti-rahit", "Digestion aur immunity ke liye"],
    shelf_life: "7–10 din (fridge mein 2–3 hafte)",
  },
  {
    slug: "lehsun", match: "Lehsun (Garlic)",
    name: "Lehsun (Garlic)", name_hi: "लहसुन", subcategory: "Herbs & Seasonings",
    description: "Desi lehsun — tight, sookhi gaanth aur tez khushboo. Bhaji ke tadke, chutney, achaar aur adrak-lehsun paste ke liye. Chhattisgarhi bhaji ka asli swaad isi se aata hai.",
    key_features: ["Firm, dry bulbs — no sprouting", "Strong desi flavour", "Tadka, paste, chutney ke liye", "Cool dry jagah par mahino chale"],
    shelf_life: "3–4 hafte (dry, hawa-daar jagah)",
  },
  {
    slug: "pyaaz", match: "Pyaz (Onion)",
    name: "Pyaaz (Onion)", name_hi: "लाल प्याज़", subcategory: "Fresh Vegetables",
    description: "Laal pyaaz — medium size, tight parat, tez aur meethi dono khushboo. Gravy ka base, salad ka crunch, aur bhaji ka tadka. Sukhi, sadi-gali bina chhaant kar packed.",
    key_features: ["Red onion, medium size", "Sorted — no soft or sprouted bulbs", "Gravy, salad, tadka sab ke liye", "Pantry staple, cool dry storage"],
    shelf_life: "2–3 hafte (dry jagah, dhoop se door)",
  },
  {
    slug: "potato", match: "Aloo (Potato)",
    name: "Aloo (Potato)", name_hi: "आलू", subcategory: "Fresh Vegetables",
    description: "Saaf, medium-size desi aloo — sabzi, paratha, chaat aur fry sab ke liye all-rounder. Bina ankur, bina hare daag, dhoya hua aur chhaanta hua.",
    key_features: ["Medium size, all-purpose", "Washed, sorted — no sprouts or green spots", "Sabzi, paratha, fry, chaat", "Cool dark storage mein hafton chale"],
    shelf_life: "2–3 hafte (andhere, thandi jagah)",
  },
  {
    slug: "desi-cucumber", match: "Khira (Cucumber)",
    name: "Desi Kheera (Cucumber)", name_hi: "देसी खीरा", subcategory: "Fresh Vegetables",
    description: "Desi kheera — chhote, kurkure aur meethe, patla chhilka. Salad, raita, sandwich ya seedha namak-mirch ke saath. Garmi mein thandak, paani se bharpoor.",
    key_features: ["Desi variety — crisp and sweet", "Thin skin, seedha khaane layak", "Salad, raita, sandwich", "95% paani — hydrating"],
    shelf_life: "3–4 din (fridge mein 1 hafta)",
  },
];

async function getJson(path) { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H }); return r.json(); }

const cats = await getJson("categories?select=id,name");
const fv = cats.find((c) => c.name === "Fruits & Vegetables");
if (!fv) throw new Error("Fruits & Vegetables category missing");
const existing = await getJson(`products?select=id,name,price,mrp,unit,stock,active,image_url&category_id=eq.${fv.id}`);
const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));

async function uploadCard(productId, slug, card, role) {
  const file = join(SET, slug, "webp-1600", `${card}.webp`);
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
  if (p.match && !row) { console.log(`⚠️  ${p.slug}: expected existing "${p.match}" not found — skipping`); continue; }

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
    } else id = `(new:${p.slug})`;
    created++;
  } else {
    console.log(`~ UPDATE ${row.name} → ${p.name}  (₹${row.price}/₹${row.mrp}, ${row.unit}, stock ${row.stock})`);
    updated++;
  }

  const urls = [];
  for (const [card, role] of CARDS) { urls.push(await uploadCard(id, p.slug, card, role)); uploaded++; }
  const patch = {
    name: p.name, name_hi: p.name_hi, description: p.description, key_features: p.key_features,
    shelf_life: p.shelf_life, subcategory: p.subcategory, image_url: urls[0], image_urls: urls.slice(1),
    active: true, ...COMMON,
  };
  console.log(`    image_url=${urls[0].split("/").slice(-2).join("/")} + ${urls.length - 1} gallery · ${p.subcategory} · ${p.shelf_life}`);
  if (APPLY) {
    const r = await fetch(`${URL}/rest/v1/products?id=eq.${id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error(`patch ${p.name}: ${r.status} ${await r.text()}`);
  }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"}: ${created} created, ${updated} updated, ${uploaded} images${APPLY ? " uploaded" : " to upload"}.`);
if (!APPLY) console.log("Re-run with --apply to write.");
