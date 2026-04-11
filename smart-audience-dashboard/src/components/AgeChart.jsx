/**
 * AgeChart.jsx — Horizontal bar chart of age group breakdown
 *
 * Purpose:
 *   Shows what percentage of the current audience falls into each age group:
 *   Child, Youth, Adult, Middle Aged, Senior.
 *   Built using Recharts BarChart (horizontal layout).
 *
 * Why Recharts?
 *   Recharts is a React charting library built on top of SVG.
 *   We use it here instead of Canvas because SVG scales cleanly
 *   and Recharts components are easy to read and customize.
 *
 * Props:
 *   data — object from the /live or /summary API with age_*_pct fields
 *          Example: { age_child_pct: 0.1, age_youth_pct: 0.4, ... }
 */

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";

const COLORS = {
  Child:       "#f59e0b",
  Youth:       "#10b981",
  Adult:       "#3b82f6",
  "Middle Aged": "#8b5cf6",
  Senior:      "#ef4444",
};

export default function AgeChart({ data }) {
  if (!data) return null;

  const chartData = [
    { name: "Child",        pct: Math.round((data.age_child_pct       ?? 0) * 100) },
    { name: "Youth",        pct: Math.round((data.age_youth_pct       ?? 0) * 100) },
    { name: "Adult",        pct: Math.round((data.age_adult_pct       ?? 0) * 100) },
    { name: "Middle Aged",  pct: Math.round((data.age_middle_aged_pct ?? 0) * 100) },
    { name: "Senior",       pct: Math.round((data.age_senior_pct      ?? 0) * 100) },
  ];

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="text-slate-400 text-sm font-medium mb-4">Age Group Breakdown (%)</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={85} tick={{ fill: "#94a3b8", fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#f1f5f9" }}
            formatter={(v) => [`${v}%`, "Share"]}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={COLORS[entry.name] ?? "#64748b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
