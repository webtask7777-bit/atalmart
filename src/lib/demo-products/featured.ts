import type { Product } from "@/types";
import { p } from "./_helper";

/**
 * Featured products — small eager-loaded set for the homepage initial render.
 *
 * Hand-picked: ~2-3 best-known SKUs per category covering the staples a
 * Naya Raipur customer would search for first (milk, atta, Maggi, Coke,
 * Lays, Cadbury, Aashirvaad, Tata Salt, etc.).
 *
 * **Convention**: these IDs MUST also exist in their category-NN files. The
 * loadAll() result de-duplicates by id, so a featured entry rendered before
 * the full category loads doesn't cause flicker or double-cards.
 */

/** Source-of-truth list of featured ids (cheap import for use in dedup). */
export const FEATURED_IDS = new Set<string>([
  // Dairy
  "p19", "p22", "p23", "p25", "p29",
  // Fruits & Veg
  "p1", "p2", "p3", "p4", "p15", "p18",
  // Cold Drinks
  "p83", "p84", "p86", "p87",
  // Snacks
  "p67", "p68", "p70",
  // Breakfast / Instant
  "p98", "p107", "p108",
  // Sweet
  "p80", "p82", "p224",
  // Bakery & Biscuits
  "p72", "p73", "p74", "p236",
  // Tea & Coffee
  "p88", "p90", "p92",
  // Atta / Rice / Dal
  "p31", "p33", "p35",
  // Masala / Oil
  "p46", "p48", "p52", "p65",
  // Sauces
  "p171", "p173",
  // Personal Care
  "p110", "p112", "p118",
  // Cleaning
  "p127", "p129",
  // Baby Care
  "p138", "p141",
  // Pharma
  "p268", "p269", "p284",
  // Pet
  "p207", "p211",
]);

/**
 * Featured products inline. Duplicating the data (rather than importing from
 * each category file) keeps featured.ts tiny and self-contained — no
 * accidental whole-category imports leaking into the homepage bundle.
 *
 * If you edit a price in a category file, mirror it here. The build will
 * still work if they diverge but the homepage card will show stale data
 * until the category file lazy-loads.
 */
