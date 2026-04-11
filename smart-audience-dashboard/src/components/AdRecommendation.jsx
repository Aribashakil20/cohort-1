/**
 * AdRecommendation.jsx — Shows the current recommended ad category
 *
 * Purpose:
 *   This is the "output" of the whole system — based on who is watching
 *   right now (age + gender), the AI recommends what type of ad to show.
 *   This card displays that recommendation prominently.
 *
 * Examples of what it might show:
 *   "Gaming / Sports"      → mostly young males detected
 *   "Healthcare / Insurance" → mostly seniors detected
 *   "Fashion / Beauty"     → mostly young females detected
 *
 * Props:
 *   adCategory    — string: the recommended ad type (from dominant_ad field)
 *   ageGroup      — string: the dominant age group (e.g. "adult", "youth")
 */

// Map ad categories to a background gradient color so the card is visually distinct
const CATEGORY_COLORS = {
  "Gaming / Sports":         "from-blue-900 to-blue-700",
  "Fashion / Beauty":        "from-pink-900 to-pink-700",
  "Toys / Boys Games":       "from-yellow-900 to-yellow-700",
  "Toys / Girls Games":      "from-orange-900 to-orange-700",
  "Cars / Finance":          "from-slate-700 to-slate-600",
  "Lifestyle / Travel":      "from-teal-900 to-teal-700",
  "Health / Home Appliances":"from-green-900 to-green-700",
  "Skincare / Wellness":     "from-purple-900 to-purple-700",
  "Healthcare / Insurance":  "from-red-900 to-red-800",
  "General Ad":              "from-slate-700 to-slate-600",
  "No audience":             "from-slate-800 to-slate-700",
};

export default function AdRecommendation({ adCategory, ageGroup }) {
  const gradient = CATEGORY_COLORS[adCategory] ?? "from-slate-700 to-slate-600";

  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-xl p-5 border border-slate-600`}>
      <div className="text-slate-300 text-sm font-medium mb-2">Recommended Ad</div>
      <div className="text-white text-2xl font-bold mb-1">{adCategory ?? "—"}</div>
      <div className="text-slate-400 text-xs">
        Dominant audience: <span className="text-slate-200 capitalize">{ageGroup ?? "—"}</span>
      </div>
    </div>
  );
}
