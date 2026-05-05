/**
 * adLibrary.js — Full brand ad library with demographic targeting + time slots
 */

// ── Core demographic ad library ───────────────────────────────────────────────
export const AD_LIBRARY = {

  // ── Children ─────────────────────────────────────────────────────────────────
  "child-M": {
    brand: "LEGO", headline: "Build Your World", category: "Toys",
    icon: "🧱", color: "#eab308", target: "Boys under 12",
    reachDesc: "young boys", description: "Creative building sets that grow with every imagination",
  },
  "child-F": {
    brand: "Barbie", headline: "You Can Be Anything", category: "Toys",
    icon: "🎀", color: "#f472b6", target: "Girls under 12",
    reachDesc: "young girls", description: "Empowering play for every dream and ambition",
  },

  // ── Youth Male ───────────────────────────────────────────────────────────────
  "youth-M": {
    brand: "PlayStation 5", headline: "Play Has No Limits", category: "Gaming",
    icon: "🎮", color: "#3b82f6", target: "Men 18–24",
    reachDesc: "young male viewers", description: "Next-gen gaming — the most powerful PlayStation ever made",
  },
  "youth-M-2": {
    brand: "Nike", headline: "Just Do It", category: "Sports",
    icon: "👟", color: "#f97316", target: "Young Men 18–28",
    reachDesc: "young male viewers", description: "Push your limits — performance gear for every athlete",
  },
  "youth-M-3": {
    brand: "boAt", headline: "Plug Into Nirvana", category: "Audio Tech",
    icon: "🎧", color: "#6366f1", target: "Young Men 18–28",
    reachDesc: "young male viewers", description: "Premium audio gear designed for India's youth",
  },
  "youth-M-4": {
    brand: "iPhone", headline: "Think Different", category: "Smartphones",
    icon: "📱", color: "#6b7280", target: "Young Adults 20–30",
    reachDesc: "young male viewers", description: "The most advanced iPhone ever — power in your pocket",
  },
  "youth-M-5": {
    brand: "Max Protein", headline: "Fuel Your Gains", category: "Fitness",
    icon: "💪", color: "#84cc16", target: "Young Men 18–30",
    reachDesc: "young male viewers", description: "High-performance protein supplements for serious athletes",
  },
  "youth-M-6": {
    brand: "Levi's", headline: "Live in Levi's", category: "Fashion",
    icon: "👖", color: "#1d4ed8", target: "Young Men 18–28",
    reachDesc: "young male viewers", description: "Original denim — authentic style for every generation",
  },

  // ── Youth Female ─────────────────────────────────────────────────────────────
  "youth-F": {
    brand: "Tanishq", headline: "Pure Gold. Pure Love.", category: "Jewellery",
    icon: "💍", color: "#f59e0b", target: "Women 18–24",
    reachDesc: "young female viewers", description: "India's most trusted fine jewellery for every occasion",
  },
  "youth-F-2": {
    brand: "Nykaa", headline: "Beauty Unlimited", category: "Beauty",
    icon: "💅", color: "#ec4899", target: "Young Women 18–28",
    reachDesc: "young female viewers", description: "India's #1 beauty destination — makeup, skincare & more",
  },
  "youth-F-3": {
    brand: "Myntra", headline: "Fashion Forward", category: "Fashion",
    icon: "👗", color: "#8b5cf6", target: "Young Women 18–30",
    reachDesc: "young female viewers", description: "Trending styles from 5000+ brands — delivered fast",
  },
  "youth-F-4": {
    brand: "Plum", headline: "Good Looks. Good Vibes.", category: "Skincare",
    icon: "🫐", color: "#a855f7", target: "Young Women 18–28",
    reachDesc: "young female viewers", description: "100% vegan beauty that's good for you and the planet",
  },
  "youth-F-5": {
    brand: "Magnum", headline: "Pleasure Is Always Right", category: "Ice Cream",
    icon: "🍫", color: "#c2973e", target: "Young Women 18–30",
    reachDesc: "young female viewers", description: "Premium Belgian chocolate ice cream — indulge yourself",
  },

  // ── Adult Male ───────────────────────────────────────────────────────────────
  "adult-M": {
    brand: "Maruti Suzuki", headline: "Drive the Change", category: "Automobiles",
    icon: "🚗", color: "#10b981", target: "Men 25–40",
    reachDesc: "adult male viewers", description: "India's most loved cars — performance meets value",
  },
  "adult-M-2": {
    brand: "iPhone", headline: "Think Different", category: "Smartphones",
    icon: "📱", color: "#6b7280", target: "Men 25–40",
    reachDesc: "adult male viewers", description: "The most advanced iPhone ever — power in your pocket",
  },
  "adult-M-3": {
    brand: "Amazon", headline: "Deals That Deliver", category: "Shopping",
    icon: "📦", color: "#f97316", target: "Adults 25–45",
    reachDesc: "adult male viewers", description: "India's biggest online store — fast, reliable, trusted",
  },
  "adult-M-4": {
    brand: "Nike", headline: "Just Do It", category: "Sports",
    icon: "👟", color: "#f97316", target: "Men 25–40",
    reachDesc: "adult male viewers", description: "Push your limits — performance gear for every athlete",
  },

  // ── Adult Female ─────────────────────────────────────────────────────────────
  "adult-F": {
    brand: "MakeMyTrip", headline: "Dream. Discover. Fly.", category: "Travel",
    icon: "✈️", color: "#8b5cf6", target: "Women 25–40",
    reachDesc: "adult female viewers", description: "Best deals on flights, hotels, and holiday packages",
  },
  "adult-F-2": {
    brand: "Goibibo", headline: "Go Bold. Go Far.", category: "Travel",
    icon: "🌍", color: "#06b6d4", target: "Women 25–40",
    reachDesc: "adult female viewers", description: "Discover incredible travel deals across India and beyond",
  },
  "adult-F-3": {
    brand: "Myntra", headline: "Fashion Forward", category: "Fashion",
    icon: "👗", color: "#8b5cf6", target: "Women 25–40",
    reachDesc: "adult female viewers", description: "Trending styles from 5000+ brands — delivered fast",
  },
  "adult-F-4": {
    brand: "Nykaa", headline: "Beauty Unlimited", category: "Beauty",
    icon: "💅", color: "#ec4899", target: "Women 25–40",
    reachDesc: "adult female viewers", description: "India's #1 beauty destination — makeup, skincare & more",
  },
  "adult-F-5": {
    brand: "Magnum", headline: "Pleasure Is Always Right", category: "Ice Cream",
    icon: "🍫", color: "#c2973e", target: "Women 25–40",
    reachDesc: "adult female viewers", description: "Premium Belgian chocolate ice cream — indulge yourself",
  },

  // ── Middle Aged Male ─────────────────────────────────────────────────────────
  "middle_aged-M": {
    brand: "LG Electronics", headline: "Life's Good", category: "Home Appliances",
    icon: "🏠", color: "#06b6d4", target: "Men 40–60",
    reachDesc: "middle-aged male viewers", description: "Smart home appliances built for modern family living",
  },
  "middle_aged-M-2": {
    brand: "Amazon", headline: "Deals That Deliver", category: "Shopping",
    icon: "📦", color: "#f97316", target: "Men 40–55",
    reachDesc: "middle-aged male viewers", description: "India's biggest online store — fast, reliable, trusted",
  },
  "middle_aged-M-3": {
    brand: "iPhone", headline: "Think Different", category: "Smartphones",
    icon: "📱", color: "#6b7280", target: "Men 40–55",
    reachDesc: "middle-aged male viewers", description: "The most advanced iPhone ever — power in your pocket",
  },

  // ── Middle Aged Female ───────────────────────────────────────────────────────
  "middle_aged-F": {
    brand: "Lakme", headline: "Reinvent Your Beauty", category: "Skincare",
    icon: "💄", color: "#ec4899", target: "Women 40–60",
    reachDesc: "middle-aged female viewers", description: "India's #1 beauty brand — skincare, makeup, and more",
  },
  "middle_aged-F-2": {
    brand: "Dabur", headline: "Celebrate Life Naturally", category: "Health",
    icon: "🌱", color: "#16a34a", target: "Women 40–60",
    reachDesc: "middle-aged female viewers", description: "India's most trusted natural health and wellness brand",
  },
  "middle_aged-F-3": {
    brand: "Amazon", headline: "Deals That Deliver", category: "Shopping",
    icon: "📦", color: "#f97316", target: "Women 40–55",
    reachDesc: "middle-aged female viewers", description: "India's biggest online store — fast, reliable, trusted",
  },

  // ── Senior ───────────────────────────────────────────────────────────────────
  "senior-M": {
    brand: "Apollo Hospitals", headline: "Your Health. Our Priority.", category: "Healthcare",
    icon: "🏥", color: "#14b8a6", target: "Men 60+",
    reachDesc: "senior male viewers", description: "World-class healthcare with compassion at every step",
  },
  "senior-M-2": {
    brand: "Dabur", headline: "Celebrate Life Naturally", category: "Health",
    icon: "🌱", color: "#16a34a", target: "Senior Men 55+",
    reachDesc: "senior male viewers", description: "India's most trusted natural health and wellness brand",
  },
  "senior-F": {
    brand: "LIC Insurance", headline: "Zindagi ke saath bhi. Zindagi ke baad bhi.", category: "Insurance",
    icon: "🛡️", color: "#f97316", target: "Women 60+",
    reachDesc: "senior female viewers", description: "India's most trusted life insurance for your family's future",
  },
  "senior-F-2": {
    brand: "Dabur", headline: "Celebrate Life Naturally", category: "Health",
    icon: "🌱", color: "#16a34a", target: "Senior Women 55+",
    reachDesc: "senior female viewers", description: "India's most trusted natural health and wellness brand",
  },

  // ── Mixed / General ──────────────────────────────────────────────────────────
  "mixed": {
    brand: "Coca-Cola", headline: "Taste the Feeling", category: "Beverages",
    icon: "🥤", color: "#ef4444", target: "General audience",
    reachDesc: "mixed audience viewers", description: "The world's favourite refreshment — for everyone, everywhere",
  },
  "mixed-2": {
    brand: "Lay's", headline: "No One Can Eat Just One", category: "Snacks",
    icon: "🥔", color: "#eab308", target: "General audience",
    reachDesc: "mixed audience viewers", description: "India's favourite crispy snack — in 10+ irresistible flavours",
  },
  "mixed-3": {
    brand: "Dairy Milk", headline: "Kuch Meetha Ho Jaaye", category: "Chocolate",
    icon: "🍫", color: "#7c3aed", target: "All ages",
    reachDesc: "mixed audience viewers", description: "India's most loved chocolate — share a sweet moment",
  },
  "mixed-4": {
    brand: "Amazon", headline: "Deals That Deliver", category: "Shopping",
    icon: "📦", color: "#f97316", target: "General audience",
    reachDesc: "mixed audience viewers", description: "India's biggest online store — fast, reliable, trusted",
  },

  // ── Wellness / Mood override ─────────────────────────────────────────────────
  "wellness": {
    brand: "Himalaya Wellness", headline: "Nature. Science. Health.", category: "Wellness",
    icon: "🌿", color: "#22c55e", target: "All audiences",
    reachDesc: "viewers (wellness override)", description: "Natural wellness products to restore calm and well-being",
  },
  "wellness-2": {
    brand: "Dabur", headline: "Celebrate Life Naturally", category: "Health",
    icon: "🌱", color: "#16a34a", target: "All audiences",
    reachDesc: "viewers (wellness override)", description: "India's most trusted natural health and wellness brand",
  },
};