export const featuredProducts: Product[] = [
  // Dairy
  p("p19", "Amul Taaza Milk", "अमूल ताज़ा दूध", "Amul Taaza pasteurised toned milk — 3% fat, perfect for chai, coffee, and daily use", "2", 28, 30, "500 ml", 40),
  p("p22", "Amul Butter", "अमूल मक्खन", "Amul pasteurised butter — utterly butterly delicious, perfect for parathas and toast", "2", 56, 58, "100 g", 25),
  p("p23", "Bread (White)", "ब्रेड सफ़ेद", "Soft white bread loaf, freshly baked — ideal for sandwiches and breakfast toast", "2", 40, 45, "400 g", 20),
  p("p25", "Paneer (Fresh)", "पनीर", "Soft fresh paneer, made daily — high-protein, perfect for paneer butter masala and tikka", "2", 80, 90, "200 g", 15),
  p("p29", "Egg (Anda)", "अंडा", "Farm-fresh table eggs — rich in protein, white shell, ideal for omelette and bhurji", "2", 75, 84, "6 pcs", 25),
  // Fruits & Veg
  p("p1", "Tamatar (Tomato)", "टमाटर", "Hand-picked farm-fresh tomatoes, ripe and juicy — perfect for sabzi, curry, and salads", "3", 30, 40, "500 g", 50),
  p("p2", "Pyaz (Onion)", "प्याज", "Premium red onions sourced from Nashik farms — strong flavour, ideal for daily cooking", "3", 35, 45, "1 kg", 60),
  p("p3", "Aloo (Potato)", "आलू", "Farm-fresh raw potatoes, washed and graded — versatile for sabzi, fries, and curries", "3", 28, 35, "1 kg", 70),
  p("p4", "Kela (Banana)", "केला", "Naturally ripened bananas, rich in potassium — great for breakfast and post-workout snack", "3", 45, 50, "1 dozen", 30),
  p("p15", "Seb (Apple)", "सेब", "Crisp Shimla apples, naturally sweet — ideal for snacking and lunchbox", "3", 120, 150, "500 g", 20),
  p("p18", "Aam (Mango)", "आम", "Sweet seasonal desi mango — enjoy chilled or in shakes, raita, and aamras", "3", 80, 100, "500 g", 30),
  // Cold Drinks
  p("p83", "Coca-Cola", "कोका-कोला", "Coca-Cola Original Taste — chilled fizzy refreshment, the classic cola", "4", 40, 45, "750 ml", 40),
  p("p84", "Thums Up", "थम्स अप", "Thums Up — strong, fizzy cola with kick, taste the thunder", "4", 40, 45, "750 ml", 35),
  p("p86", "Maaza Mango", "माज़ा आम", "Maaza Mango — thick rich mango drink, taste of Indian summer", "4", 25, 30, "250 ml", 45),
  p("p87", "Frooti Mango", "फ्रूटी आम", "Frooti Mango Drink — ripe sweet mango taste, India's favourite tetra pack", "4", 10, 12, "200 ml", 60),
  // Snacks
  p("p67", "Lays Classic Salted", "लेज़ क्लासिक", "Lay's Classic Salted — crispy thinly-sliced potato chips, irresistible taste", "5", 20, 25, "52 g", 60),
  p("p68", "Lays Magic Masala", "लेज़ मैजिक मसाला", "Lay's India's Magic Masala — bold spicy flavour, India's most loved chip", "5", 20, 25, "52 g", 55),
  p("p70", "Haldiram Aloo Bhujia", "हल्दीराम आलू भुजिया", "Haldiram's Aloo Bhujia — crispy spiced potato sticks, perfect chai-time namkeen", "5", 50, 55, "200 g", 30),
  // Breakfast / Instant
  p("p98", "Maggi 2-Minute Noodles", "मैगी नूडल्स", "Maggi 2-Minute Noodles — masala flavour, India's iconic quick snack", "6", 14, 15, "70 g", 100),
  p("p107", "Saffola Oats", "सैफोला ओट्स", "Saffola Classic Oats — 100% whole grain, fibre-rich healthy breakfast", "6", 99, 115, "500 g", 15),
  p("p108", "Kellogg's Cornflakes", "कैलॉग्स कॉर्नफ्लेक्स", "Kellogg's Original Cornflakes — golden crunchy flakes, iron-fortified breakfast", "6", 165, 185, "475 g", 12),
  // Sweet
  p("p80", "Cadbury Dairy Milk", "कैडबरी डेयरी मिल्क", "Cadbury Dairy Milk — smooth creamy milk chocolate, India's #1 chocolate bar", "7", 40, 45, "50 g", 50),
  p("p82", "KitKat", "किटकैट", "Nestlé KitKat — crisp chocolate wafer fingers, have a break, have a KitKat", "7", 30, 35, "37.3 g", 45),
  p("p224", "Cadbury Dairy Milk Silk", "कैडबरी डेयरी मिल्क सिल्क", "Smooth creamy milk chocolate bar — signature melt-in-mouth indulgence", "7", 102, 115, "60 g", 50),
  // Bakery & Biscuits
  p("p72", "Parle-G Biscuits", "पारले-जी", "Parle-G Original Glucose Biscuits — India's favourite, energy in every bite", "8", 10, 10, "80 g", 80),
  p("p73", "Britannia Good Day", "ब्रिटानिया गुड डे", "Britannia Good Day Butter Cookies — buttery, rich, melt-in-mouth cookies", "8", 30, 30, "75 g", 45),
  p("p74", "Britannia Marie Gold", "ब्रिटानिया मारी गोल्ड", "Britannia Marie Gold — light, crispy tea-time biscuit, India's classic choice", "8", 30, 30, "250 g", 40),
  p("p236", "Britannia Bourbon Original", "ब्रिटानिया बोरबॉन", "Classic chocolate cream sandwich biscuit — iconic Indian tea-time favourite", "8", 45, 50, "150 g", 50),
  // Tea & Coffee
  p("p88", "Tata Tea Gold", "टाटा टी गोल्ड", "Tata Tea Gold — premium long-leaf tea with assam blend, full-bodied chai", "9", 165, 180, "250 g", 20),
  p("p90", "Nescafe Classic Coffee", "नेस्कैफे क्लासिक", "Nescafé Classic — 100% pure instant coffee, rich aroma in every cup", "9", 195, 220, "100 g", 18),
  p("p92", "Bournvita", "बोर्नविटा", "Cadbury Bournvita — chocolate health drink with vitamins and minerals", "9", 210, 240, "500 g", 20),
  // Atta / Rice / Dal
  p("p31", "Aashirvaad Atta", "आशीर्वाद आटा", "Aashirvaad Shudh Chakki Atta — 100% whole wheat, stone-ground, soft rotis guaranteed", "10", 265, 310, "5 kg", 20),
  p("p33", "India Gate Basmati", "इंडिया गेट बासमती", "India Gate Super Basmati — extra-long aged grains, fluffy biryani and pulao", "10", 180, 210, "1 kg", 25),
  p("p35", "Toor Dal (Arhar)", "तूर दाल", "Premium toor dal (arhar) — unpolished split pigeon peas, the heart of dal tadka", "10", 140, 160, "1 kg", 30),
  // Masala / Oil
  p("p46", "Fortune Soyabean Oil", "फॉर्च्यून तेल", "Fortune refined soyabean oil — light and healthy, ideal for everyday cooking", "11", 155, 175, "1 L", 25),
  p("p48", "Amul Ghee", "अमूल घी", "Amul pure cow ghee — granular, aromatic, made from rich Indian milk", "11", 290, 320, "500 ml", 15),
  p("p52", "MDH Garam Masala", "एमडीएच गरम मसाला", "MDH Garam Masala — authentic blend of 11 spices, signature aroma for curries", "11", 72, 80, "100 g", 35),
  p("p65", "Namak (Salt)", "नमक", "Tata Salt iodized — India's most trusted, fine free-flowing salt", "11", 24, 28, "1 kg", 60),
  // Sauces
  p("p171", "Kissan Mixed Fruit Jam", "किसान मिक्स्ड फ्रूट जैम", "India's favourite fruit jam with 8 real fruits — mango, apple, pineapple and more", "12", 181, 195, "490 g", 40),
  p("p173", "Kissan Fresh Tomato Ketchup", "किसान टमेटो केचअप", "Made from real tomatoes, no artificial colours — family-size squeezy bottle", "12", 106, 120, "950 g", 40),
  // Personal Care
  p("p110", "Colgate MaxFresh", "कोलगेट मैक्सफ्रेश", "Colgate MaxFresh — cooling crystals for long-lasting fresh breath", "19", 85, 95, "150 g", 30),
  p("p112", "Dove Soap", "डव साबुन", "Dove Cream Beauty Bar — 1/4 moisturising cream, gentle on sensitive skin", "19", 48, 52, "100 g", 35),
  p("p118", "Parachute Coconut Oil", "पैराशूट नारियल तेल", "Parachute 100% Pure Coconut Oil — natural hair nourishment, skin care", "19", 105, 115, "200 ml", 25),
  // Cleaning
  p("p127", "Surf Excel Detergent", "सर्फ एक्सेल", "Surf Excel Easy Wash Detergent — removes tough stains in fewer mugs of water", "17", 120, 135, "1 kg", 20),
  p("p129", "Harpic Toilet Cleaner", "हार्पिक", "Harpic Power Plus Toilet Cleaner — 10X stronger, kills 99.9% germs", "17", 85, 95, "500 ml", 20),
  // Baby Care
  p("p138", "Pampers Diapers (S)", "पैम्पर्स डायपर", "Pampers Baby Dry Pants (S) — up to 12-hour overnight dryness, soft on skin", "15", 399, 450, "22 pcs", 12),
  p("p141", "Johnson's Baby Soap", "जॉनसन बेबी साबुन", "Johnson's Baby Soap — gentle cleansing, no more tears formula", "15", 55, 62, "100 g", 20),
  // Pharma
  p("p268", "Crocin 650 Advance", "क्रोसिन 650 एडवांस", "Paracetamol 650mg for fast fever and pain relief — GSK trusted strip", "16", 42, 48, "15 tabs", 50),
  p("p269", "Dolo 650", "डोलो 650", "Paracetamol 650mg tablet for fever and body pain — doctor-preferred brand", "16", 32, 38, "15 tabs", 60),
  p("p284", "Dabur Chyawanprash", "डाबर च्यवनप्राश", "Ayurvedic immunity-booster with 40+ herbs — daily wellness for whole family", "16", 285, 320, "1 kg", 35),
  // Pet
  p("p207", "Pedigree Adult Chicken & Veg", "पेडिग्री एडल्ट डॉग फूड", "Complete balanced nutrition for adult dogs — real chicken and vegetables", "20", 430, 470, "1.2 kg", 30),
  p("p211", "Whiskas Adult Ocean Fish", "व्हिस्कस ओशन फिश कैट फूड", "Adult cat dry food with ocean fish — taurine for heart and vision health", "20", 415, 460, "1.1 kg", 25),
];
