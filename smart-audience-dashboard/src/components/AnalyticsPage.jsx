/**
 * AnalyticsPage.jsx — "Today's Analytics" tab
 *
 * Shows cumulative statistics derived from the history + summary data:
 *   - Peak viewer hour (which hour had the most viewers today)
 *   - Audience mix over time (engagement trend by hour)
 *   - Gender split summary
 *   - Total impressions breakdown
 *
 * Props:
 *   history    — array of history rows (viewer_count, engagement_rate, timestamp)
 *   summary    — summary object (avg_viewer_count, avg_engagement_rate, avg_male_pct, etc.)
 *   dwell      — array of dwell sessions
 *   cameraId   — optional camera filter passed to date-range fetch
 *   exportUrl  — function(date, cameraId) → CSV download URL
 */

import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend
} from "recharts";
import { fetchHistory } from "../api";

// Group history rows into hourly buckets
function groupByHour(history) {
  const buckets = {};
  (history ?? []).forEach((row) => {
    const h = new Date(row.timestamp).getHours();
    const key = `${h}:00`;
    if (!buckets[key]) buckets[key] = { hour: key, viewers: 0, engagement: 0, count: 0 };
    buckets[key].viewers    += row.viewer_count ?? 0;
    buckets[key].engagement += (row.engagement_rate ?? 0) * 100;
    buckets[key].count      += 1;
  });
  return Object.values(buckets)
    .map((b) => ({
      hour:       b.hour,
      avgViewers: parseFloat((b.viewers / b.count).toFixed(1)),
      avgEngage:  Math.round(b.engagement / b.count),
    }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
}

// Stat tile used inside this page
function Tile({ label, value, sub, color = "text-white" }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="text-slate-400 text-xs font-medium mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPage({ history, summary, dwell, cameraId, exportUrl }) {
  // Date range selector — defaults to today.
  // When user picks a past date, we fetch that day's data from the backend.
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate]   = useState(todayStr);
  const [dateHistory,  setDateHistory]    = useState(null);
  const [dateLoading,  setDateLoading]    = useState(false);

  useEffect(() => {
    if (selectedDate === todayStr) {
      setDateHistory(null); // use live history prop for today
      return;
    }
    setDateLoading(true);
    fetchHistory(1000, cameraId, selectedDate)
      .then((data) => { setDateHistory(data); setDateLoading(false); })
      .catch(()    => { setDateHistory([]);   setDateLoading(false); });
  }, [selectedDate, cameraId, todayStr]);

  // Use fetched date history when a past date is selected; fall back to live prop
  const displayHistory = dateHistory ?? history;
  const hourly = groupByHour(displayHistory);

  // Stats computed from displayHistory
  const totalImpressions = (displayHistory ?? []).reduce((s, r) => s + (r.viewer_count ?? 0), 0);
  const avgDwell = dwell && dwell.length > 0
    ? Math.round(dwell.reduce((s, d) => s + d.duration_seconds, 0) / dwell.length)
    : null;
  const longestSession = dwell && dwell.length > 0
    ? Math.round(Math.max(...dwell.map((d) => d.duration_seconds)))
    : null;
  const malePct   = summary ? Math.round((summary.avg_male_pct       ?? 0) * 100) : null;
  const femalePct = summary ? Math.round((summary.avg_female_pct     ?? 0) * 100) : null;
  const avgEngage = summary ? Math.round((summary.avg_engagement_rate ?? 0) * 100) : null;

  const peakHour  = hourly.length > 0
    ? hourly.reduce((best, h) => h.avgViewers > best.avgViewers ? h : best, hourly[0])
    : null;

  return (
    <div className="space-y-5">

      {/* ── Date range selector + CSV export ──────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="text-slate-400 text-sm">Date:</label>
          <input
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          />
          {dateLoading && <span className="text-slate-500 text-xs">Loading...</span>}
          {selectedDate !== todayStr && !dateLoading && (
            <span className="text-blue-400 text-xs">Showing {selectedDate}</span>
          )}
        </div>
        {exportUrl && (
          <a
            href={exportUrl(selectedDate !== todayStr ? selectedDate : null, cameraId)}
            download
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            ⬇ Export CSV
          </a>
        )}
      </div>

      {/* ── Summary tiles ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          label="Total Impressions"
          value={totalImpressions || "—"}
          sub="viewers seen today"
          color="text-cyan-400"
        />
        <Tile
          label="Peak Hour"
          value={peakHour ? peakHour.hour : "—"}
          sub={peakHour ? `avg ${peakHour.avgViewers} viewers` : "not enough data"}
          color="text-yellow-400"
        />
        <Tile
          label="Avg Dwell Time"
          value={avgDwell ? `${avgDwell}s` : "—"}
          sub={`longest: ${longestSession ? longestSession + "s" : "—"}`}
          color="text-orange-400"
        />
        <Tile
          label="Avg Engagement"
          value={avgEngage != null ? `${avgEngage}%` : "—"}
          sub="across all windows"
          color="text-green-400"
        />
      </div>

      {/* ── Hourly viewer + engagement chart ────────────────────────── */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <div className="text-slate-400 text-sm font-medium mb-4">Viewers &amp; Engagement by Hour</div>
        {hourly.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">Not enough history data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={hourly} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis yAxisId="left"  tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#f1f5f9" }}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              <Line yAxisId="left"  type="monotone" dataKey="avgViewers" stroke="#60a5fa" strokeWidth={2} dot={false} name="Avg Viewers" />
              <Line yAxisId="right" type="monotone" dataKey="avgEngage"  stroke="#34d399" strokeWidth={2} dot={false} name="Engagement %" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Gender split + dwell distribution ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Gender bar */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-sm font-medium mb-4">Audience Gender Split (avg)</div>
          {malePct == null ? (
            <div className="text-slate-500 text-sm">No summary data</div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-slate-300 text-sm w-16">Male</span>
                <div className="flex-1 bg-slate-700 rounded-full h-4 overflow-hidden">
                  <div className="h-4 rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${malePct}%` }} />
                </div>
                <span className="text-blue-400 font-bold text-sm w-10 text-right">{malePct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-300 text-sm w-16">Female</span>
                <div className="flex-1 bg-slate-700 rounded-full h-4 overflow-hidden">
                  <div className="h-4 rounded-full bg-pink-500 transition-all duration-700" style={{ width: `${femalePct}%` }} />
                </div>
                <span className="text-pink-400 font-bold text-sm w-10 text-right">{femalePct}%</span>
              </div>
            </>
          )}
        </div>

        {/* Dwell duration distribution */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-slate-400 text-sm font-medium mb-4">Session Duration Distribution</div>
          {!dwell || dwell.length === 0 ? (
            <div className="text-slate-500 text-sm">No sessions yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={[
                  { range: "<10s",  count: dwell.filter(d => d.duration_seconds < 10).length },
                  { range: "10–30s",count: dwell.filter(d => d.duration_seconds >= 10 && d.duration_seconds < 30).length },
                  { range: "30–60s",count: dwell.filter(d => d.duration_seconds >= 30 && d.duration_seconds < 60).length },
                  { range: "60s+",  count: dwell.filter(d => d.duration_seconds >= 60).length },
                ]}
                margin={{ left: 0, right: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="range" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                  formatter={(v) => [v, "Sessions"]}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
}
