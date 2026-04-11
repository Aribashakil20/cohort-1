/**
 * HistoryChart.jsx — Line chart of viewer count and engagement over time
 *
 * Purpose:
 *   Shows how the audience has changed over the last N data points
 *   (each point = one 10-second DB row saved by pipeline.py).
 *   Two lines: total viewers (green) and engagement rate % (yellow).
 *
 * Why two lines on one chart?
 *   It lets you see correlation — e.g. "viewer count went up but
 *   engagement dropped, meaning people were glancing but not watching."
 *
 * Props:
 *   history — array of analytics rows from /history endpoint
 *             Each row has: timestamp, viewer_count, engagement_rate
 */

import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  Legend, ResponsiveContainer, CartesianGrid
} from "recharts";

export default function HistoryChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex items-center justify-center h-64">
        <span className="text-slate-500">Waiting for history data...</span>
      </div>
    );
  }

  // Format timestamp to short HH:MM:SS for the X axis label
  const chartData = history.map((row) => ({
    time:       row.timestamp ? row.timestamp.slice(11, 19) : "",
    viewers:    row.viewer_count,
    engagement: Math.round((row.engagement_rate ?? 0) * 100), // convert 0-1 → 0-100
  }));

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="text-slate-400 text-sm font-medium mb-4">Viewer Count &amp; Engagement Over Time</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ left: 0, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            interval="preserveStartEnd"
          />
          {/* Left Y axis: viewer count */}
          <YAxis yAxisId="left"  tick={{ fill: "#94a3b8", fontSize: 11 }} />
          {/* Right Y axis: engagement % */}
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
                 tick={{ fill: "#94a3b8", fontSize: 11 }} unit="%" />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#f1f5f9" }}
          />
          <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="viewers"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
            name="Viewers"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="engagement"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={false}
            name="Engagement %"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
