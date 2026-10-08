# Launch polish — 8 October 2026

Response to `Atalmart-Claude-Handoff-2026-10-08.zip` (11 audit findings, 27
acceptance tests). Everything below was traced in this repository and the
live catalogue (read-only). Nothing was deployed and no production data was
changed. The fix set is on the `launch-fixes` branch, uncommitted.

## What was wrong (root causes)

| ID | Finding | Root cause in code | Fix |
|---|---|---|---|
| AM-01 (P0) | Two pack selectors with different prices | The PDP rendered **both** a "sibling rows" picker (separate catalogue rows `Amul Taaza Milk (1 L)` ₹112 / `(200 ml)` ₹14, matched by name prefix) **and** the product's own `product_variants` (500 ml ₹30, 1 L ₹59). The `<title>` used `products.price` (₹28), a third number. | One selector: variants win when present; the sibling picker only shows for products with no variants and only for rows with the same family key. Title, meta and JSON-LD use the default variant (`primaryOffer`). |
| AM-02 (P0) | Checkout item ₹28 "(500 ml)" under a ₹59 subtotal | `checkout/page.tsx` rendered `product.name` and `product.price × qty` per row, ignoring `item.variant`; subtotal used the variant. Row `key` was `product.id` (collides for two packs). | All surfaces resolve a line through `resolveLine()` (`src/lib/cart-line.ts`): key, family name, pack, unit price/MRP, line total. |
| AM-03 (P1) | "(500 ml) · 1 L" label, savings ₹2 not ₹3 | Cart savings used `product.mrp − product.price`; label concatenated the catalogue name (with its own size) and the variant unit. | Family name + selected pack (`sellableName`); savings = Σ qty × (variant MRP − variant price). Server order lines use the same naming (was "… (500 ml) (1 L)" on receipts). |
| AM-04 (P1) | "25–30 min" shown while orders paused | Header ETA came from the sector table; the busy banner from `settings.store_status`; the card "QUICK" pill was unconditional. | `deriveAvailability()` (`src/lib/availability.ts`) → open / capacity_paused / closed / unserviceable / unknown. Header chip, card pill, PDP chip, busy strip, cart and checkout CTA read it. No ETA unless open; closed shows only the operator's message. |
| AM-05 (P1) | "milk" → 90 rows led by tea/chocolate/ghee; input ≠ URL | ILIKE over `description` dominated; results came back newest-first. Header input had its own state and never read `?search=`. | `src/lib/search-rank.ts`: type aliases (milk/doodh/दूध …) expand the query; results ranked name/type > name_hi > description-only, derivatives after plain product, out-of-stock last. Header box syncs from the URL (chips, Clear, Home, Back); Enter on empty clears. |
| AM-06 (P1) | support@atalmart.in / +91-91120-00000 | Seed data: 997 of 1,000 inspected products carry that placeholder in `customer_care`. | PDP always shows **Atalmart order support** from `constants.ts`; a product's `customer_care` is shown only when it is not the placeholder, labelled "Brand / manufacturer contact". `scripts/clear-placeholder-customer-care.mjs` (dry run) can null the seed values. |
| AM-07 (P1) | 2 h vs 24 h complaint window | 3 Devbhog rows carry a hand-written "2 ghante" `return_policy`; FAQ, refund page and `isWithinReturnWindow()` enforce 24 h. | One config, `src/lib/policy.ts`: default 24 h + `CATEGORY_EXCEPTIONS` (fresh categories carry a "report promptly with photo" note, same window). PDP, FAQ, Contact, Refund page render from it; the product column is no longer displayed. |
| AM-08 (P2) | Pincode dialog + install prompt together | `PWAProvider` showed on `beforeinstallprompt` regardless of other overlays. | Shown only when the pincode dialog is closed, not on /checkout, after a return visit **or** an item in the cart; 14-day dismissal kept; positioned above the cart bar. |
| AM-09 (P2) | "Hours: Devbhog (CG Co-op Dairy Federation), Kumhari" | Import mapped the organisation into `customer_care.hours`. | Hours rendered only when the value looks like hours. |
| AM-10 (P2) | Category not in URL | Category/subcategory lived in component state. | `/?category=Dairy&sub=Milk` is the state (push for category, replace for sub); refresh/Back/share restore it. |
| AM-11 (P2) | Unnamed quantity buttons | Icon-only buttons. | "Decrease/Increase *Amul Taaza Milk (1 L)* quantity", `role=group`, live quantity; same on cards and PDP; 36 px targets in cart. |

Also done: `:focus-visible` ring and a `prefers-reduced-motion` kill-switch in
`globals.css`; search `<input type=search>` with clear button and labels;
`Minimum order ₹49` is now **enforced server-side** (`priceOrder`) and shown
in cart/checkout — it was advertised in the FAQ but never applied.

## Money rules as implemented (confirm with the merchant)

