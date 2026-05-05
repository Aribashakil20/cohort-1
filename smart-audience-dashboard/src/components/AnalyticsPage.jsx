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

// ── Heatmap helpers ────────────────────────────────────────────────────────────
function buildHeatmap(history) {
  const cells = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
    viewers: 0, engagement: 0, count: 0,
  }));
  (history ?? []).forEach((row) => {
    const h = new Date(row.timestamp).getHours();
    cells[h].viewers    += row.viewer_count ?? 0;
    cells[h].engagement += (row.engagement_rate ?? 0) * 100;
    cells[h].count      += 1;
  });
  return cells.map((c) => ({
    ...c,
    avgViewers: c.count > 0 ? parseFloat((c.viewers / c.count).toFixed(1)) : 0,
    avgEngage:  c.count > 0 ? Math.round(c.engagement / c.count) : 0,
  }));
}

function heatColor(value, max) {
  if (max === 0 || value === 0) return "#1e293b";
  const t = value / max;
  if (t < 0.25) return "#1e3a5f";
  if (t < 0.50) return "#1d4ed8";
  if (t < 0.75) return "#059669";
  if (t < 0.90) return "#d97706";
  return "#dc2626";
}

function HeatmapGrid({ cells, metric }) {
  const vals = cells.map((c) => (metric === "viewers" ? c.avgViewers : c.avgEngage));
  const max  = Math.max(...vals, 1);
  const am   = cells.slice(0, 12);
  const pm   = cells.slice(12, 24);

  return (
    <div className="space-y-2">
      {[am, pm].map((row, ri) => (
        <div key={ri} className="grid grid-cols-12 gap-1">
          {row.map((cell) => {
            const val = metric === "viewers" ? cell.avgViewers : cell.avgEngage;
            return (
              <div
                key={cell.hour}
                title={`${cell.label}: ${val}${metric === "engagement" ? "%" : " viewers"}`}
                className="relative rounded-md flex flex-col items-center justify-center cursor-default select-none"
                style={{ background: heatColor(val, max), minHeight: 48 }}
              >
                <span className="text-white/50 text-[9px] leading-none">{cell.label}</span>
                <span className="text-white font-bold text-xs mt-0.5">
                  {val > 0 ? (metric === "engagement" ? `${val}%` : val) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 justify-end mt-1">
        {["No data", "Low", "Medium", "High", "Peak"].map((lbl, i) => (
          <div key={lbl} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ background: ["#1e293b","#1e3a5f","#1d4ed8","#059669","#dc2626"][i] }} />
            <span className="text-slate-500 text-[10px]">{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

// ── Demo comparison data ──────────────────────────────────────────────────────
const DEMO_COMPARE = {
  cam_01: { label: "Mall Entrance",   viewers: 8,  engagement: 72, malePct: 52, femalePct: 48, ageGroup: "adult",  topAd: "Coca-Cola",       uniqueVisitors: 34 },
  cam_02: { label: "Food Court",      viewers: 14, engagement: 61, malePct: 71, femalePct: 29, ageGroup: "youth",  topAd: "PlayStation 5",   uniqueVisitors: 58 },
  cam_03: { label: "Clothing Store",  viewers: 6,  engagement: 84, malePct: 22, femalePct: 78, ageGroup: "adult",  topAd: "MakeMyTrip",      uniqueVisitors: 21 },
  cam_04: { label: "Electronics Zone",viewers: 2,  engagement: 45, malePct: 80, femalePct: 20, ageGroup: "youth",  topAd: "PlayStation 5",   uniqueVisitors: 9  },
};

function diffColor(a, b, higherIsBetter = true) {
  if (a === b) return "text-slate-400";
  return (a > b) === higherIsBetter ? "text-green-400" : "text-red-400";
}

function ComparePanel({ label, data, color }) {
  if (!data) return <div className="text-slate-500 text-sm text-center py-6">Select a camera</div>;
  return (
    <div className={`rounded-xl border p-5 space-y-3 ${color}`}>
      <div className="text-white font-semibold text-sm">{label} — {data.label}</div>
      {[
        { k: "Viewers Now",   v: data.viewers,             unit: "" },
        { k: "Unique",        v: data.uniqueVisitors,      unit: "" },
        { k: "Engagement",    v: `${data.engagement}%`,    unit: "" },
        { k: "Top Gender",    v: data.malePct >= 60 ? `Male (${data.malePct}%)` : data.femalePct >= 60 ? `Female (${data.femalePct}%)` : "Mixed", unit: "" },
        { k: "Age Group",     v: data.ageGroup,            unit: "" },
        { k: "Top Ad",        v: data.topAd,               unit: "" },
      ].map((row) => (
        <div key={row.k} className="flex justify-between text-xs">
          <span className="text-slate-400">{row.k}</span>
          <span className="text-white font-semibold capitalize">{row.v}{row.unit}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage({ history, summary, dwell, cameraId, exportUrl, cameras = [], demoMode }) {
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
  const heatCells = buildHeatmap(displayHistory);
  const [heatMetric, setHeatMetric] = useState("viewers");

  // Comparative analytics state
  const [compareOpen, setCompareOpen]   = useState(false);
  const [compareA,    setCompareA]      = useState(cameras[0] ?? "cam_01");
  const [compareB,    setCompareB]      = useState(cameras[1] ?? "cam_02");
  const [liveCompA,   setLiveCompA]     = useState(null);
  const [liveCompB,   setLiveCompB]     = useState(null);

  useEffect(() => {
    if (!compareOpen) return;
    if (demoMode) {
      setLiveCompA(DEMO_COMPARE[compareA] ?? null);
      setLiveCompB(DEMO_COMPARE[compareB] ?? null);
      return;
    }
    // fetch real live snapshots for comparison cameras
    const fetchComp = async () => {
      const [a, b] = await Promise.all([
        fetchLive(compareA).catch(() => null),
        fetchLive(compareB).catch(() => null),
      ]);
      if (a) setLiveCompA({ label: compareA, viewers: a.viewer_count, engagement: Math.round((a.engagement_rate ?? 0) * 100), malePct: Math.round((a.male_pct ?? 0) * 100), femalePct: Math.round((a.female_pct ?? 0) * 100), ageGroup: a.dominant_age_group, topAd: a.dominant_ad, uniqueVisitors: a.unique_visitors_session });
      if (b) setLiveCompB({ label: compareB, viewers: b.viewer_count, engagement: Math.round((b.engagement_rate ?? 0) * 100), malePct: Math.round((b.male_pct ?? 0) * 100), femalePct: Math.round((b.female_pct ?? 0) * 100), ageGroup: b.dominant_age_group, topAd: b.dominant_ad, uniqueVisitors: b.unique_visitors_session });
    };
    fetchComp();
  }, [compareOpen, compareA, compareB, demoMode]);

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

      {/* ── Hourly heatmap ──────────────────────────────────────────── */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="text-slate-400 text-sm font-medium">Footfall Heatmap by Hour</div>
          <div className="flex gap-1">
            {["viewers", "engagement"].map((m) => (
              <button
                key={m}
                onClick={() => setHeatMetric(m)}
                className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                  heatMetric === m
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "border-slate-600 text-slate-400 hover:text-white"
                }`}
              >
                {m === "viewers" ? "Viewers" : "Engagement %"}
              </button>
            ))}
          </div>
        </div>
        <HeatmapGrid cells={heatCells} metric={heatMetric} />
        <div className="mt-3 text-slate-500 text-xs">
          AM row = midnight–11am &nbsp;·&nbsp; PM row = noon–11pm &nbsp;·&nbsp; Hover a cell for exact value
        </div>
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

      {/* ── Comparative analytics ───────────────────────────────────── */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <button
          onClick={() => setCompareOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-700/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-slate-300 font-medium text-sm">Compare Cameras</span>
            <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full">Side-by-side</span>
          </div>
          <span className="text-slate-500 text-sm">{compareOpen ? "▲" : "▼"}</span>
        </button>

        {compareOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-slate-700">
            {/* Camera selectors */}
            <div className="grid grid-cols-2 gap-4 pt-4">
              {[
                { label: "Camera A", value: compareA, set: setCompareA },
                { label: "Camera B", value: compareB, set: setCompareB },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="text-slate-400 text-xs block mb-1">{label}</label>
                  <select
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                  >
                    {(demoMode ? Object.keys(DEMO_COMPARE) : cameras).map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Side-by-side panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ComparePanel label="Camera A" data={liveCompA} color="bg-blue-900/20 border-blue-700/40" />
              <ComparePanel label="Camera B" data={liveCompB} color="bg-purple-900/20 border-purple-700/40" />
            </div>

            {/* Diff summary */}
            {liveCompA && liveCompB && (
              <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
                <div className="text-slate-400 text-xs font-medium mb-3">Comparison (A vs B)</div>
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  {[
                    { label: "Viewers",    a: liveCompA.viewers,         b: liveCompB.viewers         },
                    { label: "Engagement", a: liveCompA.engagement,      b: liveCompB.engagement      },
                    { label: "Unique",     a: liveCompA.uniqueVisitors,  b: liveCompB.uniqueVisitors  },
                  ].map(({ label, a, b }) => (
                    <div key={label} className="bg-slate-700/50 rounded-lg p-3">
                      <div className="text-slate-400 mb-1">{label}</div>
                      <div className={`font-bold text-sm ${a > b ? "text-green-400" : a < b ? "text-red-400" : "text-slate-400"}`}>
                        {a > b ? `A +${a - b}` : a < b ? `B +${b - a}` : "Tied"}
                      </div>
                      <div className="text-slate-500 text-[10px]">{a} vs {b}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
