-- ═══════════════════════════════════════════════════════════════════════════
-- 017 — Actually hide cost columns from anon (fixes 016 §8)
--
-- 016 §8 used `revoke select (cost_price) ... from anon`, which is a NO-OP
-- here: Postgres column-level REVOKE only removes a column-specific grant, it
-- cannot subtract columns from the TABLE-level SELECT that Supabase grants to
-- anon by default. Verified live: anon could still read cost_price after 016.
--
-- The correct mechanism: drop anon's table-level SELECT entirely, then grant
-- back ONLY the customer-safe columns. RLS policies still apply on top.
--
--   • anon (public key, logged-out shoppers) → explicit column list below,
--     NO cost_price / supplier_id. A `select *` by anon now fails, which is
--     fine: every customer-facing query uses the explicit allow-list in
--     src/lib/supabase/product-columns.ts.
--   • authenticated / service_role → untouched (admin panel + server keep
--     full access).
--
-- ⚠ MAINTENANCE: adding a new customer-visible column to products or
-- product_variants now needs BOTH: (a) the column in CUSTOMER_PRODUCT_SELECT
-- and (b) `grant select (new_col) on ... to anon`. Miss (b) and logged-out
-- browsing errors on that column.
--
-- Idempotent — safe to re-run. Apply via SQL Editor / Management API.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── products ──
revoke select on public.products from anon;
grant select (
  id, name, name_hi, description, category_id, subcategory,
  price, mrp, unit, image_url, image_urls, stock, active, created_at,
  nutrition_per_100g, key_features, processing_type, fat_profile,
  sugar_profile, biological_source, fssai_license, shelf_life,
  country_of_origin, seller_name, seller_fssai, seller_address,
  return_policy, customer_care, disclaimer
) on public.products to anon;

-- ── product_variants ──
revoke select on public.product_variants from anon;
grant select (
  id, product_id, unit, price, mrp, stock, sort_order, is_default,
  image_url, created_at
) on public.product_variants to anon;

notify pgrst, 'reload schema';

select '017: anon now column-restricted — cost invisible to public key' as status;
