/**
 * DwellChart.jsx — Bar chart of dwell session durations
 *
 * Purpose:
 *   Shows how long each audience session lasted.
 *   Each bar = one session (one continuous period where people were present).
 *   Bar height = duration in seconds. Color = peak viewer count.
 *
 * What is a dwell session?
 *   When viewer_count goes from 0 to >0, a session starts.
 *   When viewer_count drops back to 0, the session ends and is saved.
 *   This chart shows the last N completed sessions.
 *
 * Props:
 *   sessions — array from /api/v1/analytics/dwell
 *              Each item: { id, duration_seconds, peak_count, avg_count, start_time }
 */

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from "recharts";

// Color bars by peak viewer count
function peakColor(peak) {
  if (peak >= 4) return "#34d399"; // green — big group
  if (peak >= 2) return "#60a5fa"; // blue  — small group
  return "#a78bfa";                 // purple — single viewer
}

// Custom tooltip shown on hover
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
      <div className="text-white font-semibold">Session #{d.session}</div>
      <div className="text-slate-300">Duration: <span className="text-yellow-400">{d.duration}s</span></div>
      <div className="text-slate-300">Peak viewers: <span className="text-green-400">{d.peak}</span></div>
      <div className="text-slate-300">Avg viewers: <span className="text-blue-400">{d.avg}</span></div>
    </div>
  );
}

export default function DwellChart({ sessions }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col justify-center items-center h-48">
        <div className="text-slate-500 text-sm">No dwell sessions yet</div>
        <div className="text-slate-600 text-xs mt-1">Sessions appear when viewers leave frame</div>
      </div>
    );
  }

  const chartData = sessions.map((s, i) => ({
    session:  i + 1,
    duration: Math.round(s.duration_seconds),
    peak:     s.peak_count,
    avg:      s.avg_count,
  }));

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className="text-slate-400 text-sm font-medium">Dwell Time per Session (seconds)</div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-sm bg-purple-400 mr-1" />1 viewer</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-blue-400 mr-1" />2–3 viewers</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-green-400 mr-1" />4+ viewers</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ left: 0, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis
            dataKey="session"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            label={{ value: "Session #", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            unit="s"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1e293b" }} />
          <Bar dataKey="duration" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.session} fill={peakColor(entry.peak)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
