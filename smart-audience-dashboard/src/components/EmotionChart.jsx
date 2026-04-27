/**
 * EmotionChart.jsx — Live emotion breakdown of the current audience
 *
 * Shows a stacked horizontal bar with four emotion groups:
 *   😊 Happy    (happiness)
 *   😮 Surprise (surprise)
 *   😐 Neutral  (neutral)
 *   😟 Negative (anger + disgust + fear + contempt + sadness)
 *
 * Also shows the Mood Quality Score — engagement weighted by emotion.
 * A happy, engaged audience scores higher than a neutral, engaged one.
 *
 * Props:
 *   data — live or summary object with emotion_*_pct and engagement_quality fields
 *   dominant — string: dominant emotion label (e.g. "happiness")
 */

const EMOTION_CONFIG = {
  happiness: { label: "Happy",    color: "#34d399", icon: "😊" },
  surprise:  { label: "Surprised",color: "#60a5fa", icon: "😮" },
  neutral:   { label: "Neutral",  color: "#94a3b8", icon: "😐" },
  negative:  { label: "Negative", color: "#f87171", icon: "😟" },
};

const DOMINANT_EMOJI = {
  happiness: "😊",
  surprise:  "😮",
  neutral:   "😐",
  sadness:   "😢",
  anger:     "😠",
  disgust:   "🤢",
  fear:      "😨",
  contempt:  "😒",
};

function qualityColor(score) {
  if (score >= 0.7) return "text-green-400";
  if (score >= 0.4) return "text-yellow-400";
  return "text-red-400";
}

function qualityLabel(score) {
  if (score >= 0.8) return "Excellent";
  if (score >= 0.6) return "Good";
  if (score >= 0.4) return "Fair";
  if (score >= 0.2) return "Low";
  return "Very Low";
}

export default function EmotionChart({ data, dominant }) {
  if (!data) return null;

  const happy    = Math.round((data.emotion_happy_pct    ?? 0) * 100);
  const surprise = Math.round((data.emotion_surprise_pct ?? 0) * 100);
  const neutral  = Math.round((data.emotion_neutral_pct  ?? 0) * 100);
  const negative = Math.round((data.emotion_negative_pct ?? 0) * 100);
  const quality  = data.engagement_quality ?? 0;
  const qualityPct = Math.round(quality * 100);

  const segments = [
    { key: "happiness", pct: happy,    ...EMOTION_CONFIG.happiness },
    { key: "surprise",  pct: surprise, ...EMOTION_CONFIG.surprise  },
    { key: "neutral",   pct: neutral,  ...EMOTION_CONFIG.neutral   },
    { key: "negative",  pct: negative, ...EMOTION_CONFIG.negative  },
  ].filter((s) => s.pct > 0);

  const dominantEmoji = DOMINANT_EMOJI[dominant] ?? "😐";
  const dominantLabel = dominant
    ? dominant.charAt(0).toUpperCase() + dominant.slice(1)
    : "Neutral";

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-slate-400 text-sm font-medium">Audience Mood</div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg">{dominantEmoji}</span>
          <span className="text-slate-300 text-sm font-semibold">{dominantLabel}</span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="w-full h-5 rounded-full overflow-hidden flex mb-3">
        {segments.length > 0 ? segments.map((seg) => (
          <div
            key={seg.key}
            style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
            title={`${seg.label}: ${seg.pct}%`}
            className="transition-all duration-700"
          />
        )) : (
          <div className="w-full h-full bg-slate-700 rounded-full" />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
        {[
          { label: "Happy",    pct: happy,    color: "#34d399", icon: "😊" },
          { label: "Surprised",pct: surprise, color: "#60a5fa", icon: "😮" },
          { label: "Neutral",  pct: neutral,  color: "#94a3b8", icon: "😐" },
          { label: "Negative", pct: negative, color: "#f87171", icon: "😟" },
        ].map(({ label, pct, color, icon }) => (
          <div key={label} className="flex items-center gap-1 text-xs text-slate-400">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            {icon} {label}
            <span className="font-semibold ml-0.5" style={{ color }}>{pct}%</span>
          </div>
        ))}
      </div>

      {/* Mood Quality Score */}
      <div className="border-t border-slate-700 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-500 text-xs">Mood Quality Score</div>
            <div className="text-slate-400 text-xs mt-0.5">engagement × emotion weight</div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${qualityColor(quality)}`}>{qualityPct}</div>
            <div className={`text-xs ${qualityColor(quality)}`}>{qualityLabel(quality)}</div>
          </div>
        </div>
        {/* Quality bar */}
        <div className="mt-2 w-full h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-700"
            style={{
              width: `${qualityPct}%`,
              backgroundColor: quality >= 0.7 ? "#34d399" : quality >= 0.4 ? "#fbbf24" : "#ef4444",
            }}
          />
        </div>
      </div>
    </div>
  );
}
