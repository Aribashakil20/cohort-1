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

const EMOTION_EMOJI = {
  happiness: "😊", surprise: "😮", neutral: "😐",
  sadness: "😢", anger: "😠", disgust: "🤢", fear: "😨", contempt: "😒",
};

const NEGATIVE_EMOTIONS = new Set(["anger", "disgust", "contempt"]);

export default function AdRecommendation({ adCategory, ageGroup, gender, emotion, qualityScore, crowdGender, ageConfident }) {
  const config   = CATEGORY_CONFIG[adCategory] ?? CATEGORY_CONFIG["General Ad"];
  const gradient = config.gradient;
  const icon     = config.icon;

  const emotionEmoji  = EMOTION_EMOJI[emotion] ?? "😐";
  const isOverridden  = emotion && NEGATIVE_EMOTIONS.has(emotion);
  const isMixedGender = crowdGender === "mixed";
  const qualPct       = qualityScore ?? null;

  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-xl p-5 border border-slate-600`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-slate-300 text-sm font-medium">Recommended Ad</div>
        <div className="flex gap-1 flex-wrap justify-end">
          {isOverridden && (
            <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">
              Mood override
            </span>
          )}
          {isMixedGender && (
            <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full">
              Mixed gender
            </span>
          )}
          {!ageConfident && (
            <span className="text-xs bg-slate-500/20 text-slate-300 border border-slate-500/30 px-2 py-0.5 rounded-full">
              Mixed age
            </span>
          )}
        </div>
      </div>

      {/* Icon + category name */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-3xl">{icon}</span>
        <div className="text-white text-xl font-bold leading-tight">{adCategory ?? "—"}</div>
      </div>

      {/* Audience profile */}
      <div className="text-slate-400 text-xs mb-2">
        Audience:{" "}
        <span className="text-slate-200 capitalize">{ageGroup ?? "—"}</span>
        {gender && gender !== "—" && (
          <span className="text-slate-300"> · {gender}</span>
        )}
        {emotion && (
          <span className="text-slate-300"> · {emotionEmoji} {emotion}</span>
        )}
      </div>

      {/* Quality score bar */}
      {qualPct != null && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Quality Score</span>
            <span className={`font-bold ${qualPct >= 70 ? "text-green-300" : qualPct >= 40 ? "text-yellow-300" : "text-red-300"}`}>
              {qualPct}/100
            </span>
          </div>
          <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${qualPct}%`,
                backgroundColor: qualPct >= 70 ? "#34d399" : qualPct >= 40 ? "#fbbf24" : "#ef4444",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
