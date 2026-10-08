#!/usr/bin/env node
/**
 * Import the second Fruits & Vegetables image set (36 studio shots, 8 Oct
 * 2026 21:05, ~/Downloads/*-<n>.png) + fix the palak/chaulai mix-up from the
 * bhaji import (the "palak" shot was green amaranth).
 *
 *   node scripts/import-veg-listing-2.mjs            # dry run
 *   node scripts/import-veg-listing-2.mjs --apply    # upload + write
 *
 * PNGs are converted to 1200px WebP on the way up. Storage path follows the
 * admin picker convention: product-images/<id>/<role>-<sha8>.webp. Existing
 * rows are matched by name and UPDATED (copy, images, subcategory,
 * active=true) — price/MRP/stock untouched. Missing rows are CREATED at an
 * introductory price — adjust in admin after.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const DL = join(process.env.HOME, "Downloads");
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("Supabase env missing");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const BUCKET = "product-images";

// Downloads/<description>-<n>.png from the 21:05 batch, keyed by n.
// The earlier bhaji batch (20:21) reuses numbers 1–13, so pick files newer
// than that batch (anchor: the bathua shot) rather than by number alone.
const BATCH = new Map();
const anchor = statSync(join(DL, "Fresh bathua greens bunch-1.png")).mtimeMs + 10 * 60_000;
for (const f of readdirSync(DL)) {
  const m = /-(\d+)\.png$/.exec(f);
  if (!m) continue;
  const full = join(DL, f);
  if (statSync(full).mtimeMs < anchor) continue;
  BATCH.set(Number(m[1]), full);
}
if (BATCH.size !== 36) throw new Error(`expected 36 batch images, found ${BATCH.size}`);
// Guard: the batch is identified by content words, not just numbers.
const EXPECT = { 1: /Purple Indian Eggplants/, 36: /moringa drumsticks/i, 34: /Gourds on a cream/ };
for (const [n, re] of Object.entries(EXPECT)) if (!re.test(BATCH.get(Number(n)) ?? "")) throw new Error(`batch mismatch at ${n}: ${BATCH.get(Number(n))}`);

const COMMON = {
  country_of_origin: "India",
  seller_name: "Atalmart",
  disclaimer: "Taazi sabzi hai — size, rang aur weight thoda alag ho sakta hai. Photo indicative hai. Istemaal se pehle dho lein.",
};
const VEG = "Fresh Vegetables";
const SL2 = "2–3 din (fridge mein 5–7 din)";
const SL1 = "1–2 din (fridge mein 3–4 din)";
const SLR = "7–10 din (thandi, sookhi jagah)";

// img: batch number for the card; gallery: extra batch numbers; file: explicit path.
const PRODUCTS = [
  { match: "Baingan (Brinjal)", img: 1, name: "Baingan Gol (Round Brinjal)", name_hi: "गोल बैंगन", sub: VEG,
    desc: "Chamakdaar gol baingan — bharta, bhaji aur sambar ke liye. Patla chhilka, kam beej, roz subah ka fresh lot.",
    feat: ["Round bharta-style brinjal", "Low seed, soft flesh", "Bharta, sabzi, sambar ke liye", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: null, img: 3, name: "Baingan Lamba (Long Brinjal)", name_hi: "लंबा बैंगन", sub: VEG, unit: "500 g", price: 35, mrp: 40, stock: 30,
    desc: "Lambe, patle purple baingan — jaldi pakne wale, bhaji aur fry ke liye best. Kam beej, meetha swaad.",
    feat: ["Long slender brinjal", "Quick-cooking, fewer seeds", "Baingan fry, sabzi, kadhi ke liye", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: "Bhindi (Lady Finger)", img: 2, name: "Bhindi (Lady Finger)", name_hi: "भिंडी", sub: VEG,
    desc: "Komal, kurkuri hari bhindi — tod kar dekhi hui, bina resha. Bhindi masala, kurkuri bhindi ya dahi-bhindi ke liye.",
    feat: ["Tender, snap-fresh pods", "Fibre aur vitamin C se bharpoor", "Bhindi masala, fry, dahi-bhindi ke liye", "Sookhi rakhein — 3–4 din fresh"], sl: SL1 },
  { match: null, img: 4, gallery: [34], name: "Gilki (Sponge Gourd)", name_hi: "गिलकी / नेनुआ", sub: VEG, unit: "500 g", price: 35, mrp: 40, stock: 30,
    desc: "Mulayam, chikni gilki (nenua / sponge gourd) — halki meethi, jaldi pakne wali. Aloo-gilki, gilki-chana dal ya bhaji ke liye.",
    feat: ["Smooth sponge gourd — gilki / nenua", "Light, easy-to-digest sabzi", "Low calorie, high water", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: "Karela (Bitter Gourd)", img: 5, gallery: [33], name: "Karela (Bitter Gourd)", name_hi: "करेला", sub: VEG,
    desc: "Taaze hare karele — bharwa karela, karela fry ya karela-pyaaz ke liye. Firm, bina pile daag ke.",
    feat: ["Firm, fresh bitter gourds", "Diabetes-friendly superfood", "Bharwa, fry, chips ke liye", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: "Turai (Ridge Gourd)", img: 6, name: "Turai (Ridge Gourd)", name_hi: "तुरई", sub: VEG,
    desc: "Komal hari turai — dhaari-daar, halki meethi. Turai-chana dal, turai ki sabzi ya chilke ki chutney ke liye.",
    feat: ["Tender ridge gourd", "Light, cooling summer sabzi", "Dal, sabzi, chutney ke liye", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: "Gobhi (Cauliflower)", img: 7, name: "Gobhi (Cauliflower)", name_hi: "फूल गोभी", sub: VEG,
    desc: "Safed, kasa hua gobhi ka phool — aloo-gobhi, gobhi paratha, manchurian ya pakode ke liye. Bina keede, taaza tod.",
    feat: ["Tight white head, approx 600–800 g", "Vitamin C aur fibre se bharpoor", "Aloo-gobhi, paratha, manchurian ke liye", "Fridge mein 5–6 din taaza"], sl: SL2 },
  { match: "Lauki (Bottle Gourd)", img: 8, name: "Lauki (Bottle Gourd)", name_hi: "लौकी", sub: VEG,
    desc: "Halki, komal lauki — lauki-chana dal, kofta, halwa ya juice ke liye. Patla chhilka, kam beej.",
    feat: ["Tender bottle gourd, approx 700 g–1 kg", "Cooling, easy to digest", "Dal, kofta, halwa, juice ke liye", "Fridge mein 5–6 din taaza"], sl: SL2 },
  { match: "Patta Gobhi (Cabbage)", img: 9, name: "Patta Gobhi (Cabbage)", name_hi: "पत्ता गोभी", sub: VEG,
    desc: "Kasa hua hara patta gobhi — sabzi, salad, momos ki filling ya chowmein ke liye. Crisp aur fresh.",
    feat: ["Firm green cabbage head", "Vitamin K aur C se bharpoor", "Sabzi, salad, momos, noodles ke liye", "Fridge mein 7–10 din taaza"], sl: "5–7 din (fridge mein 10 din)" },
  { match: "Gajar (Carrot)", img: 10, name: "Gajar (Carrot)", name_hi: "गाजर", sub: VEG,
    desc: "Meethi, kurkuri orange gajar — salad, gajar ka halwa, sabzi ya juice ke liye. Dhuli hui, taaza.",
    feat: ["Sweet, crunchy carrots", "Vitamin A se bharpoor", "Salad, halwa, juice, sabzi ke liye", "Fridge mein 10 din taaza"], sl: "5–7 din (fridge mein 10 din)" },
  { match: "Matar (Green Peas)", img: 11, name: "Matar (Green Peas)", name_hi: "हरी मटर", sub: VEG,
    desc: "Bhari hui, meethi hari matar ki phaliyan — matar paneer, aloo-matar, pulao ya kachori ke liye. Season ki taaza.",
    feat: ["Plump, sweet pea pods", "Protein aur fibre ka source", "Matar paneer, pulao, kachori ke liye", "Fridge mein 3–4 din taaza"], sl: SL1 },
  { match: "Mooli (Radish)", img: 12, name: "Mooli (Radish)", name_hi: "मूली", sub: VEG,
    desc: "Safed, kurkuri mooli — salad, mooli paratha, achaar ya sambar ke liye. Halki teekhi, taaza.",
    feat: ["Crisp white radish with greens trimmed", "Digestion-friendly", "Salad, paratha, sambar ke liye", "Fridge mein 5–7 din taaza"], sl: SL2 },
  { match: "Shimla Mirch (Capsicum)", img: 13, name: "Shimla Mirch (Capsicum)", name_hi: "हरी शिमला मिर्च", sub: VEG,
    desc: "Moti, chamakdaar hari shimla mirch — bharwa, aloo-shimla, pizza topping ya chowmein ke liye. Crunchy aur fresh.",
    feat: ["Thick-walled green capsicum", "Vitamin C se bharpoor", "Stuffed, stir-fry, pizza ke liye", "Fridge mein 7 din taaza"], sl: "4–5 din (fridge mein 7 din)" },
  { match: "Chukandar (Beetroot)", img: 14, name: "Chukandar (Beetroot)", name_hi: "चुकंदर", sub: VEG,
    desc: "Gehre laal chukandar — salad, juice, raita ya sabzi ke liye. Iron se bharpoor, taaza aur firm.",
    feat: ["Firm, deep-red beetroot", "Iron aur folate se bharpoor", "Salad, juice, raita, halwa ke liye", "Fridge mein 10 din taaza"], sl: "5–7 din (fridge mein 10 din)" },
  { match: null, img: 15, gallery: [35], name: "French Beans", name_hi: "फ्रेंच बीन्स", sub: VEG, unit: "250 g", price: 35, mrp: 40, stock: 30,
    desc: "Patli, kurkuri french beans — beans-aloo, beans poriyal, stir-fry ya fried rice ke liye. Bina resha, taaza tod.",
    feat: ["Tender, stringless beans", "Fibre aur vitamin K se bharpoor", "Stir-fry, poriyal, fried rice ke liye", "Fridge mein 5 din taaza"], sl: SL2 },
  { match: null, img: 16, name: "Sem (Flat Beans)", name_hi: "सेम फली", sub: VEG, unit: "250 g", price: 30, mrp: 35, stock: 30,
    desc: "Hari, chaudi sem ki phaliyan — sem-aloo, sem ki sabzi ya dal ke saath. Sardi ki desi sabzi, komal aur taaza.",
    feat: ["Fresh hyacinth / flat beans", "Protein aur fibre ka source", "Sem-aloo, sookhi sabzi ke liye", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: null, img: 17, name: "Barbatti (Yardlong Beans)", name_hi: "बरबट्टी", sub: VEG, unit: "250 g", price: 30, mrp: 35, stock: 30,
    desc: "Lambi, komal barbatti (lobia phali) — Chhattisgarhi ghar ki roz ki sabzi. Barbatti-aloo, bhaji ya dal mein.",
    feat: ["Long beans — barbatti / lobia", "Tender, snap-fresh", "Sabzi, bhaji, dal ke liye", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: null, img: 18, name: "Kundru (Ivy Gourd)", name_hi: "कुंदरू", sub: VEG, unit: "250 g", price: 30, mrp: 35, stock: 30,
    desc: "Chhote, dhaari-daar hare kundru (tindora) — kurkure kundru fry, kundru-aloo ya achaar ke liye. Taaza aur firm.",
    feat: ["Fresh ivy gourd — kundru / tindora", "Crunchy when fried", "Fry, sabzi, achaar ke liye", "Fridge mein 5–7 din taaza"], sl: SL2 },
  { match: "Tinda (Apple Gourd)", img: 19, name: "Tinda (Apple Gourd)", name_hi: "टिंडा", sub: VEG,
    desc: "Chhote, gol hare tinde — bharwa tinda, tinda masala ya dal ke saath. Komal, kam beej, taaza.",
    feat: ["Small tender apple gourds", "Light, easy-to-digest sabzi", "Bharwa, masala sabzi ke liye", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: "Kaddu (Pumpkin)", img: 20, name: "Kaddu (Pumpkin)", name_hi: "कद्दू", sub: VEG,
    desc: "Meetha desi kaddu (kohda) — khatta-meetha kaddu, kaddu ki sabzi, sambar ya halwa ke liye. Cut piece, taaza.",
    feat: ["Sweet orange-flesh pumpkin", "Vitamin A se bharpoor", "Sabzi, sambar, halwa ke liye", "Cut piece — fridge mein 4–5 din"], sl: SL2 },
  { match: null, img: 21, name: "Arbi (Taro Root)", name_hi: "अरबी", sub: VEG, unit: "500 g", price: 40, mrp: 50, stock: 30,
    desc: "Taazi arbi (kochai) — arbi fry, arbi masala, arbi ke patte ki bhaji ya sambar ke liye. Firm, bina daag ke.",
    feat: ["Fresh taro corms — arbi / kochai", "Fibre aur potassium ka source", "Fry, masala sabzi, sambar ke liye", "Thandi jagah 7–10 din"], sl: SLR },
  { match: "Parwal (Pointed Gourd)", img: 22, name: "Parwal (Pointed Gourd)", name_hi: "परवल", sub: VEG,
    desc: "Hare dhaari-daar parwal — parwal-aloo, bharwa parwal ya parwal ki mithai ke liye. Komal, kam beej.",
    feat: ["Fresh pointed gourds", "Light summer sabzi", "Bharwa, sabzi, mithai ke liye", "Fridge mein 5–7 din taaza"], sl: SL2 },
  { match: "Suran (Yam)", img: 23, name: "Suran (Yam)", name_hi: "सुरन / जिमीकंद", sub: VEG,
    desc: "Desi suran (jimikand / elephant foot yam) — suran fry, suran ki sabzi ya chips ke liye. Cut piece, taaza.",
    feat: ["Elephant foot yam — suran / jimikand", "Fibre aur potassium se bharpoor", "Fry, masala sabzi, chips ke liye", "Cut piece — fridge mein 5 din"], sl: SL2 },
  { match: "Sakarkand (Sweet Potato)", img: 24, name: "Sakarkand (Sweet Potato)", name_hi: "शकरकंद", sub: VEG,
    desc: "Meethe desi sakarkand — ubaal kar chaat, fry, halwa ya vrat ke khane ke liye. Firm aur taaza.",
    feat: ["Sweet Indian sweet potatoes", "Fibre aur vitamin A se bharpoor", "Chaat, fry, halwa, vrat ke liye", "Thandi jagah 7–10 din"], sl: SLR },
  { match: "Bhutta (Sweet Corn)", img: 25, name: "Bhutta (Sweet Corn)", name_hi: "भुट्टा", sub: VEG,
    desc: "Meethe, rasile sweet corn ke bhutte — ubaal kar masala corn, bhutte ka kees ya salad ke liye. Chhile hue, taaza.",
    feat: ["Sweet golden corn cobs, 2 pcs", "Fibre se bharpoor", "Boiled corn chaat, kees, salad ke liye", "Fridge mein 3–4 din taaza"], sl: SL1 },
  { match: null, img: 26, name: "Kachha Kela (Raw Banana)", name_hi: "कच्चा केला", sub: VEG, unit: "4 pcs", price: 30, mrp: 35, stock: 30,
    desc: "Hare kachhe kele — kele ki sabzi, kofta, chips ya vrat ke khane ke liye. Firm aur taaze.",
    feat: ["Raw green bananas, 4 pcs", "Resistant starch, digestion-friendly", "Sabzi, kofta, chips ke liye", "Thandi jagah 4–5 din"], sl: SL2 },
  { match: null, img: 27, name: "Kachha Papita (Raw Papaya)", name_hi: "कच्चा पपीता", sub: VEG, unit: "1 pc", price: 35, mrp: 40, stock: 30,
    desc: "Hara kachha papita — papite ki sabzi, som tam salad, paratha ya achaar ke liye. Firm, sahi size ka.",
    feat: ["Raw green papaya, approx 500–700 g", "Digestive enzyme papain", "Sabzi, salad, achaar ke liye", "Fridge mein 5–7 din taaza"], sl: SL2 },
  { match: "Sahjan (Drumstick)", img: 28, gallery: [36], name: "Sahjan / Munga (Drumstick)", name_hi: "सहजन / मुनगा फली", sub: VEG,
    desc: "Lambi, komal munga ki phaliyan — sambar, munga-aloo ki sabzi, dal ya kadhi ke liye. Chhattisgarh ki favourite.",
    feat: ["Fresh moringa drumsticks", "Calcium aur vitamin C se bharpoor", "Sambar, sabzi, dal ke liye", "Fridge mein 4–5 din taaza"], sl: SL2 },
  { match: null, img: 29, name: "Kathal (Raw Jackfruit)", name_hi: "कच्चा कटहल", sub: VEG, unit: "500 g", price: 40, mrp: 50, stock: 30,
    desc: "Kata hua kachha kathal — kathal ki sabzi, kathal biryani ya kofta ke liye. Chhila hua, ready-to-cook piece.",
    feat: ["Raw jackfruit, cut piece", "Veg 'meat' texture — biryani, sabzi", "High fibre", "Cut piece — fridge mein 2–3 din"], sl: SL1 },
  { match: "Khumbi (Button Mushroom)", img: 30, name: "Khumbi (Button Mushroom)", name_hi: "खुम्बी / मशरूम", sub: VEG,
    desc: "Safed, firm button mushroom — mushroom masala, matar-mushroom, pasta ya soup ke liye. Saaf, taaza packet.",
    feat: ["Fresh white button mushrooms", "Protein aur vitamin D ka source", "Masala, soup, pasta ke liye", "Fridge mein 3–4 din taaza"], sl: SL1 },
  { match: "Nimbu (Lemon)", img: 31, name: "Nimbu (Lemon)", name_hi: "नींबू", sub: "Herbs & Seasonings",
    desc: "Rasile desi nimbu — nimbu paani, salad, dal-tadka ya achaar ke liye. Patla chhilka, zyada ras.",
    feat: ["Juicy Indian lemons", "Vitamin C se bharpoor", "Nimbu paani, salad, achaar ke liye", "Fridge mein 10 din taaza"], sl: "5–7 din (fridge mein 10 din)" },
  { match: "Hara Pyaaz (Spring Onion)", img: 32, name: "Hara Pyaaz (Spring Onion)", name_hi: "हरा प्याज़", sub: "Herbs & Seasonings",
    desc: "Taaza hara pyaaz — chowmein, fried rice, pyaaz ki bhaji ya garnish ke liye. Komal patte, safed jad.",
    feat: ["Fresh spring onions, bundled", "Mild onion flavour", "Chinese dishes, bhaji, garnish ke liye", "Fridge mein 4–5 din taaza"], sl: SL1 },
  // ── Fix from the bhaji import: that "palak" photo was green amaranth ──
  { match: "Palak Bhaji (Spinach)", revertFop: true, name: "Palak Bhaji (Spinach)", name_hi: "पालक भाजी", sub: "Leafy Greens & Bhaji",
    desc: "Taaza, gehri hari palak — chaude patte aur soft dandiyan. Palak paneer, dal palak, saag ya paratha ke liye. Roz subah fresh lot, bina murjhaye patte.",
    feat: ["Fresh, deep-green leaves", "Iron, vitamin A aur K se bharpoor", "Palak paneer, dal palak, paratha ke liye ideal", "Dho kar seedha use karein"], sl: "2 din (fridge mein 3–4 din)" },
  { match: null, file: "incoming-images/bhaji/5.webp", name: "Chaulai Bhaji (Green Amaranth)", name_hi: "हरी चौलाई भाजी", sub: "Leafy Greens & Bhaji", unit: "250 g", price: 25, mrp: 30, stock: 30,
    desc: "Hari chaulai (green amaranth) bhaji — komal patte, halki mitti-si mithaas. Lehsun-mirch ke tadke mein sookhi bhaji, dal ke saath ya bhaat ke saath. Chhattisgarh ki roz ki bhaji.",
    feat: ["Green amaranth — hari chaulai / khada saag", "Iron aur calcium se bharpoor", "Tender leaves, handpicked", "Sookhi bhaji, dal-bhaji ke liye"], sl: SL1 },
];

async function getJson(path) { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`); return r.json(); }
const cats = await getJson("categories?select=id,name");
const fv = cats.find((c) => c.name === "Fruits & Vegetables");
const existing = await getJson(`products?select=id,name,price,mrp,unit,stock,active,image_url,image_urls&category_id=eq.${fv.id}`);
const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));

async function toWebp(file) {
  if (file.endsWith(".webp")) return readFileSync(file);
  return sharp(file).flatten({ background: "#ffffff" }).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
}
async function upload(productId, file, role) {
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  const body = await toWebp(file);
  const sha = createHash("sha1").update(body).digest("hex").slice(0, 8);
  const path = `${productId}/${role}-${sha}.webp`;
  if (APPLY) {
    const r = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...H, "Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "public, max-age=31536000" }, body });
    if (!r.ok) throw new Error(`upload ${path}: ${r.status} ${await r.text()}`);
  }
  return `${URL}/storage/v1/object/public/${BUCKET}/${path}`;
}
const src = (n) => { const f = BATCH.get(n); if (!f) throw new Error(`batch image ${n} missing`); return f; };

let created = 0, updated = 0, uploaded = 0;
for (const p of PRODUCTS) {
  const row = p.match ? byName.get(p.match.toLowerCase()) : null;
  if (p.match && !row) { console.log(`⚠️  expected "${p.match}" not found — skipping`); continue; }
  if (!p.match && byName.get(p.name.toLowerCase())) { console.log(`⚠️  "${p.name}" already exists — skipping create`); continue; }
  let id = row?.id;
  if (!id) {
    console.log(`+ CREATE ${p.name} — ${p.unit} ₹${p.price}/₹${p.mrp}, stock ${p.stock}`);
    if (APPLY) {
      const r = await fetch(`${URL}/rest/v1/products`, { method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ name: p.name, name_hi: p.name_hi, category_id: fv.id, unit: p.unit, price: p.price, mrp: p.mrp, stock: p.stock, active: false, description: p.desc }) });
      if (!r.ok) throw new Error(`create ${p.name}: ${r.status} ${await r.text()}`);
      id = (await r.json())[0].id;
    } else id = `(new)`;
    created++;
  } else { console.log(`~ UPDATE ${row.name} → ${p.name}  (₹${row.price}/₹${row.mrp}, ${row.unit}, stock ${row.stock}${row.active ? "" : ", was inactive"})`); updated++; }

  let fop, gallery = [];
  if (p.revertFop) {
    // Put the original 7-card FoP back in front and drop the amaranth shot.
    const old = row.image_urls ?? [];
    fop = old[0]; gallery = old.slice(1);
    if (!fop) throw new Error("palak: no original gallery to restore");
  } else {
    fop = await upload(id, p.file ?? src(p.img), "fop"); uploaded++;
    for (const n of p.gallery ?? []) { gallery.push(await upload(id, src(n), `view${n}`)); uploaded++; }
  }
  const patch = { name: p.name, name_hi: p.name_hi, description: p.desc, key_features: p.feat, shelf_life: p.sl, subcategory: p.sub, image_url: fop, image_urls: gallery, active: true, ...COMMON };
  console.log(`    fop=${fop.split("/").slice(-2).join("/")} + ${gallery.length} gallery · ${p.sub}`);
  if (APPLY) {
    const r = await fetch(`${URL}/rest/v1/products?id=eq.${id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error(`patch ${p.name}: ${r.status} ${await r.text()}`);
  }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"}: ${created} created, ${updated} updated, ${uploaded} images${APPLY ? " uploaded" : " to upload"}.`);
if (!APPLY) console.log("Re-run with --apply to write.");
