/**
 * App.jsx — Root component: fetches all data and lays out the dashboard
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  StatusBar  [cam_01] [Demo Mode btn] [connected] [time]      │
 *   ├──────┬──────┬──────┬──────┬──────────────────────────────────┤
 *   │Views │ Avg  │ Eng% │ Age  │  Avg Dwell (s)                   │ ← 5 StatCards
 *   ├──────┴──────┴──────┴──────┴──────────────────────────────────┤
 *   │  GenderBar (2/3 width)          │  EngagementGauge (1/3)     │
 *   ├─────────────────────────────────┴────────────────────────────┤
 *   │  HistoryChart — viewers + engagement over time (full width)  │
 *   ├──────────────────────┬───────────────────┬───────────────────┤
 *   │  AgeChart            │  DwellChart        │  AdRecommendation │
 *   └──────────────────────┴───────────────────┴───────────────────┘
 *
 * Demo Mode:
 *   When demoMode=true, realistic fake data is used instead of API calls.
 *   This lets you present the dashboard anywhere without a running camera.
 *   Toggle with the "Demo Mode" button in the top bar.
 */

import { useState, useEffect, useCallback } from "react";
import { fetchHealth, fetchLive, fetchHistory, fetchSummary, fetchDwell } from "./api";
import { usePolling } from "./hooks/usePolling";

import StatusBar        from "./components/StatusBar";
import StatCard         from "./components/StatCard";
import GenderBar        from "./components/GenderBar";
import AgeChart         from "./components/AgeChart";
import HistoryChart     from "./components/HistoryChart";
import EngagementGauge  from "./components/EngagementGauge";
import AdRecommendation from "./components/AdRecommendation";
import DwellChart       from "./components/DwellChart";

// ── Demo data ─────────────────────────────────────────────────────────────────
// Realistic fake data used when demoMode = true.
// Lets you present the dashboard without a running camera or backend.

const DEMO_LIVE = {
  id: 99, camera_id: "cam_01",
  timestamp: new Date().toISOString(),
  viewer_count: 3,
  male_count: 2, female_count: 1,
  male_pct: 0.667, female_pct: 0.333,
  age_child_pct: 0.0, age_youth_pct: 0.333, age_adult_pct: 0.667,
  age_middle_aged_pct: 0.0, age_senior_pct: 0.0,
  dominant_age_group: "adult",
  engagement_rate: 0.667,
  dominant_ad: "Cars / Finance",
};

const DEMO_SUMMARY = {
  row_count: 30,
  avg_viewer_count: 2.4,
  avg_engagement_rate: 0.61,
  avg_male_pct: 0.58, avg_female_pct: 0.42,
  dominant_age_group: "adult",
  dominant_ad: "Cars / Finance",
};

// Generate 30 history points with slight random variation
const DEMO_HISTORY = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  camera_id: "cam_01",
  timestamp: new Date(Date.now() - (29 - i) * 10_000).toISOString(),
  viewer_count: Math.max(0, Math.round(2.5 + Math.sin(i / 4) * 1.5 + (Math.random() - 0.5))),
  engagement_rate: Math.min(1, Math.max(0, 0.55 + Math.cos(i / 5) * 0.2 + (Math.random() - 0.5) * 0.1)),
}));

