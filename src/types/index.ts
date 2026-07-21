export type UserRole = "customer" | "admin" | "rider";

export interface Profile {
  id: string;
  phone: string;
  name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  name_hi: string;
  icon: string;
  sort_order: number;
  active: boolean;
}

/**
 * Per-100g nutrition info (Blinkit-style table on product detail page).
 * All values are in grams except calories (kcal). Null means "not declared".
 */
export interface NutritionPer100g {
  protein?: number | null;
  carbs?: number | null;
  total_sugar?: number | null;
  added_sugars?: number | null;
  total_fat?: number | null;
  sat_fat?: number | null;
  trans_fat?: number | null;
  calcium?: number | null;
  calories?: number | null;
}

export interface CustomerCare {
  email?: string;
  phone?: string;
  hours?: string;
}

/**
 * A pack-size variant of a product (e.g. Amul Taaza Milk 500ml ₹30 + 1L ₹59).
 * When a product has variants, the cart/pricing/order flow uses variant.price
 * and variant.stock instead of the parent product's price/stock.
 */
export interface ProductVariant {
  id: string;
  product_id: string;
  unit: string;                 // "500 ml", "1 L", "200 g"
  price: number;
  mrp: number;
  stock: number;
  sort_order: number;
  is_default: boolean;
  image_url: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  name_hi: string;
  description: string | null;
  category_id: string;
  /** Blinkit-style subcategory within the parent category (migration 012).
   *  Null = unassigned; still shows under the category's "All" chip. Names live
   *  in code config (src/lib/subcategories.ts). */
  subcategory?: string | null;
  price: number;
  mrp: number;
  unit: string;
  image_url: string | null;
  /** Additional gallery images (back-of-pack, side, nutrition label, etc.).
   *  Front-of-pack always lives in image_url; image_urls is for the thumbnail
   *  row on the detail page. */
  image_urls?: string[] | null;
  stock: number;
  active: boolean;
  created_at: string;
  category?: Category;
  /** Pack-size variants. Empty / undefined = single-pack product. */
  variants?: ProductVariant[];

  // ─── Blinkit-style detail fields (migration 004) ───
  nutrition_per_100g?: NutritionPer100g | null;
  key_features?: string[] | null;
  processing_type?: string | null;       // "Pasteurized"
  fat_profile?: string | null;           // "Toned" | "Full Cream" | etc.
  sugar_profile?: string | null;         // "No Added Sugar" | "Sweetened"
  biological_source?: string | null;     // "Cow Milk" | "Buffalo Milk"
  fssai_license?: string | null;         // 14-digit FSSAI number
  shelf_life?: string | null;            // "2 days" | "6 months"
  country_of_origin?: string | null;     // defaults to "India"
  seller_name?: string | null;
  seller_fssai?: string | null;
  seller_address?: string | null;
  return_policy?: string | null;
  customer_care?: CustomerCare | null;
  disclaimer?: string | null;
}

export type OrderStatus =
  | "placed"
  | "confirmed"
  | "picking"
  | "picked"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "refunded";

/** One line of a return — typically a subset of the original order's items. */
export interface ReturnItem {
  order_item_id: string;
  product_id: string;
  product_name: string;
  quantity: number; // returned qty (≤ ordered qty)
  unit_price: number; // price per unit at time of order
}

export interface ReturnInfo {
  requested_at: string;
  reason: string;
  notes?: string;
  /** Selected items being returned — empty / undefined = legacy full-order return */
  items?: ReturnItem[];
  /** Calculated refund total (sum of item.quantity × unit_price). */
  refund_amount?: number;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  refunded_at?: string | null;
}

export interface Order {
  id: string;
  user_id: string;
  status: OrderStatus;
  total: number;
  delivery_fee: number;
  discount: number;
  address_line: string;
  lat: number;
  lng: number;
  rider_id: string | null;
  /**
   * Customer contact phone for THIS order. May differ from profile.phone if
   * delivering on behalf of someone else. First-class column — previously
   * regex'd out of `notes`.
   */
  phone: string | null;
  /** Payment method: "cod" | "online" | "wallet" etc. */
  payment_method: string | null;
  /** Applied coupon code, or null if no coupon used. */
  coupon_code: string | null;
  /** Freeform customer note (e.g. "Leave at gate"). NOT for structured data. */
  notes: string | null;
  placed_at: string;
  delivered_at: string | null;
  items?: OrderItem[];
  rider?: Rider;
  profile?: Profile;
  return_info?: ReturnInfo | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  /** Variant chosen at order time. Null = single-pack product. */
  variant_id?: string | null;
  /** Snapshot of variant.unit at order time so historic orders survive
   *  variant edits/deletions. */
  variant_unit?: string | null;
  product?: Product;
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  vehicle_number: string | null;
  status: "available" | "busy" | "offline";
  lat: number | null;
  lng: number | null;
  active: boolean;
  /** 6-digit login code for the rider app (phone + code auth). */
  access_code?: string | null;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  address_line: string;
  lat: number;
  lng: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  /** Selected variant (if product has multiple pack sizes). The cart UI's
   *  unit picker writes this; pricing + place_order use it to source the
   *  correct price/stock. Null = use product's default price/stock. */
  variant?: ProductVariant | null;
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string;
  user_name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  created_at: string;
  order_id?: string; // verified purchase if present
  hidden?: boolean; // admin-moderated
}
