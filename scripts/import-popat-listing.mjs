#!/usr/bin/env node
/**
 * Import the Popat Namkeen range (37 SKUs) into the live catalogue.
 *
 *   node scripts/import-popat-listing.mjs            # dry run
 *   node scripts/import-popat-listing.mjs --apply    # upload + write
 *
 * Sources
 *   • /tmp/popat/products-ld.json  — name / pack / price / image scraped from
 *     popatnamkeen.com product pages (schema.org JSON-LD), see session notes.
 *   • /tmp/popat/img/<slug>.png    — the brand's own product photo (fallback).
 *   • ~/Downloads/popat-complete-source-included-v1 — 11 SKUs have studio
 *     packshot cutouts (1254²) + listing creatives (2048²); those become the
 *     card image and first gallery image.
 *
 * Everything is converted to WebP (max 1200 px, flattened on white) and
 * uploaded to product-images/<id>/<role>-<sha8>.webp. Products are created in
 * "Snacks & Munchies" › "Bhujia & Namkeen", price = MRP = the brand's website
 * price (no invented discount), stock 0 (listed as Sold out until stock lands).
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const PACK = join(process.env.HOME, "Downloads/popat-complete-source-included-v1");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const BUCKET = "product-images";
const CATEGORY = "Snacks & Munchies";
const SUBCATEGORY = "Bhujia & Namkeen";

const scraped = JSON.parse(readFileSync("/tmp/popat/products-ld.json", "utf8"));
const bySlug = Object.fromEntries(scraped.map((p) => [p.slug, p]));

// slug → { hi, type, blurb } — copy is per product; type drives features.
const TYPE = {
  sev: { line: "Besan ki patli, kurkuri sev — chai ke saath ya poha/upma par sprinkle karne ke liye.", features: ["Crispy besan sev", "Chai-time snack aur topping dono", "Vegetarian, no artificial colour"] },
  gathiya: { line: "Gujarati-style soft-crunchy gathiya — halki namkeen, kadhi-chhas ke saath perfect.", features: ["Traditional Gujarati gathiya", "Halka, crunchy, zyada oily nahi", "Chai aur chhas dono ke saath"] },
  mixture: { line: "Sev, boondi, dal aur peanuts ka masaledaar mix — har bite mein alag crunch.", features: ["Multi-ingredient namkeen mixture", "Masala balanced, na zyada teekha", "Party bowl aur chai-time favourite"] },
  munchies: { line: "Roasted-fried daal / matar ki namkeen — protein wala crunchy munch.", features: ["Daal / matar based namkeen", "High crunch, less oil", "Sharing pack"] },
  chiwda: { line: "Poha/chiwda based halka namkeen — thoda meetha, thoda teekha.", features: ["Poha-based, halka-phulka", "Sweet-tangy-spicy balance", "Diwali aur roz dono ke liye"] },
  stick: { line: "Crunchy sticks — bacchon ka favourite, tiffin aur travel snack.", features: ["Crunchy stick snack", "Kids' favourite", "Tiffin / travel friendly"] },
};

const PRODUCTS = {
  "aloo-bhujiya":       { hi: "पोपट आलू भुजिया", type: "sev", blurb: "Popat ki signature Aloo Bhujiya — aloo aur besan ki patli, masaledaar bhujiya jo chai ke saath khatam hone ka naam nahi leti. 'A royal crunch with royal taste'." },
  "barik-sev":          { hi: "पोपट बारीक सेव", type: "sev", blurb: "Bilkul patli, halki namkeen barik sev — bhel, poha, dahi-puri aur chaat ki topping ke liye must-have." },
  "bhavnagari-gathiya": { hi: "पोपट भावनगरी गाठिया", type: "gathiya", blurb: "Bhavnagar-style moti, soft gathiya — halki namkeen, kadhi ya chai ke saath. Popat ka bestseller gathiya." },
  "chana-dal":          { hi: "पोपट चना दाल", type: "munchies", blurb: "Crispy fried chana dal, halka namak-masala — protein-rich crunchy munch jo evening chai ke saath best lagta hai." },
  "chana-jor-garam":    { hi: "पोपट चना जोर गरम", type: "munchies", blurb: "Flattened chana ka classic street-style namkeen — chatpata masala, nimbu-pyaaz ke saath aur bhi mazedaar." },
  "dal-moth":           { hi: "पोपट दाल मोठ", type: "munchies", blurb: "Moth dal, sev aur masala ka crunchy mix — North India ka all-time favourite namkeen, Popat style." },
  "full-gathiya":       { hi: "पोपट फुल गाठिया", type: "gathiya", blurb: "Full-size moti gathiya, andar se soft bahar se crunchy — kadhi-gathiya banane ke liye bhi ideal." },
  "gol-gathiya":        { hi: "पोपट गोल गाठिया", type: "gathiya", blurb: "Gol ring-shaped gathiya — bacchon ko pasand, halki namkeen aur crunchy." },
  "gujrati-mixture":    { hi: "पोपट गुजराती मिक्सचर", type: "mixture", blurb: "Sev, gathiya, boondi aur peanuts ka Gujarati-style meetha-namkeen mixture." },
  "hara-matar":         { hi: "पोपट हरा मटर", type: "munchies", blurb: "Fried hara matar, namak-masala ke saath — crunchy, protein-rich, guilt-free munching." },
  "khatta-meetha":      { hi: "पोपट खट्टा मीठा", type: "mixture", blurb: "Sweet-and-tangy mixture — boondi, sev, dal aur kishmish ka classic khatta-meetha swaad." },
  "lahsun-sev":         { hi: "पोपट लहसुन सेव", type: "sev", blurb: "Lehsun ke tez flavour wali sev — teekhi, khushboodar, chai ke saath addictive." },
  "laung-sev":          { hi: "पोपट लौंग सेव", type: "sev", blurb: "Laung (clove) ke flavour wali moti sev — thodi teekhi, alag hi aroma." },
  "lite-chiwda":        { hi: "पोपट लाइट चिवड़ा", type: "chiwda", blurb: "Halka, kam-oil wala poha chiwda — roz ki chai ke saath light snack." },
  "makka-bhel":         { hi: "पोपट मक्का भेल", type: "chiwda", blurb: "Corn-flakes based bhel mix — crunchy makka, sev aur masala; seedha ya pyaaz-nimbu ke saath." },
  "marathi-chiwda":     { hi: "पोपट मराठी चिवड़ा", type: "chiwda", blurb: "Maharashtrian-style poha chiwda — peanuts, dal, curry patta aur halki mithaas." },
  "masala-gathiya":     { hi: "पोपट मसाला गाठिया", type: "gathiya", blurb: "Masala-coated gathiya — regular gathiya se zyada chatpata." },
  "masala-sev":         { hi: "पोपट मसाला सेव", type: "sev", blurb: "Teekhi masala sev — chaat, bhel aur chai sab ke liye." },
  "mota-gathiya":       { hi: "पोपट मोटा गाठिया", type: "gathiya", blurb: "Moti, soft gathiya — Gujarati nashte ka staple, kadhi ke saath best." },
  "muruku":             { hi: "पोपट मुरुकु", type: "stick", blurb: "South-Indian style spiral murukku — chawal-urad ka crunchy, halka namkeen snack." },
  "namkeen":            { hi: "पोपट सुपर स्पेशल नमकीन", type: "mixture", blurb: "Popat ka Super Special Namkeen — house-special mixture jisme sab kuch: sev, boondi, dal, peanuts, masala. 'Kuch khaas hai…!'" },
  "navratan-mixture":   { hi: "पोपट नवरतन मिक्सचर", type: "mixture", blurb: "Nau tarah ke ingredients ka rich mixture — dry fruits ke touch ke saath premium namkeen." },
  "nylon-saloni":       { hi: "पोपट नायलॉन सलोनी", type: "sev", blurb: "Bilkul patli 'nylon' sev — sabse halki, sabse crispy; bhel aur sev-puri ki jaan." },
  "papdi":              { hi: "पोपट पापड़ी", type: "gathiya", blurb: "Crispy besan papdi — chaat, dahi-papdi aur chai ke saath." },
  "popat-stick":        { hi: "पोपट स्टिक", type: "stick", blurb: "Popat ki famous crunchy sticks — bacchon aur bado sabka favourite tea-time snack." },
  "punjabi-bhel":       { hi: "पोपट पंजाबी भेल", type: "chiwda", blurb: "Punjabi-style chatpati bhel mix — murmura, sev, peanuts aur masala." },
  "punjabi-mixture":    { hi: "पोपट पंजाबी मिक्सचर", type: "mixture", blurb: "Bold, teekha Punjabi mixture — moti sev, dal aur peanuts ka dum." },
  "punjabi-tadka":      { hi: "पोपट पंजाबी तड़का", type: "munchies", blurb: "Tadke wale masale ka chatpata namkeen — Punjabi swaad, Popat crunch." },
  "raita-boondi":       { hi: "पोपट रायता बूंदी", type: "munchies", blurb: "Chhoti, crisp besan boondi — dahi mein daalo, raita ready; ya seedha chai ke saath." },
  "ratlami-sev":        { hi: "पोपट रतलामी सेव", type: "sev", blurb: "Ratlam ki famous moti, teekhi, laung-kali mirch wali sev — asli Malwa swaad." },
  "samosa-stick":       { hi: "पोपट समोसा स्टिक", type: "stick", blurb: "Samosa ke flavour wali crunchy sticks — Popat ka unique snack, ek baar khaoge to rukoge nahi." },
  "sev-gathiya":        { hi: "पोपट सेव गाठिया", type: "gathiya", blurb: "Sev aur gathiya ka combo pack — do textures, ek swaad." },
  "sev-murmura":        { hi: "पोपट सेव मुरमुरा", type: "chiwda", blurb: "Murmura aur sev ka halka-phulka mix — instant bhel ka base." },
  "tam-tam-mix":        { hi: "पोपट टम टम मिक्स", type: "mixture", blurb: "Popat ka fun mixture — colourful, crunchy aur chatpata; party bowl ke liye." },
  "tasty-sev-phali":    { hi: "पोपट टेस्टी सेव फली", type: "munchies", blurb: "Masala-coated peanuts (sev phali) — crunchy coating, andar roasted moongphali." },
  "tea-time":           { hi: "पोपट टी टाइम", type: "mixture", blurb: "Naam hi kaafi hai — chai ke saath banaya gaya halka namkeen mix. 'Break ho toh Popat ke saath'." },
  "tomato-sev":         { hi: "पोपट टमाटर सेव", type: "sev", blurb: "Tangy tomato flavour wali sev — bacchon ki favourite, halki khatti-meethi." },
};

// Studio assets from the pack (fop packshot + listing creative), by slug.
const ASSETS = {
  "aloo-bhujiya":       { fop: "04-packshot-cutouts/Popat Aloo Bhujiya Pouch Packshot.png", extra: ["04-packshot-cutouts/Popat Aloo Bhujiya Snack Pouch.png"], creative: "03-product-listing-creatives/popat-aloo-bhujiya.png" },
  "bhavnagari-gathiya": { fop: "04-packshot-cutouts/Popat Bhavanagri Gathiya Pouch.png", creative: "03-product-listing-creatives/popat-bhavanagri-gathiya.png" },
  "chana-dal":          { fop: "04-packshot-cutouts/Popat Chana Dal Sev Mixture Pouch.png", creative: "03-product-listing-creatives/popat-chana-dal-sev-mixture.png" },
  "dal-moth":           { fop: "04-packshot-cutouts/Popat Dal Moth Snack Pouch.png", creative: "03-product-listing-creatives/popat-dal-moth.png" },
  "hara-matar":         { fop: "04-packshot-cutouts/Popat Hara Matar pouch packshot.png", creative: "03-product-listing-creatives/popat-hara-matar.png" },
  "muruku":             { fop: "04-packshot-cutouts/Popat Murukku pouch packshot.png", creative: "03-product-listing-creatives/popat-murukku.png" },
  "nylon-saloni":       { fop: "04-packshot-cutouts/Popat Nylon Saloni Snack Pouch.png", creative: "03-product-listing-creatives/popat-nylon-saloni.png" },
  "samosa-stick":       { fop: "04-packshot-cutouts/Popat Samosa Stick catalog cutout.png", creative: "03-product-listing-creatives/popat-samosa-stick.png" },
  "popat-stick":        { fop: "05-original-source-images/Popat-Stick-1.webp", creative: "03-product-listing-creatives/popat-stick.png" },
  "namkeen":            { fop: "04-packshot-cutouts/Popat Super Special Namkeen Pouch.png", creative: "03-product-listing-creatives/popat-super-special-namkeen.png" },
  "tea-time":           { fop: "04-packshot-cutouts/Popat Tea Time Pouch Cutout.png", creative: "03-product-listing-creatives/popat-tea-time.png" },
};

const DISPLAY_NAME = { namkeen: "Popat Super Special Namkeen", muruku: "Popat Murukku" };

const COMMON = {
  country_of_origin: "India",
  seller_name: "Atalmart",
  return_policy: "Sealed pack damaged ya expired mile to delivery ke 24 ghante ke andar replacement ya refund. Khula pack return nahi hota.",
  disclaimer: "Packaging aur weight brand ke hisaab se badal sakti hai. Best-before aur ingredients pack par dekhein.",
  shelf_life: "Best before as printed on pack (sealed, cool & dry jagah)",
};

async function getJson(path) { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H }); return r.json(); }

const cats = await getJson("categories?select=id,name");
const cat = cats.find((c) => c.name === CATEGORY);
if (!cat) throw new Error(`${CATEGORY} category missing`);
const existing = await getJson(`products?select=id,name&name=ilike.Popat%25`);
const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));

/** Convert any source to a ≤1200px WebP on white; returns buffer + sha8. */
async function toWebp(file) {
  const buf = await sharp(file).flatten({ background: "#ffffff" }).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  return { buf, sha: createHash("sha1").update(buf).digest("hex").slice(0, 8) };
}