// ── Time-of-day ad slots with rotation pools ──────────────────────────────────
export const TIME_SLOTS = {
  earlyMorning: {
    hours: [5, 6, 7, 8, 9],
    pool: [
      { brand: "Nescafé",   headline: "Good Morning Starts Here",  category: "Coffee",    icon: "☕", color: "#dc2626", imgKey: "nescafe",    description: "Rich aroma, smooth taste — the perfect morning brew" },
      { brand: "Kellogg's", headline: "Start Your Day Right",       category: "Breakfast", icon: "🥣", color: "#f59e0b", imgKey: "kelloggs",   description: "Nutritious breakfast cereals to fuel your morning" },
      { brand: "Maggi",     headline: "2 Minute Magic",             category: "Food",      icon: "🍜", color: "#ef4444", imgKey: "maggi",      description: "Quick, delicious Maggi — ready in just 2 minutes" },
      { brand: "Dabur",     headline: "Celebrate Life Naturally",   category: "Health",    icon: "🌱", color: "#16a34a", imgKey: "dabur",      description: "Start your day with natural goodness" },
    ],
  },
  lunch: {
    hours: [10, 11, 12, 13, 14],
    pool: [
      { brand: "Domino's",    headline: "Hungry Kya?",           category: "Pizza",        icon: "🍕", color: "#1d4ed8", imgKey: "dominos",    description: "Hot, cheesy pizzas delivered in 30 minutes" },
      { brand: "KFC",         headline: "It's Finger Lickin' Good", category: "Fast Food", icon: "🍗", color: "#ef4444", imgKey: "kfc",        description: "Crispy fried chicken — always fresh, always flavourful" },
      { brand: "Subway",      headline: "Eat Fresh",              category: "Fast Food",    icon: "🥖", color: "#16a34a", imgKey: "subway",     description: "Fresh ingredients, your way — customise every bite" },
      { brand: "Burger King", headline: "Be Your Way",            category: "Fast Food",    icon: "🍔", color: "#f97316", imgKey: "burgerking", description: "Flame-grilled perfection — have it your way" },
      { brand: "Blinkit",     headline: "Delivery in 10 Minutes", category: "Grocery",     icon: "⚡", color: "#eab308", imgKey: "blinkit",    description: "Groceries and essentials delivered in minutes" },
    ],
  },
  afternoon: {
    hours: [15, 16, 17],
    pool: [
      { brand: "Lay's",     headline: "No One Can Eat Just One",   category: "Snacks",       icon: "🥔", color: "#eab308", imgKey: "lays",      description: "Crispy, flavourful chips — the perfect afternoon snack" },
      { brand: "Magnum",    headline: "Pleasure Is Always Right",  category: "Ice Cream",    icon: "🍫", color: "#c2973e", imgKey: "magnum",    description: "Belgian chocolate ice cream — treat yourself" },
      { brand: "Amazon",    headline: "Great Indian Sale",         category: "Shopping",     icon: "📦", color: "#f97316", imgKey: "amazon",    description: "Shop the biggest deals — millions of products" },
      { brand: "Myntra",    headline: "Fashion Forward",           category: "Fashion",      icon: "👗", color: "#8b5cf6", imgKey: "myntra",    description: "Trending styles from top brands — delivered fast" },
      { brand: "Blinkit",   headline: "Delivery in 10 Minutes",   category: "Grocery",      icon: "⚡", color: "#eab308", imgKey: "blinkit",   description: "Snacks and essentials at your door in minutes" },
      { brand: "Dairy Milk", headline: "Kuch Meetha Ho Jaaye",    category: "Chocolate",    icon: "🍫", color: "#7c3aed", imgKey: "diarymilk", description: "Share a sweet moment with Cadbury Dairy Milk" },
    ],
  },
  evening: {
    hours: [18, 19, 20],
    pool: [
      { brand: "Netflix",    headline: "Watch What You Love",    category: "Entertainment", icon: "🎬", color: "#dc2626", imgKey: "netflix",    description: "Stream the latest movies, shows & originals" },
      { brand: "Amazon",     headline: "Prime Video — Watch Now", category: "Entertainment", icon: "📺", color: "#f97316", imgKey: "amazon",    description: "Unlimited movies, TV shows, and Amazon Originals" },
      { brand: "Goibibo",    headline: "Go Bold. Go Far.",        category: "Travel",        icon: "🌍", color: "#06b6d4", imgKey: "goibibo",   description: "Plan your weekend getaway with unbeatable deals" },
      { brand: "MakeMyTrip", headline: "Dream. Discover. Fly.",  category: "Travel",        icon: "✈️", color: "#8b5cf6", imgKey: "makemytrip", description: "Best hotel and flight deals for your next trip" },
      { brand: "Magnum",     headline: "Pleasure Is Always Right", category: "Ice Cream",   icon: "🍫", color: "#c2973e", imgKey: "magnum",    description: "End your day with a moment of pure indulgence" },
    ],
  },
  night: {
    hours: [21, 22, 23],
    pool: [
      { brand: "Zomato",    headline: "Late Night Cravings",      category: "Food Delivery", icon: "🌙", color: "#ef4444", imgKey: "zomato",     description: "Late night delivery — open till 2 AM" },
      { brand: "Domino's",  headline: "Pizza After Dark",         category: "Pizza",         icon: "🍕", color: "#1d4ed8", imgKey: "dominos",    description: "Hot cheesy pizza delivered to your door tonight" },
      { brand: "KFC",       headline: "It's Finger Lickin' Good", category: "Fast Food",     icon: "🍗", color: "#ef4444", imgKey: "kfc",        description: "Late night fried chicken cravings sorted" },
      { brand: "Maggi",     headline: "2 Minute Magic",           category: "Food",          icon: "🍜", color: "#ef4444", imgKey: "maggi",      description: "Quick fix for late night hunger — Maggi is always ready" },
      { brand: "Netflix",   headline: "One More Episode",         category: "Entertainment", icon: "🎬", color: "#dc2626", imgKey: "netflix",    description: "Stay up late with the best shows on Netflix" },
    ],
  },
  lateNight: {
    hours: [0, 1, 2, 3, 4],
    pool: [
      { brand: "Spotify",  headline: "Music Never Sleeps",       category: "Music",         icon: "🎵", color: "#1db954", imgKey: "spotify",    description: "Stream 100M+ songs and podcasts all night long" },
      { brand: "Netflix",  headline: "Can't Sleep? Watch This.", category: "Entertainment", icon: "🎬", color: "#dc2626", imgKey: "netflix",    description: "The best late night movies and series streaming now" },
      { brand: "Maggi",    headline: "2 Minute Magic",           category: "Food",          icon: "🍜", color: "#ef4444", imgKey: "maggi",      description: "Late night hunger? Maggi to the rescue in 2 minutes" },
      { brand: "Zomato",   headline: "Night Owl Delivery",       category: "Food Delivery", icon: "🌙", color: "#ef4444", imgKey: "zomato",     description: "Because hunger doesn't follow a schedule" },
    ],
  },
};

