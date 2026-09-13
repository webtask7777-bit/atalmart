#!/usr/bin/env node
/**
 * Import the Devbhog (Chhattisgarh State Co-operative Dairy Federation) range
 * — 26 SKUs — into the live catalogue.
 *
 *   node scripts/import-devbhog-listing.mjs             # dry run
 *   node scripts/import-devbhog-listing.mjs --apply     # upload + write
 *   node scripts/import-devbhog-listing.mjs --apply --activate   # also set active=true
 *
 * Sources
 *   • ~/Desktop/Devbhog/devbhog-professional-product-photos — per SKU a studio
 *     packshot on white (NN-<slug>.png → card image) and a lifestyle creative
 *     (NN-<slug>-graphic.png → first gallery image). All 1254².
 *   • Specs (fat/SNF, shelf life, pack sizes) from cgcoopdairyfed.in product pages.
 *
 * Prices: Devbhog publishes no MRP list online, so PRICES below are estimates
 * from Raipur retail. Products are therefore created with active=false and
 * stock 0 — verify MRPs in the admin (or edit PRICES and re-run with
 * --activate) before they go live. Re-running is idempotent (matched by name).
 */
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const ACTIVATE = process.argv.includes("--activate");
const DIR = join(process.env.HOME, "Desktop/Devbhog/devbhog-professional-product-photos");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const BUCKET = "product-images";

const BRAND_LINE = "Devbhog — Chhattisgarh Rajya Sahkari Dugdh Mahasangh ka apna brand; roz subah ke fresh doodh se bana, ISO 22000 certified plant mein pack.";

// Per-flavour copy for the 200 ml flavoured-milk bottles.
const FLAV = {
  elaichi:    { hi: "देवभोग इलायची फ्लेवर्ड मिल्क",    en: "Elaichi",      blurb: "Asli elaichi ki khushboo wala thanda meetha doodh — desi swaad, bottle mein." },
  badam:      { hi: "देवभोग बादाम फ्लेवर्ड मिल्क",     en: "Badam",        blurb: "Badam flavour ka rich, creamy doodh — school, office ya travel ke liye ready-to-drink." },
  chocolate:  { hi: "देवभोग चॉकलेट फ्लेवर्ड मिल्क",    en: "Chocolate",    blurb: "Bacchon ka favourite chocolate milk — thanda peene mein sabse mazedaar." },
  "coffee-magic": { hi: "देवभोग कॉफी मैजिक फ्लेवर्ड मिल्क", en: "Coffee Magic", blurb: "Cold coffee ka swaad, doodh ki goodness — Coffee Magic, ek bottle mein." },
  kesar:      { hi: "देवभोग केसर फ्लेवर्ड मिल्क",      en: "Kesar",        blurb: "Kesar ke rang aur khushboo wala shahi doodh — tyohaar ho ya roz, premium taste." },
  rose:       { hi: "देवभोग रोज़ फ्लेवर्ड मिल्क",      en: "Rose",         blurb: "Gulab ki halki khushboo wala thanda meetha doodh — garmi mein refreshing." },
  pineapple:  { hi: "देवभोग पाइनएप्पल फ्लेवर्ड मिल्क", en: "Pineapple",    blurb: "Tangy pineapple flavour aur creamy doodh ka fun combo — kids' favourite." },
  strawberry: { hi: "देवभोग स्ट्रॉबेरी फ्लेवर्ड मिल्क", en: "Strawberry",   blurb: "Strawberry flavour ka pink, meetha doodh — bacchon ke liye tiffin-time treat." },
  vanilla:    { hi: "देवभोग वनीला फ्लेवर्ड मिल्क",     en: "Vanilla",      blurb: "Smooth vanilla flavour wala thanda doodh — halka, meetha, sabko pasand." },
};
const flavMilk = (key, n) => ({
  name: `Devbhog ${FLAV[key].en} Flavoured Milk`, hi: FLAV[key].hi, unit: "200 ml", price: 30,
  cat: "Dairy", sub: "Milk", fop: `${n}-flavoured-milk-${key}-200ml.png`, gallery: [`${n}-${key === "coffee-magic" ? "coffee-magic" : key + "-flavour-milk"}-graphic.png`],
  blurb: FLAV[key].blurb,
  line: "Double-toned, homogenised aur sterilised flavoured milk — fridge ke bina bhi 90 din tak safe (sealed bottle). Fat 1.6%, SNF 9%, sugar 8%; approx 75 kcal / 100 ml.",
  features: [`${FLAV[key].en} flavour, 200 ml glass bottle`, "Sterilised — bina fridge ke bhi rakh sakte hain", "Homogenised: cream ki layer nahi banti", "Approx 75 kcal / 100 ml", "Best before 90 days"],
  processing_type: "Sterilised & homogenised", fat_profile: "Double toned (1.6% fat)", sugar_profile: "Sweetened (8% sugar)", biological_source: "Cow & buffalo milk",
  shelf_life: "Best before 90 days (sealed bottle, cool & dry jagah)",
  nutrition: { total_fat: 1.6, total_sugar: 8, calories: 75 },
});

