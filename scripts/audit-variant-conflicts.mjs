#!/usr/bin/env node
/**
 * READ-ONLY audit: products whose pack-size variants (product_variants) do
 * not agree with the product row they hang off, or with sibling catalogue
 * rows that carry the same family name.
 *
 *   node scripts/audit-variant-conflicts.mjs
 *
 * Background (launch audit AM-01, 8 Oct 2026): "Amul Taaza Milk (500 ml)"
 * is a ₹28 catalogue row that ALSO has two variants (500 ml ₹30, 1 L ₹59)
 * while separate rows "Amul Taaza Milk (1 L)" ₹112 and "(200 ml)" ₹14 exist.
 * The storefront now renders ONE selector (variants win when present), but
 * which prices are the merchant's real retail prices is a catalogue
 * decision — this script lists every such conflict so the owner can fix the
 * data in the admin. It never writes.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error("Supabase env missing in .env.local"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (q) => { const r = await fetch(`${URL}/rest/v1/${q}`, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };

const SIZE_RE = /\s*\(\s*(?:pack of\s*)?[\d.,]+\s*(?:x\s*[\d.,]+\s*)?[a-zA-Z]*\s*(?:x\s*\d+)?\s*\)\s*$/i;
const family = (name) => name.replace(/\s*Pack of \d+\s*/gi, " ").replace(SIZE_RE, "").replace(/\s+/g, " ").trim();
const norm = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

const variants = await get("product_variants?select=id,product_id,unit,price,mrp,stock,is_default,sort_order&order=product_id,sort_order");
const byProduct = new Map();
for (const v of variants) (byProduct.get(v.product_id) ?? byProduct.set(v.product_id, []).get(v.product_id)).push(v);
if (byProduct.size === 0) { console.log("No product_variants rows — nothing to audit."); process.exit(0); }

const ids = [...byProduct.keys()];
const products = await get(`products?select=id,name,unit,price,mrp,stock,active&id=in.(${ids.join(",")})`);
let conflicts = 0;
for (const p of products) {
  const vs = byProduct.get(p.id) ?? [];
  const issues = [];
  const sameUnit = vs.find((v) => norm(v.unit) === norm(p.unit));
  if (sameUnit && (Math.round(sameUnit.price) !== Math.round(p.price) || Math.round(sameUnit.mrp) !== Math.round(p.mrp))) {
    issues.push(`variant ${sameUnit.unit} ₹${sameUnit.price}/MRP₹${sameUnit.mrp} ≠ product row ₹${p.price}/MRP₹${p.mrp}`);
  }
  if (!sameUnit) issues.push(`product unit "${p.unit}" has no matching variant (${vs.map((v) => v.unit).join(", ")})`);
  if (!vs.some((v) => v.is_default)) issues.push("no is_default variant");
  // Sibling rows: separate products with the same family name.
  const fam = family(p.name);
  const sibs = (await get(`products?select=id,name,unit,price,mrp,active&name=ilike.${encodeURIComponent(fam.replace(/[%_]/g, "\\$&") + "%")}`))
    .filter((s) => s.id !== p.id && family(s.name) === fam);
  for (const s of sibs) {
    const v = vs.find((x) => norm(x.unit) === norm(s.unit));
    if (v) issues.push(`sibling row "${s.name}" ₹${s.price}${s.active ? "" : " (inactive)"} duplicates variant ${v.unit} ₹${v.price}`);
    else issues.push(`sibling row "${s.name}" ₹${s.price}${s.active ? "" : " (inactive)"} is not a variant of this product`);
  }
  if (issues.length) {
    conflicts++;
    console.log(`\n${p.name}  [${p.id}]${p.active ? "" : "  (inactive)"}`);
    for (const i of issues) console.log(`  • ${i}`);
  }
}
console.log(`\n${products.length} products with variants, ${conflicts} with conflicts. Nothing was changed.`);