// Current time slot — returns the slot object for the current hour
export function getCurrentSlot(hour = new Date().getHours()) {
  for (const slot of Object.values(TIME_SLOTS)) {
    if (slot.hours.includes(hour)) return slot;
  }
  return null;
}

// Returns single time ad (rotates through pool based on minute so it changes)
export function resolveTimeAd(hour = new Date().getHours()) {
  const slot = getCurrentSlot(hour);
  if (!slot) return null;
  const min = new Date().getMinutes();
  const idx = Math.floor(min / (60 / slot.pool.length)) % slot.pool.length;
  return slot.pool[idx];
}

// Returns full pool for current time slot (for rotation in UI)
export function resolveTimeAdPool(hour = new Date().getHours()) {
  const slot = getCurrentSlot(hour);
  return slot ? slot.pool : [];
}

// ── Demographic rotation pools ────────────────────────────────────────────────
const MIXED_AGE_FALLBACK = {
  child: "child-M", youth: "youth-M", adult: "adult-M",
  middle_aged: "middle_aged-M", senior: "senior-M",
};

const ROTATION_POOLS = {
  "child-M":       ["child-M",       "mixed-2",        "mixed-3",        "mixed"        ],
  "child-F":       ["child-F",       "mixed-3",        "mixed-2",        "mixed"        ],
  "youth-M":       ["youth-M",       "youth-M-2",      "youth-M-3",      "youth-M-4",   "youth-M-5", "youth-M-6"],
  "youth-F":       ["youth-F",       "youth-F-2",      "youth-F-3",      "youth-F-4",   "youth-F-5" ],
  "adult-M":       ["adult-M",       "adult-M-2",      "adult-M-3",      "adult-M-4"    ],
  "adult-F":       ["adult-F",       "adult-F-2",      "adult-F-3",      "adult-F-4",   "adult-F-5" ],
  "middle_aged-M": ["middle_aged-M", "middle_aged-M-2","middle_aged-M-3","senior-M-2"   ],
  "middle_aged-F": ["middle_aged-F", "middle_aged-F-2","middle_aged-F-3","adult-F"      ],
  "senior-M":      ["senior-M",      "senior-M-2",     "wellness",       "mixed"        ],
  "senior-F":      ["senior-F",      "senior-F-2",     "wellness",       "wellness-2"   ],
  "mixed":         ["mixed",         "mixed-2",        "mixed-3",        "mixed-4"      ],
  "wellness":      ["wellness",      "wellness-2",     "mixed",          "mixed-2"      ],
};