const DEMO_DWELL = [
  { id: 1, camera_id: "cam_01", start_time: "", end_time: "", duration_seconds: 47.3, peak_count: 3, avg_count: 2.1 },
  { id: 2, camera_id: "cam_01", start_time: "", end_time: "", duration_seconds: 23.1, peak_count: 2, avg_count: 1.5 },
  { id: 3, camera_id: "cam_01", start_time: "", end_time: "", duration_seconds: 8.4,  peak_count: 1, avg_count: 1.0 },
  { id: 4, camera_id: "cam_01", start_time: "", end_time: "", duration_seconds: 61.0, peak_count: 4, avg_count: 3.2 },
  { id: 5, camera_id: "cam_01", start_time: "", end_time: "", duration_seconds: 15.7, peak_count: 2, avg_count: 1.8 },
  { id: 6, camera_id: "cam_01", start_time: "", end_time: "", duration_seconds: 33.2, peak_count: 3, avg_count: 2.4 },
];

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [connected,  setConnected]  = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [demoMode,   setDemoMode]   = useState(false);

  // ── Health check every 10s (skip in demo mode) ───────────────────────────
  useEffect(() => {
    if (demoMode) { setConnected(false); return; }
    const check = async () => {
      try {
        const h = await fetchHealth();
        setConnected(h.status === "ok" && h.database === "connected");
      } catch {
        setConnected(false);
      }
    };
    check();
    const t = setInterval(check, 10_000);
    return () => clearInterval(t);
  }, [demoMode]);

  // ── Live data polling (5s) ────────────────────────────────────────────────
  const liveFn = useCallback(() => demoMode ? Promise.resolve(DEMO_LIVE)    : fetchLive(),       [demoMode]);
  const histFn = useCallback(() => demoMode ? Promise.resolve(DEMO_HISTORY) : fetchHistory(40),  [demoMode]);
  const sumFn  = useCallback(() => demoMode ? Promise.resolve(DEMO_SUMMARY) : fetchSummary(30),  [demoMode]);
  const dwlFn  = useCallback(() => demoMode ? Promise.resolve(DEMO_DWELL)   : fetchDwell(20),    [demoMode]);

  const { data: live    } = usePolling(liveFn, 5_000);
  const { data: history } = usePolling(histFn, 5_000);
  const { data: summary } = usePolling(sumFn,  10_000);
  const { data: dwell   } = usePolling(dwlFn,  15_000);

  // Track last update time
  useEffect(() => {
    if (live) setLastUpdate(new Date());
  }, [live]);

  // ── Derived display values ────────────────────────────────────────────────
  const viewers     = live?.viewer_count       ?? "—";
  const maleCount   = live?.male_count         ?? 0;
  const femaleCount = live?.female_count       ?? 0;
  const malePct     = live?.male_pct           ?? 0;
  const femalePct   = live?.female_pct         ?? 0;
  const engRate     = live?.engagement_rate    ?? 0;
  const ageGroup    = live?.dominant_age_group ?? "—";
  const adCategory  = live?.dominant_ad        ?? "—";
  const cameraId    = live?.camera_id          ?? "—";

  const avgViewers    = summary?.avg_viewer_count != null
    ? summary.avg_viewer_count.toFixed(1) : "—";
  const avgEngagement = summary
    ? `${Math.round(summary.avg_engagement_rate * 100)}%` : "—";

  // Average dwell time across all recorded sessions
  const avgDwell = dwell && dwell.length > 0
    ? `${Math.round(dwell.reduce((s, d) => s + d.duration_seconds, 0) / dwell.length)}s`
    : "—";

  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <StatusBar
        connected={connected}
        lastUpdate={lastUpdate}
        cameraId={demoMode ? "cam_01 (demo)" : cameraId}
        demoMode={demoMode}
        onToggleDemo={() => setDemoMode(d => !d)}
      />

      <div className="p-4 md:p-6 space-y-4">

        {/* ── Row 1: 5 summary stat cards ─────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            label="Viewers Now"
            value={viewers}
            icon="👥"
            highlight="text-green-400"
            sub="current snapshot"
          />
          <StatCard
            label="Avg Viewers"
            value={avgViewers}
            icon="📊"
            highlight="text-blue-400"
            sub="last 30 windows"
          />
          <StatCard
            label="Avg Engagement"
            value={avgEngagement}
            icon="🎯"
            highlight="text-yellow-400"
            sub="last 30 windows"
          />
          <StatCard
            label="Dominant Age"
            value={ageGroup}
            icon="🎂"
            highlight="text-purple-400"
            sub="current audience"
          />
          <StatCard
            label="Avg Dwell Time"
            value={avgDwell}
            icon="⏱️"
            highlight="text-orange-400"
            sub={`${dwell?.length ?? 0} sessions recorded`}
          />
        </div>

        {/* ── Row 2: Gender bar + Engagement gauge ────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <GenderBar
              malePct={malePct}
              femalePct={femalePct}
              maleCount={maleCount}
              femaleCount={femaleCount}
            />
          </div>
          <EngagementGauge rate={engRate} />
        </div>

        {/* ── Row 3: History line chart ────────────────────────────────── */}
        <HistoryChart history={history} />

        {/* ── Row 4: Age breakdown + Dwell chart + Ad recommendation ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AgeChart data={live} />
          <DwellChart sessions={dwell} />
          <AdRecommendation adCategory={adCategory} ageGroup={ageGroup} />
        </div>

      </div>
    </div>
  );
}