const PRODUCTS = [
  { name: "Devbhog Supreme Standard Milk", hi: "देवभोग सुप्रीम स्टैंडर्ड दूध", unit: "500 ml", price: 32, cat: "Dairy", sub: "Milk", fop: "01-standard-milk-500ml.png", gallery: ["01-standard-milk-graphic.png"],
    blurb: "Devbhog Supreme — pasteurised, homogenised standard milk, 4.5% fat aur 8.5% SNF. Chai, kheer, dahi jamane aur bacchon ke liye rich, full-body doodh.",
    line: "Vitamin A & D se fortified. Roz subah fresh pouch, plant se seedha.",
    features: ["Fat 4.5% min, SNF 8.5% min", "Pasteurised & homogenised", "Vitamin A & D fortified (+F)", "Approx 72 kcal / 100 ml", "500 ml pouch"],
    processing_type: "Pasteurised & homogenised", fat_profile: "Standard (4.5% fat)", sugar_profile: "No added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "2 din (fridge mein, 4°C ya niche). Kholne ke baad usi din use karein.", nutrition: { total_fat: 4.5, calories: 72 } },
  { name: "Devbhog Double Toned Milk", hi: "देवभोग डबल टोंड दूध", unit: "500 ml", price: 25, cat: "Dairy", sub: "Milk", fop: "02-double-toned-milk-500ml.png", gallery: ["02-double-toned-milk-graphic.png"],
    blurb: "Sirf 1.5% fat wala double toned milk — weight-watchers, diabetic aur senior citizens ke liye halka, low-cholesterol doodh.",
    line: "Pasteurised, homogenised aur Vitamin A & D fortified. Chai-coffee mein bhi badhiya.",
    features: ["Fat 1.5%, SNF 9%", "Low fat, low cholesterol", "Pasteurised & homogenised", "Vitamin A & D fortified", "500 ml pouch"],
    processing_type: "Pasteurised & homogenised", fat_profile: "Double toned (1.5% fat)", sugar_profile: "No added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "2 din (fridge mein, 4°C ya niche)", nutrition: { total_fat: 1.5 } },
  { name: "Devbhog Toned Milk", hi: "देवभोग टोंड दूध", unit: "500 ml", price: 28, cat: "Dairy", sub: "Milk", fop: "03-toned-milk-500ml.png", gallery: ["03-toned-milk-graphic.png"],
    blurb: "Roz ki chai, coffee aur dahi ke liye Devbhog Toned Milk — 3.5% fat, 8.5% SNF, balanced richness.",
    line: "Pasteurised, homogenised, Vitamin A & D fortified. Approx 62 kcal / 100 ml.",
    features: ["Fat 3.5%, SNF 8.5%", "Chai, coffee aur dahi ke liye ideal", "Pasteurised & homogenised", "Vitamin A & D fortified", "500 ml pouch"],
    processing_type: "Pasteurised & homogenised", fat_profile: "Toned (3.5% fat)", sugar_profile: "No added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "2 din (fridge mein, 4°C ya niche)", nutrition: { total_fat: 3.5, calories: 62 } },
  { name: "Devbhog Goras Cow Milk", hi: "देवभोग गोरस गाय का दूध", unit: "1 L", price: 60, cat: "Dairy", sub: "Milk", fop: "15-goras-milk-1l.png", gallery: ["15-goras-milk-1l-graphic.png"],
    blurb: "Devbhog Goras — 100% gaay ka doodh, 3.5% fat aur 8.5% SNF. Halka, aasani se pachne wala; bacchon, bujurgon aur pooja ke liye.",
    line: "Pasteurised, Vitamin A & D fortified. 1 litre family pouch.",
    features: ["Pure cow milk (gaay ka doodh)", "Fat 3.5%, SNF 8.5%", "Aasani se digest hone wala", "Vitamin A & D fortified", "1 L pouch"],
    processing_type: "Pasteurised", fat_profile: "Toned (3.5% fat)", sugar_profile: "No added sugar", biological_source: "Cow milk",
    shelf_life: "2 din (fridge mein, 4°C ya niche)", nutrition: { total_fat: 3.5 } },
  { name: "Devbhog Lassi", hi: "देवभोग लस्सी", unit: "180 ml", price: 20, cat: "Dairy", sub: "Curd & Yogurt", fop: "04-lassi-180ml.png", gallery: ["04-lassi-graphic.png"],
    blurb: "Fresh whole milk ki dahi se bani meethi, thandi lassi — garmi mein ek cup mein taazgi.",
    line: "Fat 3.5%, total solids 30%; approx 146 kcal / 100 ml. Sealed cup, seedha pi lo.",
    features: ["Fresh dahi se bani, meethi lassi", "Milk protein se bharpur", "Ready-to-drink sealed cup", "Thanda serve karein", "180 ml cup"],
    processing_type: "Pasteurised", fat_profile: "3.5% fat", sugar_profile: "Sweetened", biological_source: "Cow & buffalo milk",
    shelf_life: "3 din (fridge mein)", nutrition: { total_fat: 3.5, total_sugar: 23.5, calories: 146 } },
  flavMilk("elaichi", "05"), flavMilk("badam", "06"), flavMilk("chocolate", "07"), flavMilk("coffee-magic", "08"), flavMilk("kesar", "09"), flavMilk("rose", "10"),
  flavMilk("pineapple", "24"), flavMilk("strawberry", "25"), flavMilk("vanilla", "26"),
  { name: "Devbhog Peda", hi: "देवभोग पेड़ा", unit: "250 g", price: 120, cat: "Chocolates & Sweets", sub: "Indian Sweets", fop: "11-devbhog-peda-250g.png", gallery: ["11-peda-250g-graphic.png"],
    blurb: "Fresh doodh ko khoya banakar, kam cheeni ke saath banaya gaya Devbhog Peda — vrat mein upyogi, no preservative, no artificial colour.",
    line: "Fat 20%, protein 14 g / 100 g; approx 416 kcal / 100 g. Gift box pack.",
    features: ["Asli khoya se bana", "Kam added sugar", "No preservative, no artificial colour/flavour", "Vrat mein upyogi", "250 g box"],
    processing_type: "Khoya-based, traditional", fat_profile: "20% milk fat", sugar_profile: "Low added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "7 din (fridge mein rakhein)", nutrition: { total_fat: 20, protein: 14, carbs: 45, calories: 416 } },
  { name: "Devbhog Pure Ghee", hi: "देवभोग शुद्ध घी", unit: "500 ml", price: 350, cat: "Dairy", sub: "Ghee", fop: "12-devbhog-ghee-500ml.png", gallery: ["12-ghee-500ml-graphic.png"],
    blurb: "Doodh ki malai ko seedha garam karke banaya gaya Devbhog Pure Ghee — daanedaar, khushboodar, 99.7% milk fat.",
    line: "Vitamin A, D, E & K ka achha source; approx 897 kcal / 100 g. Pooja, roti, dal-tadka aur mithai — sab ke liye.",
    features: ["99.7% pure milk fat", "Daanedaar texture, asli khushboo", "Vitamin A, D, E & K", "Malai se direct heating se bana", "500 ml jar"],
    processing_type: "Cream-heated, traditional", fat_profile: "99.7% milk fat", sugar_profile: "No sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "Best before 180 din (seal band, room temperature)", nutrition: { total_fat: 99.7, calories: 897 } },
  { name: "Devbhog Pure Ghee Bulk Pack", hi: "देवभोग शुद्ध घी (5 लीटर)", unit: "5 L", price: 3200, cat: "Dairy", sub: "Ghee", fop: "13-devbhog-ghee-5l.png", gallery: ["13-ghee-5l-graphic.png"],
    blurb: "Bade parivaar, halwai, hostel-mess aur shaadi-byah ke liye Devbhog Pure Ghee ka 5 litre bulk jar — wahi daanedaar swaad, economy pack mein.",
    line: "99.7% milk fat, Vitamin A, D, E & K; approx 897 kcal / 100 g.",
    features: ["5 L economy jar", "99.7% pure milk fat", "Daanedaar, khushboodar", "Bulk cooking / catering ke liye", "Vitamin A, D, E & K"],
    processing_type: "Cream-heated, traditional", fat_profile: "99.7% milk fat", sugar_profile: "No sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "Best before 180 din (seal band, room temperature)", nutrition: { total_fat: 99.7, calories: 897 } },
  { name: "Devbhog Danedar Ghee Jar", hi: "देवभोग दानेदार घी (जार)", unit: "1 L", price: 700, cat: "Dairy", sub: "Ghee", fop: "14-devbhog-ghee-jar.png", gallery: [],
    blurb: "Devbhog Danedar Ghee — motey daane wala, ghar jaisa ghee. Chhattisgarh Shasan ka sahkari utpaad, transparent jar mein.",
    line: "99.7% milk fat, Vitamin A, D, E & K; approx 897 kcal / 100 g.",
    features: ["Daanedaar (granular) texture", "99.7% pure milk fat", "Sahkari (co-operative) utpaad", "Vitamin A, D, E & K", "Transparent 1 L jar"],
    processing_type: "Cream-heated, traditional", fat_profile: "99.7% milk fat", sugar_profile: "No sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "Best before 180 din (seal band, room temperature)", nutrition: { total_fat: 99.7, calories: 897 } },
  { name: "Devbhog Dahi", hi: "देवभोग दही", unit: "1 kg", price: 80, cat: "Dairy", sub: "Curd & Yogurt", fop: "16-plain-dahi-1kg.png", gallery: ["16-plain-dahi-1kg-graphic.png"],
    blurb: "Pasteurised, homogenised toned milk se jami gaadhi, thick dahi — raita, kadhi, lassi aur roz ke khane ke liye family pack.",
    line: "Harmless starter culture se jamaya gaya; koi added sugar nahi.",
    features: ["Thick, set dahi", "Toned milk se bani", "No added sugar", "Raita, kadhi, lassi sab ke liye", "1 kg family pouch"],
    processing_type: "Pasteurised & homogenised, cultured", fat_profile: "Toned", sugar_profile: "No added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "3 din (fridge mein rakhein)", nutrition: null },
  { name: "Devbhog Meetha Dahi", hi: "देवभोग मीठा दही", unit: "80 g", price: 15, cat: "Dairy", sub: "Curd & Yogurt", fop: "17-sweet-curd-80g.png", gallery: ["17-sweet-curd-80g-graphic.png"],
    blurb: "Standardised doodh aur shakkar se bani Bengali-style meethi dahi — khane ke baad ek chhota sa meetha cup.",
    line: "Sealed single-serve cup; thanda khayein.",
    features: ["Meethi, creamy dahi", "Single-serve sealed cup", "Standardised milk + sugar", "Dessert ki tarah thanda serve karein", "80 g cup"],
    processing_type: "Pasteurised, cultured", fat_profile: "Standardised", sugar_profile: "Sweetened", biological_source: "Cow & buffalo milk",
    shelf_life: "3 din (fridge mein rakhein)", nutrition: null },
  { name: "Devbhog Kadhi Dahi", hi: "देवभोग कढ़ी दही", unit: "200 ml", price: 25, cat: "Dairy", sub: "Curd & Yogurt", fop: "18-kadhi-dahi-200ml.png", gallery: ["18-kadhi-dahi-200ml-graphic.png"],
    blurb: "Kadhi ke liye khaas khatti dahi — toned milk se bani, Vitamin A & D fortified. Kadhi-pakoda, chhas aur chaat ke liye perfect.",
    line: "Pasteurised, homogenised doodh; koi added sugar nahi.",
    features: ["Kadhi ke liye khatti dahi", "Toned milk se bani", "Vitamin A & D fortified", "No added sugar", "200 ml pouch"],
    processing_type: "Pasteurised & homogenised, cultured", fat_profile: "Toned", sugar_profile: "No added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "3 din (fridge mein rakhein)", nutrition: null },
  { name: "Devbhog Khova", hi: "देवभोग खोवा", unit: "500 g", price: 250, cat: "Dairy", sub: "Khova & Cream", fop: "19-khova.png", gallery: ["19-khova-graphic.png"],
    blurb: "Fresh doodh ko gaadha karke banaya gaya Devbhog Khova (mawa) — gulab jamun, peda, barfi, gujiya aur halwe ke liye ghar par mithai banane ka base.",
    line: "ISO 22000 certified plant mein bana, sealed tub mein. Bina milawat, sirf doodh.",
    features: ["100% doodh se bana mawa", "Gulab jamun, barfi, gujiya ke liye", "Sealed hygienic tub", "No preservative", "500 g tub"],
    processing_type: "Milk desiccated (khoya)", fat_profile: "Full cream", sugar_profile: "No added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "7 din (fridge mein rakhein)", nutrition: null },
  { name: "Devbhog Paneer", hi: "देवभोग पनीर", unit: "200 g", price: 90, cat: "Dairy", sub: "Paneer & Tofu", fop: "20-paneer-200g.png", gallery: ["20-paneer-200g-graphic.png"],
    blurb: "Fresh doodh se bana soft, malai-daar Devbhog Paneer — paneer butter masala, bhurji, tikka ya kadhai paneer, tootta nahi, tairta nahi.",
    line: "Fat 20% min, total solids 40% min; approx 331 kcal / 100 g. High protein.",
    features: ["Soft, fresh malai paneer", "High protein, fat 20% min", "Vacuum-sealed hygienic pack", "Tikka, bhurji, gravy sab ke liye", "200 g pack"],
    processing_type: "Fresh, pasteurised milk", fat_profile: "20% milk fat", sugar_profile: "No added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "7 din (fridge mein rakhein)", nutrition: { total_fat: 20, calories: 331 } },
  { name: "Devbhog Masala Chhach", hi: "देवभोग मसाला छाछ", unit: "200 ml", price: 12, cat: "Dairy", sub: "Milk", fop: "21-masala-chhach-200ml.png", gallery: ["21-masala-chhach-200ml-graphic.png"],
    blurb: "Toned milk ki dahi, namak, jeera aur kali mirch se bani thandi masala chhach — khane ke baad digestion ke liye ya garmi mein pyaas bujhane ke liye.",
    line: "Ingredients: toned milk curd, salt, jeera, black pepper, pasteurised water.",
    features: ["Jeera-kali mirch masala chhach", "Digestion-friendly, low fat", "Garmi ka refreshing drink", "Sealed 200 ml pouch", "No added sugar"],
    processing_type: "Pasteurised, cultured", fat_profile: "Low fat", sugar_profile: "No added sugar", biological_source: "Cow & buffalo milk",
    shelf_life: "3 din (fridge mein rakhein)", nutrition: null },
  { name: "Devbhog Shrikhand", hi: "देवभोग श्रीखंड", unit: "80 g", price: 25, cat: "Dairy", sub: "Curd & Yogurt", fop: "22-shrikhand-80g.png", gallery: ["Devbhog Shrikhand2.png"],
    blurb: "Chakka (hung curd), shakkar, elaichi aur jaiphal se bana traditional Devbhog Shrikhand — semi-soft, meetha-khatta, elaichi ki khushboo ke saath.",
    line: "Whole milk ki lactic-fermented dahi se banaya gaya; single-serve cup.",
    features: ["Chakka + shakkar + elaichi + jaiphal", "Traditional Maharashtrian-style", "Whole milk se bana", "Single-serve sealed cup", "80 g cup"],
    processing_type: "Cultured, hung curd", fat_profile: "Full cream", sugar_profile: "Sweetened", biological_source: "Cow & buffalo milk",
    shelf_life: "3 din (fridge mein rakhein)", nutrition: null },
  { name: "Devbhog Chhena Rabdi", hi: "देवभोग छेना रबड़ी", unit: "80 g", price: 30, cat: "Chocolates & Sweets", sub: "Indian Sweets", fop: "23-chhena-rabdi-80g.png", gallery: ["23-chhena-rabdi-80g-graphic.png"],
    blurb: "Gaadhe doodh ki rabdi mein soft chhena ke tukde — Devbhog Chhena Rabdi, kesar-pista ke saath, thanda-thanda dessert cup.",
    line: "Fresh doodh se bana, sealed single-serve cup.",
    features: ["Rabdi + soft chhena", "Kesar-pista flavour", "Fresh doodh se bana dessert", "Thanda serve karein", "80 g cup"],
    processing_type: "Milk-concentrated, traditional", fat_profile: "Full cream", sugar_profile: "Sweetened", biological_source: "Cow & buffalo milk",
    shelf_life: "3 din (fridge mein rakhein)", nutrition: null },
];

const COMMON = {
  country_of_origin: "India",
  seller_name: "Atalmart",
  seller_address: "Atalmart, Raipur, Chhattisgarh",
  fssai_license: null,
  customer_care: { phone: "+91 62620 02255", email: "marketing@devbhog.org", hours: "Devbhog (CG Co-op Dairy Federation), Kumhari" },
  return_policy: "Dairy fresh item hai — pack leak, khatta ya expired mile to delivery ke 2 ghante ke andar photo ke saath batayein, replacement ya refund milega. Khula pack return nahi hota.",
  disclaimer: "Packaging, weight aur MRP brand ke hisaab se badal sakti hai. Best-before, ingredients aur nutrition pack par dekhein. Fresh dairy: delivery ke turant baad fridge mein rakhein.",
};

async function getJson(path) { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H }); return r.json(); }
const cats = await getJson("categories?select=id,name");
const catId = (name) => { const c = cats.find((x) => x.name === name); if (!c) throw new Error(`${name} category missing`); return c.id; };
const existing = await getJson(`products?select=id,name&name=ilike.Devbhog%25`);
const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));

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
for (const p of PRODUCTS) {
  const files = [p.fop, ...p.gallery].map((f) => join(DIR, f));
  for (const f of files) if (!existsSync(f)) throw new Error(`missing ${f}`);
  const description = `${p.blurb} ${p.line} ${BRAND_LINE} Pack: ${p.unit}.`;
  const key_features = [...p.features, "Devbhog — Chhattisgarh ka apna sahkari dairy brand"];
  const category_id = catId(p.cat);

  let row = byName.get(p.name.toLowerCase());
  let id = row?.id;
  if (!id) {
    console.log(`+ CREATE ${p.name} — ${p.unit} ₹${p.price}`);
    if (APPLY) {
      const r = await fetch(`${URL}/rest/v1/products`, { method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ name: p.name, name_hi: p.hi, category_id, unit: p.unit, price: p.price, mrp: p.price, stock: 0, active: false, description }) });
      if (!r.ok) throw new Error(`create ${p.name}: ${r.status} ${await r.text()}`);
      id = (await r.json())[0].id;
    } else id = `(new)`;
    created++;
  } else { console.log(`~ UPDATE ${p.name}`); updated++; }

  const image_url = await upload(id, "fop", files[0]); uploaded++;
  const image_urls = [];
  for (const [i, f] of files.slice(1).entries()) { image_urls.push(await upload(id, `g${i + 1}`, f)); uploaded++; }
  console.log(`    ${p.cat} › ${p.sub} · packshot + ${image_urls.length} gallery`);

  if (APPLY) {
    const body = { name: p.name, name_hi: p.hi, category_id, subcategory: p.sub, unit: p.unit, price: p.price, mrp: p.price, description, key_features, image_url, image_urls,
      processing_type: p.processing_type, fat_profile: p.fat_profile, sugar_profile: p.sugar_profile, biological_source: p.biological_source, shelf_life: p.shelf_life,
      nutrition_per_100g: p.nutrition, ...COMMON, ...(ACTIVATE ? { active: true } : {}) };
    const r = await fetch(`${URL}/rest/v1/products?id=eq.${id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`patch ${p.name}: ${r.status} ${await r.text()}`);
  }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"}: ${created} created, ${updated} updated, ${uploaded} images${APPLY ? " uploaded" : " to upload"}.${ACTIVATE ? " Products set ACTIVE." : " Products left inactive (draft) — verify MRPs, then re-run with --activate."}`);
if (!APPLY) console.log("Re-run with --apply to write.");