async function upload(productId, role, file) {
  const { buf, sha } = await toWebp(file);
  const path = `${productId}/${role}-${sha}.webp`;
  if (APPLY) {
    const r = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...H, "Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "public, max-age=31536000" }, body: buf });
    if (!r.ok) throw new Error(`upload ${path}: ${r.status} ${await r.text()}`);
  }
  return `${URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

let created = 0, updated = 0, uploaded = 0;
for (const [slug, meta] of Object.entries(PRODUCTS)) {
  const src = bySlug[slug];
  if (!src) { console.log(`⚠️  ${slug}: not in scraped data`); continue; }
  const name = DISPLAY_NAME[slug] ?? `Popat ${src.name}`;
  const pack = src.pack ?? "250 g"; // Makka Bhel page has no weight; brand standard is 250 g
  const price = Math.round(Number(src.price));
  const t = TYPE[meta.type];
  const description = `${meta.blurb} ${t.line} Popat Namkeen — Chhattisgarh ka apna bharosemand namkeen brand. Pack: ${pack}.`;
  const key_features = [...t.features, `${pack} sealed pouch`, "Popat Namkeen — local brand, fresh batches"];

  let row = byName.get(name.toLowerCase());
  let id = row?.id;
  if (!id) {
    console.log(`+ CREATE ${name} — ${pack} ₹${price}`);
    if (APPLY) {
      const r = await fetch(`${URL}/rest/v1/products`, { method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ name, name_hi: meta.hi, category_id: cat.id, unit: pack, price, mrp: price, stock: 0, active: false, description }) });
      if (!r.ok) throw new Error(`create ${name}: ${r.status} ${await r.text()}`);
      id = (await r.json())[0].id;
    } else id = `(new:${slug})`;
    created++;
  } else { console.log(`~ UPDATE ${name}`); updated++; }

  // Images: studio packshot → fop; creative + extra packshots + brand photo → gallery.
  const a = ASSETS[slug];
  const sitePhoto = `/tmp/popat/img/${slug}.png`;
  const fopFile = a ? join(PACK, a.fop) : sitePhoto;
  const galleryFiles = a
    ? [join(PACK, a.creative), ...(a.extra ?? []).map((e) => join(PACK, e)), sitePhoto]
    : [];
  for (const f of [fopFile, ...galleryFiles]) if (!existsSync(f)) throw new Error(`missing ${f}`);
  const image_url = await upload(id, "fop", fopFile); uploaded++;
  const image_urls = [];
  for (const [i, f] of galleryFiles.entries()) { image_urls.push(await upload(id, `g${i + 1}`, f)); uploaded++; }

  console.log(`    ${a ? "studio packshot" : "brand photo"} + ${image_urls.length} gallery · ${SUBCATEGORY} · ${pack} · ₹${price}`);
  if (APPLY) {
    const r = await fetch(`${URL}/rest/v1/products?id=eq.${id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ name, name_hi: meta.hi, unit: pack, price, mrp: price, description, key_features, subcategory: SUBCATEGORY, image_url, image_urls, active: true, ...COMMON }) });
    if (!r.ok) throw new Error(`patch ${name}: ${r.status} ${await r.text()}`);
  }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"}: ${created} created, ${updated} updated, ${uploaded} images${APPLY ? " uploaded" : " to upload"}.`);
if (!APPLY) console.log("Re-run with --apply to write.");
