-- 012_subcategories.sql
-- Blinkit-style subcategory layer. Each product optionally belongs to one
-- subcategory *within* its category. Subcategory names/icons/order live in
-- code config (src/lib/subcategories.ts); only the per-product label is stored
-- here. Nullable — products with no assigned subcategory still show under the
-- category's "All" chip.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Helps the (optional) future case of server-side subcategory filtering; cheap
-- partial index over the assigned rows only.
CREATE INDEX IF NOT EXISTS idx_products_subcategory
  ON public.products (category_id, subcategory)
  WHERE subcategory IS NOT NULL;
