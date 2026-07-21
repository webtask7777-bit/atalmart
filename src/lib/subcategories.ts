/**
 * Blinkit-style subcategories — single source of truth.
 *
 * Keyed by the EXACT category name (must match `categories.name` in Supabase and
 * `CATEGORIES_SEED` in constants.ts). Each subcategory carries keyword hints used
 * by `scripts/assign-subcategories.mjs` to auto-tag products (first match wins, so
 * order more-specific subcats first). Only the resolved label is stored on
 * `products.subcategory`; names/order/icons live here.
 *
 * A product with no match keeps `subcategory = null` and still appears under the
 * category's "All" chip. Subcats with zero products simply don't render a chip.
 */
export type Subcat = {
  name: string;
  keywords: string[];
  /** Optional emoji shown on the chip; falls back to none. */
  icon?: string;
};

export const SUBCATEGORIES: Record<string, Subcat[]> = {
  // ─────────────── Fully populated this pass ───────────────
  "Atta, Rice & Dal": [
    { name: "Atta", icon: "🌾", keywords: ["atta", "whole wheat", "chakki"] },
    { name: "Rice", icon: "🍚", keywords: ["rice", "basmati", "sona mas", "kolam", "mogra", "tibar", "pulav", "idli rice"] },
    { name: "Toor, Urad & Chana", icon: "🫘", keywords: ["toor", "arhar", "urad", "chana dal", "sabut chana", "chana kala"] },
    { name: "Besan, Sooji & Maida", icon: "🥣", keywords: ["besan", "gram flour", "maida", "suji", "sooji", "rava", "semolina"] },
    { name: "Poha, Daliya & Other Grains", icon: "🌾", keywords: ["poha", "daliya", "broken wheat", "sabudana", "sago", "makhana", "foxnut", "quinoa"] },
    { name: "Rajma, Chhole & Others", icon: "🫘", keywords: ["rajma", "kidney", "chole", "chhole", "chickpea", "lobia", "black eye", "moth", "matki"] },
    { name: "Moong & Masoor", icon: "🫛", keywords: ["moong", "masoor"] },
    { name: "Fresh Atta", icon: "🌾", keywords: ["fresh atta", "chakki fresh"] },
    { name: "Millet & Other Flours", icon: "🌾", keywords: ["millet", "jowar", "bajra", "ragi", "multigrain"] },
  ],

  // ─────────────── Proposed taxonomy (config ready, populate later) ───────────────
  "Paan Corner": [
    { name: "Mouth Fresheners", keywords: ["mouth fresh", "mukhwas", "pass pass", "rajnigandha", "saunf", "elaichi"] },
    { name: "Supari & Mukhwas", keywords: ["supari", "paan"] },
    { name: "Cigarettes & Rolling", keywords: ["cigarette", "rolling", "lighter"] },
    { name: "Chocolates at Counter", keywords: ["chocolate", "mint", "polo", "mentos"] },
  ],
  Dairy: [
    { name: "Milk", keywords: ["milk", "doodh"] },
    { name: "Paneer & Tofu", keywords: ["paneer", "tofu"] },
    { name: "Curd & Yogurt", keywords: ["curd", "dahi", "yogurt", "yoghurt", "lassi"] },
    { name: "Butter & Cheese", keywords: ["butter", "cheese"] },
    { name: "Ghee", keywords: ["ghee"] },
  ],
  "Fruits & Vegetables": [
    { name: "Fresh Fruits", keywords: ["apple", "banana", "orange", "mango", "grape", "papaya", "fruit"] },
    { name: "Fresh Vegetables", keywords: ["potato", "onion", "tomato", "aloo", "pyaz", "vegetable", "bhindi", "gobi", "brinjal"] },
    { name: "Herbs & Seasonings", keywords: ["coriander", "mint", "curry leaf", "ginger", "garlic", "chilli"] },
    { name: "Exotics", keywords: ["broccoli", "lettuce", "zucchini", "bell pepper", "exotic", "avocado"] },
    { name: "Cuts & Sprouts", keywords: ["cut", "sprout", "peeled"] },
  ],
  "Cold Drinks & Juices": [
    { name: "Soft Drinks", keywords: ["coca", "pepsi", "sprite", "thums", "cola", "mountain dew", "mirinda", "7up", "limca", "fanta"] },
    { name: "Fruit Juices", keywords: ["juice", "maaza", "frooti", "tropicana", "real", "slice", "appy"] },
    { name: "Water & Soda", keywords: ["water", "soda", "bisleri", "kinley", "aquafina"] },
    { name: "Energy Drinks", keywords: ["sting", "red bull", "monster", "energy"] },
    { name: "Milk Drinks", keywords: ["lassi", "chaas", "buttermilk", "milkshake", "smoothie"] },
  ],
  "Snacks & Munchies": [
    // Order matters: first keyword match wins, so list specific snacks
    // (nachos/puffs/makhana) before the generic "chips" catch-all.
    { name: "Nachos", keywords: ["nacho", "doritos", "mad angles"] },
    { name: "Puffs & Corn Snacks", keywords: ["kurkure", "cheetos", "puffcorn", "corn puff", "twisteez"] },
    { name: "Makhana & Roasted", keywords: ["makhana", "foxnut", "roasted"] },
    { name: "Popcorn", keywords: ["popcorn", "act ii", "act 2"] },
    { name: "Bhujia & Namkeen", keywords: ["bhujia", "namkeen", "mixture", "sev", "chivda", "bhel", "boondi", "chana jor", "khatta meetha", "tedhe medhe", "soya stick", "karare"] },
    { name: "Chips & Crisps", keywords: ["lays", "pringles", "uncle chip", "wafer", "yumitos", "potato chip", "too yumm", "bingo starters", "balaji", "chips", "crisp"] },
  ],
  "Breakfast & Instant Food": [
    { name: "Noodles", keywords: ["maggi", "noodle", "yippee", "top ramen"] },
    { name: "Vermicelli & Pasta", keywords: ["vermicelli", "pasta", "seviyan"] },
    { name: "Ready Mixes", keywords: ["idli mix", "dosa mix", "rava idli", "khichdi mix", "instant mix", "poha mix", "upma"] },
    { name: "Cornflakes & Muesli", keywords: ["cornflakes", "kellogg", "chocos", "muesli"] },
    { name: "Oats", keywords: ["oats", "quaker"] },
    { name: "Instant Meals", keywords: ["ready to eat", "cup", "instant meal"] },
  ],
  "Chocolates & Sweets": [
    { name: "Chocolates", keywords: ["dairy milk", "kitkat", "munch", "5 star", "perk", "chocolate", "nestle", "cadbury"] },
    { name: "Indian Sweets", keywords: ["gulab jamun", "rasgulla", "kaju katli", "mithai", "ladoo", "barfi", "soan", "halwa"] },
    { name: "Candy & Gum", keywords: ["candy", "gum", "toffee", "lollipop", "eclairs", "mentos"] },
    { name: "Premium Chocolates", keywords: ["toblerone", "ferrero", "lindt", "silk", "bournville"] },
    { name: "Energy Bars", keywords: ["energy bar", "protein bar", "yoga bar", "granola bar"] },
  ],
  "Bakery & Biscuits": [
    { name: "Cookies", keywords: ["cookie", "good day", "dark fantasy", "unibic"] },
    { name: "Cream Biscuits", keywords: ["cream", "bourbon", "hide", "oreo", "treat"] },
    { name: "Glucose & Marie", keywords: ["parle-g", "parle g", "glucose", "marie", "nutrichoice", "nutri choice", "digestive"] },
    { name: "Rusk & Khari", keywords: ["rusk", "khari", "toast", "toastea"] },
    { name: "Cakes & Rolls", keywords: ["cake", "roll", "croissant", "muffin", "swiss"] },
    { name: "Bread", keywords: ["bread", "pav", "bun"] },
  ],
  "Tea, Coffee & Health Drink": [
    { name: "Tea", keywords: ["tea", "chai", "red label", "tata tea", "agni", "taj mahal", "green label"] },
    { name: "Coffee", keywords: ["coffee", "nescafe", "bru", "gold blend"] },
    { name: "Health Drinks", keywords: ["bournvita", "horlicks", "boost", "complan", "protinex"] },
    { name: "Green & Herbal Tea", keywords: ["green tea", "herbal", "chamomile", "tulsi"] },
  ],
  "Masala, Oil & More": [
    { name: "Cooking Oil", keywords: ["oil", "fortune", "saffola", "sunflower", "mustard oil", "refined"] },
    { name: "Ghee & Vanaspati", keywords: ["ghee", "vanaspati", "dalda"] },
    { name: "Whole Spices", keywords: ["whole", "jeera", "cumin", "dhania seed", "elaichi", "clove", "cinnamon", "bay leaf", "pepper"] },
    { name: "Powdered Spices", keywords: ["haldi", "turmeric", "mirch", "chilli powder", "dhania powder", "coriander powder"] },
    { name: "Salt & Sugar", keywords: ["salt", "namak", "sugar", "cheeni", "jaggery", "gud"] },
    { name: "Blended Masala", keywords: ["masala", "everest", "mdh", "garam masala", "chaat", "sambar"] },
  ],
  "Sauces & Spreads": [
    { name: "Ketchup & Sauces", keywords: ["ketchup", "sauce", "chilli sauce", "soy", "schezwan", "tomato sauce"] },
    { name: "Jam & Honey", keywords: ["jam", "honey", "marmalade"] },
    { name: "Peanut Butter", keywords: ["peanut butter"] },
    { name: "Mayonnaise", keywords: ["mayonnaise", "mayo"] },
    { name: "Chocolate Spread", keywords: ["nutella", "chocolate spread", "choco spread"] },
    { name: "Pickles", keywords: ["pickle", "achar"] },
  ],
  "Chicken, Meat & Fish": [
    { name: "Chicken", keywords: ["chicken", "murga"] },
    { name: "Mutton", keywords: ["mutton", "goat", "lamb"] },
    { name: "Fish & Seafood", keywords: ["fish", "prawn", "seafood", "rohu", "surmai"] },
    { name: "Eggs", keywords: ["egg"] },
    { name: "Frozen Meat", keywords: ["frozen", "nugget", "kebab", "patty"] },
    { name: "Sausages & Cold Cuts", keywords: ["sausage", "salami", "ham", "cold cut", "bacon"] },
  ],
  "Baby Care": [
    { name: "Diapers & Wipes", keywords: ["diaper", "pampers", "huggies", "wipe"] },
    { name: "Baby Food", keywords: ["cerelac", "lactogen", "baby food", "nan", "formula"] },
    { name: "Baby Bath & Skin", keywords: ["johnson", "baby lotion", "baby soap", "baby oil", "baby powder"] },
    { name: "Feeding Needs", keywords: ["bottle", "nipple", "sipper", "feeding"] },
  ],
  "Pharma & Wellness": [
    { name: "OTC Medicines", keywords: ["dolo", "crocin", "paracetamol", "vicks", "strepsils", "digene", "eno"] },
    { name: "First Aid", keywords: ["band-aid", "bandaid", "dettol", "cotton", "volini", "moov", "antiseptic"] },
    { name: "Sanitizers & Masks", keywords: ["sanitizer", "mask", "gloves"] },
    { name: "Vitamins & Supplements", keywords: ["vitamin", "supplement", "protein", "zinc", "calcium", "immunity"] },
    { name: "Sexual Wellness", keywords: ["condom", "durex", "manforce", "lubricant"] },
  ],
  "Cleaning Essentials": [
    { name: "Detergents", keywords: ["surf", "ariel", "tide", "rin", "detergent", "wheel", "ghadi"] },
    { name: "Dishwash", keywords: ["vim", "dishwash", "pril", "exo"] },
    { name: "Floor & Toilet Cleaners", keywords: ["harpic", "lizol", "cleaner", "phenyl", "toilet", "floor"] },
    { name: "Repellents", keywords: ["mortein", "hit", "goodknight", "all out", "repellent"] },
    { name: "Fresheners", keywords: ["freshener", "odonil", "ambi pur", "air fresh"] },
    { name: "Pooja Needs", keywords: ["agarbatti", "incense", "diya", "camphor", "kapoor", "dhoop", "loban", "kalawa", "janeu", "sindoor", "kumkum", "gangajal", "pooja", "supari", "tulsi"] },
    { name: "Tissues & Disposables", keywords: ["tissue", "toilet roll", "napkin", "kitchen roll", "paper plate", "plastic cup", "foil", "cling", "parchment"] },
    { name: "Batteries", keywords: ["battery", "duracell", "eveready", "cell"] },
  ],
  "Stationery, Office & School": [
    { name: "Pens & Pencils", keywords: ["pen", "pencil", "highlighter", "marker"] },
    { name: "Notebooks & Paper", keywords: ["notebook", "sticky note", "post-it"] },
    { name: "Glue & Adhesives", keywords: ["glue", "fevicol", "fevikwik"] },
    { name: "Office Supplies", keywords: ["stapler", "punch", "scissor", "eraser", "sharpener", "geometry box", "whitener", "pencil box"] },
  ],
  "Personal Care": [
    { name: "Bath & Body", keywords: ["soap", "body wash", "shower gel", "lux", "dove", "lifebuoy", "santoor"] },
    { name: "Hair Care", keywords: ["shampoo", "conditioner", "hair oil", "clinic plus", "sunsilk", "head"] },
    { name: "Oral Care", keywords: ["toothpaste", "colgate", "toothbrush", "closeup", "mouthwash", "sensodyne"] },
    { name: "Skin Care", keywords: ["cream", "lotion", "face wash", "moisturizer", "ponds", "nivea", "fair"] },
    { name: "Deodorants", keywords: ["deodorant", "deo", "perfume", "body spray", "axe", "fogg"] },
    { name: "Shaving", keywords: ["razor", "shaving", "gillette", "trimmer", "blade"] },
    { name: "Feminine Hygiene", keywords: ["sanitary", "pad", "whisper", "stayfree", "tampon"] },
  ],
  "Pet Care": [
    { name: "Dog Food", keywords: ["dog", "pedigree", "drools"] },
    { name: "Cat Food", keywords: ["cat", "whiskas", "meo"] },
    { name: "Pet Treats", keywords: ["treat", "biscuit", "chew"] },
    { name: "Pet Care Accessories", keywords: ["leash", "collar", "litter", "shampoo", "toy"] },
  ],
};

/** Subcategory list for a category, or [] if none defined. */
export function subcatsFor(categoryName?: string | null): Subcat[] {
  if (!categoryName) return [];
  return SUBCATEGORIES[categoryName] ?? [];
}
