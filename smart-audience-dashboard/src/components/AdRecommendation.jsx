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

// Map ad categories to gradient + icon
const CATEGORY_CONFIG = {
  "Gaming / Sports":          { gradient: "from-blue-900 to-blue-700",    icon: "🎮" },
  "Fashion / Beauty":         { gradient: "from-pink-900 to-pink-700",    icon: "👗" },
  "Toys / Boys Games":        { gradient: "from-yellow-900 to-yellow-700",icon: "🚀" },
  "Toys / Girls Games":       { gradient: "from-orange-900 to-orange-700",icon: "🎀" },
  "Cars / Finance":           { gradient: "from-slate-700 to-slate-600",  icon: "🚗" },
  "Lifestyle / Travel":       { gradient: "from-teal-900 to-teal-700",    icon: "✈️" },
  "Health / Home Appliances": { gradient: "from-green-900 to-green-700",  icon: "🏠" },
  "Skincare / Wellness":      { gradient: "from-purple-900 to-purple-700",icon: "💆" },
  "Healthcare / Insurance":   { gradient: "from-red-900 to-red-800",      icon: "🏥" },
  "General Ad":               { gradient: "from-slate-700 to-slate-600",  icon: "📢" },
  "No audience":              { gradient: "from-slate-800 to-slate-700",  icon: "📺" },
};

export default function AdRecommendation({ adCategory, ageGroup, gender }) {
  const config   = CATEGORY_CONFIG[adCategory] ?? CATEGORY_CONFIG["General Ad"];
  const gradient = config.gradient;
  const icon     = config.icon;

  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-xl p-5 border border-slate-600`}>
      <div className="text-slate-300 text-sm font-medium mb-2">Recommended Ad</div>
      {/* Icon + category name */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-3xl">{icon}</span>
        <div className="text-white text-xl font-bold">{adCategory ?? "—"}</div>
      </div>
      {/* Why this ad — shows the audience profile that triggered it */}
      <div className="text-slate-400 text-xs">
        Audience:{" "}
        <span className="text-slate-200 capitalize">{ageGroup ?? "—"}</span>
        {gender && gender !== "—" && (
          <span className="text-slate-300"> · {gender}</span>
        )}
      </div>
    </div>
  );
}
