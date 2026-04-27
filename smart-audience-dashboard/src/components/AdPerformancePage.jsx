/**
 * AdPerformancePage.jsx — "Ad Performance" tab
 *
 * Shows which ad categories have been displayed and how they performed:
 *   - How many times each ad category appeared (impression count)
 *   - Average engagement rate while each ad was shown
 *   - Top performing ad
 *
 * Props:
 *   history — array of history rows (dominant_ad, engagement_rate, viewer_count)
 */

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from "recharts";

const AD_COLORS = {
  "Gaming / Sports":          "#3b82f6",
  "Fashion / Beauty":         "#ec4899",
  "Toys / Boys Games":        "#f59e0b",
  "Toys / Girls Games":       "#f97316",
  "Cars / Finance":           "#64748b",
  "Lifestyle / Travel":       "#14b8a6",
  "Health / Home Appliances": "#22c55e",
  "Skincare / Wellness":      "#a855f7",
  "Healthcare / Insurance":   "#ef4444",
  "General Ad":               "#94a3b8",
  "No audience":              "#475569",
};

function buildAdStats(history) {
  const map = {};
  (history ?? []).forEach((row) => {
    const ad = row.dominant_ad ?? "General Ad";
    if (!map[ad]) map[ad] = { ad, impressions: 0, engagementSum: 0, viewerSum: 0 };
    map[ad].impressions   += 1;
    map[ad].engagementSum += (row.engagement_rate ?? 0) * 100;
    map[ad].viewerSum     += row.viewer_count ?? 0;
  });
  return Object.values(map)
    .map((d) => ({
      ad:         d.ad,
      impressions: d.impressions,
      avgEngage:  Math.round(d.engagementSum / d.impressions),
      avgViewers: parseFloat((d.viewerSum / d.impressions).toFixed(1)),
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

// Truncate long names for axis labels
function shortName(name) {
  const map = {
    "Health / Home Appliances": "Health / Home",
    "Healthcare / Insurance":   "Healthcare",
    "Skincare / Wellness":      "Skincare",
    "Lifestyle / Travel":       "Lifestyle",
    "Gaming / Sports":          "Gaming",
    "Fashion / Beauty":         "Fashion",
    "Cars / Finance":           "Cars / Finance",
    "Toys / Boys Games":        "Toys (Boys)",
    "Toys / Girls Games":       "Toys (Girls)",
    "General Ad":               "General",
    "No audience":              "No audience",
  };
  return map[name] ?? name;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
      <div className="text-white font-semibold mb-1">{d.ad}</div>
      <div className="text-slate-300">Impressions: <span className="text-cyan-400 font-bold">{d.impressions}</span></div>
      <div className="text-slate-300">Avg Engagement: <span className="text-green-400 font-bold">{d.avgEngage}%</span></div>
      <div className="text-slate-300">Avg Viewers: <span className="text-blue-400 font-bold">{d.avgViewers}</span></div>
    </div>
  );
}

// ── A/B comparison mode ───────────────────────────────────────────────────────
const ALL_AD_CATEGORIES = [
  "Gaming / Sports", "Fashion / Beauty", "Toys / Boys Games", "Toys / Girls Games",
  "Cars / Finance", "Lifestyle / Travel", "Health / Home Appliances",
  "Skincare / Wellness", "Healthcare / Insurance", "General Ad",
];

function ABComparison({ stats }) {
  const available = stats.map((s) => s.ad);
  const defaults  = available.slice(0, 2);
  const [adA, setAdA] = useState(defaults[0] ?? "");
  const [adB, setAdB] = useState(defaults[1] ?? "");

  const rowA = stats.find((s) => s.ad === adA);
  const rowB = stats.find((s) => s.ad === adB);

  const metrics = [
    { label: "Impressions",    keyA: rowA?.impressions,  keyB: rowB?.impressions,  unit: "",   higher: "more" },
    { label: "Avg Engagement", keyA: rowA?.avgEngage,    keyB: rowB?.avgEngage,    unit: "%",  higher: "more" },
    { label: "Avg Viewers",    keyA: rowA?.avgViewers,   keyB: rowB?.avgViewers,   unit: "",   higher: "more" },
  ];

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
      <div className="text-slate-300 text-sm font-semibold">A/B Comparison</div>

      {/* Category selectors */}
      <div className="grid grid-cols-2 gap-3">
        {[["A", adA, setAdA, "#3b82f6"], ["B", adB, setAdB, "#ec4899"]].map(([label, val, setVal, color]) => (
          <div key={label}>
            <div className="text-xs font-bold mb-1" style={{ color }}>Ad {label}</div>
            <select
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="">— select —</option>
              {available.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Metric comparison */}
      {rowA && rowB ? (
        <div className="space-y-3 mt-2">
          {metrics.map(({ label, keyA, keyB, unit }) => {
            const winner = keyA > keyB ? "A" : keyA < keyB ? "B" : "tie";
            return (
              <div key={label}>
                <div className="text-slate-500 text-xs mb-1">{label}</div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold w-16 text-right ${winner === "A" ? "text-blue-400" : "text-slate-400"}`}>
                    {keyA}{unit} {winner === "A" && "✓"}
                  </span>
                  <div className="flex-1 relative h-4 bg-slate-700 rounded-full overflow-hidden">
                    {/* A bar (blue, left) */}
                    <div
                      className="absolute left-0 top-0 h-full bg-blue-500 opacity-70 rounded-l-full"
                      style={{ width: `${keyA + keyB > 0 ? (keyA / (keyA + keyB)) * 100 : 50}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-16 ${winner === "B" ? "text-pink-400" : "text-slate-400"}`}>
                    {winner === "B" && "✓"} {keyB}{unit}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="text-xs text-slate-500 mt-1">
            Winner:{" "}
            {rowA.avgEngage > rowB.avgEngage ? (
              <span className="text-blue-400 font-semibold">Ad A ({adA}) — higher engagement</span>
            ) : rowB.avgEngage > rowA.avgEngage ? (
              <span className="text-pink-400 font-semibold">Ad B ({adB}) — higher engagement</span>
            ) : (
              <span className="text-slate-400">Tie</span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-slate-500 text-xs">Select two ad categories above to compare.</div>
      )}
    </div>
  );
}

export default function AdPerformancePage({ history }) {
  const [showAB, setShowAB] = useState(false);
  const stats = buildAdStats(history);

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <div className="text-4xl mb-3">🎯</div>
        <div className="text-sm">No ad history yet. Data appears as the camera runs.</div>
      </div>
    );
  }

  const topAd = stats[0];
  const bestEngaged = [...stats].sort((a, b) => b.avgEngage - a.avgEngage)[0];

  const impressionsChartData = stats.map((s) => ({ ...s, label: shortName(s.ad) }));
  const engageChartData      = [...stats]
    .sort((a, b) => b.avgEngage - a.avgEngage)
    .map((s) => ({ ...s, label: shortName(s.ad) }));

  return (
    <div className="space-y-5">

      {/* ── A/B mode toggle ─────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAB((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            showAB
              ? "border-purple-500 text-purple-400 bg-purple-500/10"
              : "border-slate-600 text-slate-400 hover:border-purple-500 hover:text-purple-400"
          }`}
        >
          {showAB ? "✕ Close A/B" : "⚡ A/B Comparison"}
        </button>
      </div>

      {/* ── A/B comparison panel ────────────────────────────────────── */}
      {showAB && <ABComparison stats={stats} />}

      {/* ── Top-line cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Most Shown Ad</div>
          <div className="text-white text-lg font-bold">{topAd.ad}</div>
          <div className="text-cyan-400 text-sm mt-1">{topAd.impressions} impressions</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Best Engagement</div>
          <div className="text-white text-lg font-bold">{bestEngaged.ad}</div>
          <div className="text-green-400 text-sm mt-1">{bestEngaged.avgEngage}% avg engagement</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-xs font-medium mb-1">Ad Categories Active</div>
          <div className="text-white text-3xl font-bold">{stats.length}</div>
          <div className="text-slate-500 text-sm mt-1">unique categories shown</div>
        </div>
      </div>

      {/* ── Impressions per ad ───────────────────────────────────────── */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <div className="text-slate-400 text-sm font-medium mb-4">Impressions per Ad Category</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={impressionsChartData} margin={{ left: 0, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1e293b" }} />
            <Bar dataKey="impressions" radius={[4, 4, 0, 0]}>
              {impressionsChartData.map((entry) => (
                <Cell key={entry.ad} fill={AD_COLORS[entry.ad] ?? "#64748b"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Avg engagement per ad ────────────────────────────────────── */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <div className="text-slate-400 text-sm font-medium mb-4">Avg Engagement % per Ad Category</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={engageChartData} margin={{ left: 0, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1e293b" }} />
            <Bar dataKey="avgEngage" radius={[4, 4, 0, 0]}>
              {engageChartData.map((entry) => (
                <Cell key={entry.ad} fill={AD_COLORS[entry.ad] ?? "#64748b"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
