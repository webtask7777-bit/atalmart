#!/usr/bin/env node
/**
 * Clear the seed-data "customer care" placeholder from product rows.
 *
 *   node scripts/clear-placeholder-customer-care.mjs            # dry run (default)
 *   node scripts/clear-placeholder-customer-care.mjs --apply    # write (needs SUPABASE_SERVICE_ROLE_KEY)
 *
 * 997 of 1000 inspected products carry customer_care =
 * {email: support@atalmart.in, phone: +91-91120-00000, hours: "9 AM - 9 PM…"}
 * — neither address exists (launch audit AM-06). The product page no longer
 * renders a placeholder (it shows the real Atalmart support contact from
 * src/lib/constants.ts and only labels a genuine manufacturer contact as
 * such), so this cleanup is optional; running it keeps the data honest.
 * Real manufacturer contacts (e.g. Devbhog's marketing@devbhog.org) are left
 * untouched.
 */
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = APPLY ? env.SUPABASE_SERVICE_ROLE_KEY : env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error(APPLY ? "SUPABASE_SERVICE_ROLE_KEY missing" : "Supabase env missing"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json" };

const PLACEHOLDER_EMAIL = /@atalmart\.in$/i;
const PLACEHOLDER_PHONE = /91120.?00000/;
const isPlaceholder = (cc) =>
  !!cc && (PLACEHOLDER_EMAIL.test(cc.email ?? "") || PLACEHOLDER_PHONE.test(cc.phone ?? ""));

const rows = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${URL}/rest/v1/products?select=id,name,customer_care&customer_care=not.is.null&order=id&offset=${from}&limit=1000`, { headers: H });
  const page = await r.json();
  rows.push(...page);
  if (page.length < 1000) break;
}
const targets = rows.filter((p) => isPlaceholder(p.customer_care));
console.log(`${rows.length} products with customer_care; ${targets.length} carry the placeholder.`);
const kept = rows.filter((p) => !isPlaceholder(p.customer_care));
console.log(`Kept as genuine manufacturer contacts: ${kept.length}`);
for (const k of kept.slice(0, 10)) console.log(`  keep  ${k.name}: ${JSON.stringify(k.customer_care)}`);

if (!APPLY) {
  console.log(`\nDry run — re-run with --apply to set customer_care = null on ${targets.length} rows.`);
  process.exit(0);
}
let done = 0;
for (let i = 0; i < targets.length; i += 200) {
  const ids = targets.slice(i, i + 200).map((p) => p.id);
  const r = await fetch(`${URL}/rest/v1/products?id=in.(${ids.join(",")})`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ customer_care: null }),
  });
  if (!r.ok) { console.error("PATCH failed:", r.status, await r.text()); process.exit(1); }
  done += ids.length;
}
console.log(`Cleared customer_care on ${done} products.`);
