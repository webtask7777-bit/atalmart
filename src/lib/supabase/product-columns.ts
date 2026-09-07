/**
 * Column allow-list for CUSTOMER-facing product reads.
 *
 * Customers must never receive wholesale cost. `cost_price` and `supplier_id`
 * (migration 016) are admin-only, so customer queries select an explicit column
 * list that OMITS them instead of `select("*")` — otherwise the cost would ship
 * in the network payload even though no customer UI renders it.
 *
 * Admin reads (useAllProducts, pricing/P&L) keep `select("*")` on purpose — they
 * need the cost. Keep this list in sync with the Product type MINUS cost_price /
 * supplier_id. Missing a column here just hides it from customers (safe); adding
 * cost_price here would leak it (don't).
 */

const CUSTOMER_PRODUCT_FIELDS = [
  "id",
  "name",
  "name_hi",
  "description",
  "category_id",
  "subcategory",
  "price",
  "mrp",
  "unit",
  "image_url",
  "image_urls",
  "stock",
  "active",
  "created_at",
  "nutrition_per_100g",
  "key_features",
  "processing_type",
  "fat_profile",
  "sugar_profile",
  "biological_source",
  "fssai_license",
  "shelf_life",
  "country_of_origin",
  "seller_name",
  "seller_fssai",
  "seller_address",
  "return_policy",
  "customer_care",
  "disclaimer",
].join(",");

// Variant columns minus cost_price.
const CUSTOMER_VARIANT_FIELDS =
  "id,product_id,unit,price,mrp,stock,sort_order,is_default,image_url,created_at";

/**
 * Full PostgREST select string for customer product reads, including the
 * category + variant relations, with cost columns excluded everywhere.
 */
export const CUSTOMER_PRODUCT_SELECT = `${CUSTOMER_PRODUCT_FIELDS}, category:categories(*), variants:product_variants(${CUSTOMER_VARIANT_FIELDS})`;