- Free delivery: subtotal **after coupon ≥ ₹299, inclusive** (₹299 qualifies). FAQ/hero copy changed from "above ₹299" to "₹299 or more". If the intended basis is before-coupon, change one line in `computeQuote()` and `priceOrder()`.
- Minimum order: **merchandise subtotal before coupon, ₹49, delivery never counts**. Boundary tests at ₹48/49/50 in `tests/cart-line.test.ts`.
- Savings: merchandise (variant MRP − price) + coupon. A waived delivery fee is shown struck-through on its own line, not counted as savings.

## Catalogue questions only the merchant can answer

1. **Amul Taaza Milk (500 ml)** (`a401c652…`): product row ₹28/MRP ₹30, variant 500 ml ₹30/₹32, variant 1 L ₹59/₹62, sibling rows "(1 L)" ₹112 and "(200 ml)" ₹14. The storefront now sells the **variants**. Decide which prices are real, then either delete the two variants or deactivate the sibling rows. `node scripts/audit-variant-conflicts.mjs` lists this (it is the only product of 14 with variants that conflicts).
2. **Fresh dairy reporting window**: keep 24 h everywhere (current), or set 2 h for Dairy? One line: `CATEGORY_EXCEPTIONS.Dairy.reportWindowHours = 2` in `src/lib/policy.ts` — FAQ, refund page, PDP and the return check follow.
3. **Placeholder customer care** on ~997 products: run `node scripts/clear-placeholder-customer-care.mjs --apply` to null it (optional; the UI already hides it).
4. Store is currently `busy` in production settings — the header now says "Orders paused" instead of "25–30 min".

## Evidence

- `npm test` — 28 regression cases (variant identity, money, free-delivery and min-order boundaries, search ranking, availability states, policy) pass. Runs on Node's built-in test runner; no new dependencies.
- `npm run typecheck` — clean.
- `npm run lint` — no new findings; the 53 pre-existing React-Compiler findings are unchanged (same lines in HEAD).
- `next build` — clean (no warnings).
- Browser pass against the production build (`next start -p 3005`, live catalogue, store status = busy):
  - PDP `a401c652…`: `<title>` "Amul Taaza Milk (500 ml) — ₹30" (was ₹28); one "Select pack" group (500 ml ₹30 / 1 L ₹59); h1 "Amul Taaza Milk"; "Selected pack: 1 L"; ₹59 / 1 L, MRP ₹62, "You save ₹3"; header chip "Orders paused · Sector 21–29" (no ETA); Customer Care = Atalmart support only; Return Policy = 24 h config text.
  - Cart: "Amul Taaza Milk · 1 L · ₹59 each", item total ~~₹62~~ ₹59, MRP savings −₹3, delivery ₹25, total ₹84, "You saved ₹3" (T02–T04).
  - Checkout summary: "Amul Taaza Milk (1 L) × 1 — ₹59", subtotal ₹59, delivery ₹25, total ₹84; CTA "Orders paused" with the same copy as the strip (T03, T11).
  - `/?search=milk` and `/?search=दूध`: identical 96-row result set, first ten are plain milks (Devbhog Double Toned, Amul Taaza, Devbhog Supreme, Amul Gold…); header box shows the query; Enter on an empty box and the logo both return to `/` with the box cleared (T14, T15).
  - `/?category=Dairy&sub=Milk` → heading Dairy, 28 items, both chips active; tapping Ghee → `&sub=Ghee`, 11 items; Back restores the previous entry (T16).
  - 375 px: no horizontal overflow on PDP or cart; quantity controls ≥ 36 px.
  - One observation: twice, immediately after a cold full page load of `/?search=…` on the freshly started server, a logo click did not navigate; five later attempts (with history instrumentation) all pushed `/` correctly. Looks like Next's client router during ISR warm-up rather than app code; not reproducible afterwards.

Not done here (needs staging/devices): payment lifecycle in the Razorpay sandbox (T26), real-device mobile pass (T24), analytics events (T27).

## Category tile art (added mid-session)

The 19 "vintage stall" shopfronts (Downloads, 8 Oct) replaced every `public/categories/<slug>.webp` (now 416×416, ~30 KB, trimmed and set on the tile canvas) with the PNG masters alongside. Builder: `scripts/build-category-covers-from-stalls.mjs`. Verified on the home grid: 19 tiles, none broken.

## Files

New: `src/lib/product-name.ts`, `src/lib/cart-line.ts`, `src/lib/availability.ts`,
`src/lib/hooks/use-availability.ts`, `src/lib/search-rank.ts`, `src/lib/policy.ts`,
`tests/*`, `scripts/audit-variant-conflicts.mjs`, `scripts/clear-placeholder-customer-care.mjs`.

Changed: cart store, cart page, checkout, PDP (client + server page), product card,
header, home client, PWA provider, busy strip, `use-products`, `use-orders` (demo
line names), `order-pricing` + both pricing deps (min order, line names),
`public-product` (variants in metadata/JSON-LD), constants, FAQ/Contact/Refund
pages, hero copy, `globals.css`, `package.json` (test/typecheck scripts).
