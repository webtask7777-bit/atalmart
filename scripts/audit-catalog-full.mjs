#!/usr/bin/env node
// Read-only catalogue health report — images, cost, stock, inactive reasons,
// variants. Complements audit-catalog.mjs (pricing/category/dupes). No writes.
import { readFileSync } from "fs";
import { resolve } from "path";
const env = Object.fromEntries(readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
async function getAll(path) { const out = []; let from = 0; for (;;) { const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}`, "Range-Unit": "items" } }); const rows = await res.json(); if (!Array.isArray(rows) || rows.length === 0) { if (!Array.isArray(rows)) console.error("ERR", path, JSON.stringify(rows).slice(0, 200)); break; } out.push(...rows); if (rows.length < 1000) break; from += 1000; } return out; }
const P = await getAll("products?select=id,name,price,mrp,unit,stock,active,category_id,image_url,image_urls,cost_price,description,created_at,subcategory");
const V = await getAll("product_variants?select=id,product_id,unit,price,mrp,stock,is_default,image_url");
const C = await getAll("categories?select=id,name,active");
const cat = new Map(C.map((c) => [c.id, c]));
const act = P.filter((p) => p.active), inact = P.filter((p) => !p.active);
const n = (a) => a.length;
console.log(`TOTAL ${P.length} | active ${n(act)} | inactive ${n(inact)} | variants ${V.length} | categories ${C.length} (${C.filter(c=>c.active).length} active)`);
const isSb = (u) => typeof u === "string" && u.includes("supabase.co/storage");
const stockOf = (p) => { const vs = V.filter((v) => v.product_id === p.id); return vs.length ? vs.reduce((s, v) => s + (v.stock || 0), 0) : p.stock; };
console.log("\n── ACTIVE products ──");
const a_noimg = act.filter((p) => !p.image_url); const a_extimg = act.filter((p) => p.image_url && !isSb(p.image_url) && !p.image_url.startsWith("/"));
const a_out = act.filter((p) => stockOf(p) <= 0); const a_low = act.filter((p) => { const s = stockOf(p); return s > 0 && s < 10; });
const a_nocost = act.filter((p) => !(p.cost_price > 0)); const a_loss = act.filter((p) => p.cost_price > 0 && p.price < p.cost_price);
const a_thin = act.filter((p) => p.cost_price > 0 && p.price >= p.cost_price && (p.price - p.cost_price) / p.price < 0.05);
const a_nodesc = act.filter((p) => !p.description || p.description.trim().length < 20);
const a_nosub = act.filter((p) => !p.subcategory); const a_badcat = act.filter((p) => !cat.has(p.category_id) || !cat.get(p.category_id).active);
const a_negstock = act.filter((p) => stockOf(p) < 0);
console.log(`no image: ${n(a_noimg)} | image not on Supabase storage: ${n(a_extimg)}`);
console.log(`out of stock: ${n(a_out)} | low stock (<10): ${n(a_low)} | negative stock: ${n(a_negstock)}`);
console.log(`no cost price: ${n(a_nocost)} | selling BELOW cost: ${n(a_loss)} | margin < 5%: ${n(a_thin)}`);
console.log(`no/short description: ${n(a_nodesc)} | no subcategory: ${n(a_nosub)} | category missing/inactive: ${n(a_badcat)}`);
const show = (t, arr, f, k = 12) => { if (!arr.length) return; console.log(`\n  ${t} (${arr.length}):`); arr.slice(0, k).forEach((p) => console.log("   - " + f(p))); if (arr.length > k) console.log(`   … +${arr.length - k} more`); };
show("Selling below cost", a_loss, (p) => `${p.name} — price ₹${p.price} < cost ₹${p.cost_price}`);
show("Margin under 5%", a_thin, (p) => `${p.name} — ₹${p.price} vs cost ₹${p.cost_price}`);
show("Out of stock (active, visible as Sold out)", a_out, (p) => `${p.name} [${cat.get(p.category_id)?.name}]`);
show("Low stock", a_low, (p) => `${p.name} — ${stockOf(p)} left`);
show("Active without image", a_noimg, (p) => p.name);
show("Image hosted elsewhere", a_extimg, (p) => `${p.name} — ${p.image_url.slice(0, 60)}`);
show("Category missing/inactive", a_badcat, (p) => `${p.name} — ${p.category_id}`);
console.log("\n── INACTIVE products (why?) ──");
const i_noimg = inact.filter((p) => !p.image_url); const i_img = inact.filter((p) => p.image_url);
const i_stock = inact.filter((p) => p.image_url && stockOf(p) > 0); const i_priced = i_stock.filter((p) => p.price > 0 && p.mrp > 0 && p.price <= p.mrp);
console.log(`inactive & no image: ${n(i_noimg)} | inactive but HAS image: ${n(i_img)} | has image + stock>0: ${n(i_stock)} | of which price ok: ${n(i_priced)} (candidates to publish)`);
show("Inactive but ready (image + stock + price ok)", i_priced, (p) => `${p.name} — ₹${p.price}/₹${p.mrp}, stock ${stockOf(p)}`, 20);
const byCatInact = {}; for (const p of inact) { const k = cat.get(p.category_id)?.name || "?"; byCatInact[k] = (byCatInact[k] || 0) + 1; }
console.log("\n  inactive by category:"); Object.entries(byCatInact).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   ${String(v).padStart(4)}  ${k}`));
console.log("\n── VARIANTS ──");
const v_orphan = V.filter((v) => !P.find((p) => p.id === v.product_id)); const v_badprice = V.filter((v) => !(v.price > 0) || v.price > v.mrp);
const prodWithV = new Set(V.map((v) => v.product_id)); const v_nodefault = [...prodWithV].filter((pid) => !V.some((v) => v.product_id === pid && v.is_default));
console.log(`orphan variants: ${n(v_orphan)} | variant price invalid: ${n(v_badprice)} | products with variants but no default: ${n(v_nodefault)}`);
console.log("\n── NAME hygiene (active) ──");
const a_dbl = act.filter((p) => /\s{2,}|^\s|\s$/.test(p.name)); const a_caps = act.filter((p) => p.name === p.name.toUpperCase() && /[A-Z]{4,}/.test(p.name));
const a_dupe = Object.values(act.reduce((m, p) => { const k = p.name.toLowerCase().replace(/\s+/g, " ").trim(); (m[k] ||= []).push(p); return m; }, {})).filter((g) => g.length > 1);
console.log(`extra whitespace: ${n(a_dbl)} | ALL CAPS: ${n(a_caps)} | exact duplicate names among active: ${n(a_dupe)}`);
show("ALL CAPS names", a_caps, (p) => p.name, 8);
show("Duplicate active names", a_dupe, (g) => `${g[0].name} ×${g.length}`, 10);
