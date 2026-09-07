<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Product images workflow

The admin uses a **Find Images picker** (not bulk auto-fetch). Open
`/admin/products`, click a product, click **"Find images from the web"** in
the edit modal — the picker shows ranked candidates (Blinkit, Zepto,
JioMart, BigBasket, Amazon.in, brand sites), each with a background-quality
badge (green ✓ = clean white background, yellow ~ = mixed, red ✗ = banner/
lifestyle). Pick FoP first, then any angles; Apply uploads to Supabase
storage and patches `products.image_url` + `image_urls[]`.

Bulk auto-pipeline (`scripts/bulk-find-images.py`) was tried and abandoned —
known failure modes:
- **Variant mismatch**: search for "Cerelac Mixed Vegetables" returns
  "Cerelac Khichdi with Vegetables & Ghee" — different SKU, same brand.
- **Front vs back**: ranks the nutrition-info side over the front of pack.
- **Promo combo banners**: Blinkit returns "GREAT DEAL" multi-pack art
  that passes the white-background quality gate.
- **JioMart 403s**: their image CDN session-locks; downloads fail.
- **Indiamart watermarks**: B2B seller re-uploads with their branding
  stamped on. Already excluded from the rank by default.

If you must run bulk, use `--no-brand-filter` to bypass the brand-only
gating, and be ready to manually revert wrong matches via the admin.

## Stock-movement ledger (migration 006)

Every change to `products.stock` is captured in `public.stock_movements`
by a trigger (see `supabase/migrations/006_stock_movements.sql`). The
admin product edit modal shows the last 20 entries inline. Three RPCs
label their changes:
- `place_order_atomic` → `reason='order', source='order_placement_rpc'`
- `restore_stock_atomic` → `reason='order_cancel_or_return'`
- `admin_adjust_stock` → `reason='admin_edit', source='admin_panel'`

`updateProduct(...)` in `src/lib/hooks/use-products.ts` routes through
`admin_adjust_stock` when `stock` is in the payload so the ledger row
gets a real actor + reason instead of `'unspecified'`.

If the RPC isn't installed yet, the helper falls back to a plain UPDATE
(detected by error code PGRST202 / 42883), so admins are never blocked.

## Categories are real UUIDs in live mode

Earlier code hardcoded `String(i+1)` as the category id everywhere, which
worked in demo mode but never matched the Supabase UUIDs in live. Fixed
in `useCategories()` (`src/lib/hooks/use-products.ts`) — admin pages now
use real category data with the correct ids. Don't reintroduce
`String(i+1)`; use the hook.
