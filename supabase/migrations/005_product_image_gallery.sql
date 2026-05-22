-- Add a multi-image gallery to products. `image_url` stays the primary
-- "front of pack" thumbnail; `image_urls` carries additional angles
-- (back, side, ingredients label, nutrition label).
alter table public.products
  add column if not exists image_urls text[];

select 'image_urls column added' as status;
