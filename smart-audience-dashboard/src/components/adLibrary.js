/**
 * adLibrary.js — Real brand ad definitions mapped to audience segments
 *
 * Key format: "<ageGroup>-<M|F>" for targeted ads
 * Special keys: "mixed" (no dominant group), "wellness" (mood override)
 *
 * Each ad has:
 *   brand      — brand name shown prominently
 *   headline   — the actual ad tagline
 *   category   — short category label
 *   icon       — emoji for quick visual
 *   color      — accent color (hex)
 *   target     — human-readable target description
 *   reachDesc  — used in reach summary ("reached 24 young females")
 *   description— one-line brief about why this ad fits this audience
 */

export const AD_LIBRARY = {
  // ── Children ────────────────────────────────────────────────────────────────
  "child-M": {
    brand: "LEGO",
    headline: "Build Your World",
    category: "Toys",
    icon: "🧱",
    color: "#eab308",
    target: "Boys under 12",
    reachDesc: "young boys",
    description: "Creative building sets that grow with every imagination",
  },
  "child-F": {
    brand: "Barbie",
    headline: "You Can Be Anything",
    category: "Toys",
    icon: "🎀",
    color: "#f472b6",
    target: "Girls under 12",
    reachDesc: "young girls",
    description: "Empowering play for every dream and ambition",
  },

  // ── Youth ───────────────────────────────────────────────────────────────────
  "youth-M": {
    brand: "PlayStation 5",
    headline: "Play Has No Limits",
    category: "Gaming",
    icon: "🎮",
    color: "#3b82f6",
    target: "Men 18–24",
    reachDesc: "young male viewers",
    description: "Next-gen gaming — the most powerful PlayStation ever made",
  },
  "youth-F": {
    brand: "Tanishq",
    headline: "Pure Gold. Pure Love.",
    category: "Jewellery",
    icon: "💍",
    color: "#f59e0b",
    target: "Women 18–24",
    reachDesc: "young female viewers",
    description: "India's most trusted fine jewellery for every occasion",
  },

  // ── Adult ───────────────────────────────────────────────────────────────────
  "adult-M": {
    brand: "Maruti Suzuki",
    headline: "Drive the Change",
    category: "Automobiles",
    icon: "🚗",
    color: "#10b981",
    target: "Men 25–40",
    reachDesc: "adult male viewers",
    description: "India's most loved cars — performance meets value",
  },
  "adult-F": {
    brand: "MakeMyTrip",
    headline: "Dream. Discover. Fly.",
    category: "Travel",
    icon: "✈️",
    color: "#8b5cf6",
    target: "Women 25–40",
    reachDesc: "adult female viewers",
    description: "Best deals on flights, hotels, and holiday packages",
  },

  // ── Middle aged ─────────────────────────────────────────────────────────────
  "middle_aged-M": {
    brand: "LG Electronics",
    headline: "Life's Good",
    category: "Home Appliances",
    icon: "🏠",
    color: "#06b6d4",
    target: "Men 40–60",
    reachDesc: "middle-aged male viewers",
    description: "Smart home appliances built for modern family living",
  },
  "middle_aged-F": {
    brand: "Lakme",
    headline: "Reinvent Your Beauty",
    category: "Skincare",
    icon: "💄",
    color: "#ec4899",
    target: "Women 40–60",
    reachDesc: "middle-aged female viewers",
    description: "India's #1 beauty brand — skincare, makeup, and more",
  },

  // ── Senior ──────────────────────────────────────────────────────────────────
  "senior-M": {
    brand: "Apollo Hospitals",
    headline: "Your Health. Our Priority.",
    category: "Healthcare",
    icon: "🏥",
    color: "#14b8a6",
    target: "Men 60+",
    reachDesc: "senior male viewers",
    description: "World-class healthcare with compassion at every step",
  },
  "senior-F": {
    brand: "LIC Insurance",
    headline: "Zindagi ke saath bhi. Zindagi ke baad bhi.",
    category: "Insurance",
    icon: "🛡️",
    color: "#f97316",
    target: "Women 60+",
    reachDesc: "senior female viewers",
    description: "India's most trusted life insurance for your family's future",
  },

  // ── Mixed / General ─────────────────────────────────────────────────────────
  "mixed": {
    brand: "Coca-Cola",
    headline: "Taste the Feeling",
    category: "Beverages",
    icon: "🥤",
    color: "#ef4444",
    target: "General audience",
    reachDesc: "mixed audience viewers",
    description: "The world's favourite refreshment — for everyone, everywhere",
  },

  // ── Mood override (negative emotion) ────────────────────────────────────────
  "wellness": {
    brand: "Himalaya Wellness",
    headline: "Nature. Science. Health.",
    category: "Wellness",
    icon: "🌿",
    color: "#22c55e",
    target: "All audiences",
    reachDesc: "viewers (wellness override)",
    description: "Natural wellness products to restore calm and well-being",
  },
};

// ── Resolve the right ad for a given crowd ────────────────────────────────────
const GENDER_THRESHOLD = 0.60;
const AGE_THRESHOLD    = 0.60;

const MIXED_AGE_FALLBACK = {
  child: "child-M", youth: "youth-M", adult: "adult-M",
  middle_aged: "middle_aged-M", senior: "senior-M",
};

export function resolveAd(crowdGender, dominantAge, ageConfident, dominantExpr) {
  const isNegative = ["angry", "disgusted", "fearful"].includes(dominantExpr);
  if (isNegative) return { key: "wellness", ad: AD_LIBRARY["wellness"], moodOverride: true };

  let key;
  if (crowdGender === "mixed" && !ageConfident) {
    key = "mixed";
  } else if (crowdGender === "mixed") {
    key = MIXED_AGE_FALLBACK[dominantAge] || "mixed";
  } else if (!ageConfident) {
    key = crowdGender === "female" ? "adult-F" : "adult-M";
  } else {
    key = `${dominantAge}-${crowdGender === "male" ? "M" : "F"}`;
  }

  return { key, ad: AD_LIBRARY[key] || AD_LIBRARY["mixed"], moodOverride: false };
}