export function resolveAdPool(crowdGender, dominantAge, ageConfident, dominantExpr) {
  const isNegative = ["angry", "disgusted", "fearful"].includes(dominantExpr);
  if (isNegative) {
    return ["wellness", "wellness-2", "mixed", "mixed-2"].map(k => AD_LIBRARY[k]).filter(Boolean);
  }

  let primaryKey;
  if (crowdGender === "mixed" && !ageConfident) {
    primaryKey = "mixed";
  } else if (crowdGender === "mixed") {
    primaryKey = MIXED_AGE_FALLBACK[dominantAge] || "mixed";
  } else if (!ageConfident) {
    primaryKey = crowdGender === "female" ? "adult-F" : "adult-M";
  } else {
    primaryKey = `${dominantAge}-${crowdGender === "male" ? "M" : "F"}`;
  }

  const pool = ROTATION_POOLS[primaryKey] ?? [primaryKey, "mixed"];
  return pool.map(k => AD_LIBRARY[k]).filter(Boolean);
}

export function resolveAd(crowdGender, dominantAge, ageConfident, dominantExpr) {
  const pool = resolveAdPool(crowdGender, dominantAge, ageConfident, dominantExpr);
  const isNegative = ["angry", "disgusted", "fearful"].includes(dominantExpr);
  return { ad: pool[0] ?? AD_LIBRARY["mixed"], moodOverride: isNegative };
}
