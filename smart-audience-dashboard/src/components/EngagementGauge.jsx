/**
 * EngagementGauge.jsx — Circular gauge showing current engagement rate
 *
 * Purpose:
 *   Engagement rate = fraction of detected faces with det_score >= 0.65
 *   (meaning: faces clearly looking at the camera / display).
 *   This gauge gives an immediate visual sense of how engaged the audience is.
 *
 * How the gauge works:
 *   We use SVG (Scalable Vector Graphics — like drawing with code).
 *   A circle is drawn with a dashed stroke. By adjusting the dash length
 *   vs gap length, we fill the circle partially — proportional to the %.
 *   This is called the "stroke-dasharray / stroke-dashoffset" technique.
 *
 * Props:
 *   rate     — number 0.0 to 1.0 (e.g. 0.75 = 75% engaged)
 *   prevRate — number 0.0 to 1.0: previous window's rate (for trend arrow)
 */

export default function EngagementGauge({ rate = 0, prevRate = null }) {
  const pct    = Math.round((rate ?? 0) * 100);
  const radius = 54;
  const circ   = 2 * Math.PI * radius;  // full circumference
  const filled = (pct / 100) * circ;    // how much to fill

  // Color changes based on engagement level
  const color =
    pct >= 70 ? "#34d399" :   // green — high engagement
    pct >= 40 ? "#fbbf24" :   // yellow — medium
                "#ef4444";    // red — low

  // Trend vs previous window
  const prevPct = prevRate !== null ? Math.round(prevRate * 100) : null;
  const diff    = prevPct !== null ? pct - prevPct : null;
  const trendIcon  = diff === null ? null : diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  const trendColor = diff === null ? "" : diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-slate-400";

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col items-center justify-center">
      <div className="text-slate-400 text-sm font-medium mb-3">Engagement Rate</div>

      {/* SVG circle gauge */}
      <svg width="140" height="140" viewBox="0 0 140 140">
        {/* Background ring (grey) */}
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke="#334155"
          strokeWidth="12"
        />
        {/* Foreground ring (colored, rotated to start at top) */}
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        {/* Center text */}
        <text x="70" y="70" textAnchor="middle" dy="0.35em"
              fill={color} fontSize="26" fontWeight="bold" fontFamily="system-ui">
          {pct}%
        </text>
      </svg>

      <div className="text-slate-500 text-xs mt-1">faces looking at display</div>
      {trendIcon && (
        <div className={`text-xs font-semibold mt-1 ${trendColor}`}>
          {trendIcon} {Math.abs(diff)}% vs last window
        </div>
      )}
    </div>
  );
}
