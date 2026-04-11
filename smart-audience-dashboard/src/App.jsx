/**
 * App.jsx — Root component: fetches all data and lays out the dashboard
 *
 * This is the "brain" of the React app. It:
 *  1. Polls the backend for live data, history, and summary every 5 seconds
 *  2. Checks health every 10 seconds to update the connection indicator
 *  3. Passes the data down to each visual component
 *
 * Layout (top to bottom):
 *   ┌─────────────────────────────────────────────────┐
 *   │  StatusBar (connection indicator + time)        │
 *   ├──────────┬──────────┬──────────┬────────────────┤
 *   │ Viewers  │ Avg View │ Avg Eng  │ Dominant Age   │  ← StatCards
 *   ├──────────┴──────────┴──────────┴────────────────┤
 *   │  GenderBar (live split)      │ EngagementGauge  │
 *   ├──────────────────────────────┴──────────────────┤
 *   │  HistoryChart (viewers + engagement over time)  │
 *   ├──────────────────┬──────────────────────────────┤
 *   │  AgeChart        │  AdRecommendation            │
 *   └──────────────────┴──────────────────────────────┘
 */

import { useState, useEffect, useCallback } from "react";
import { fetchHealth, fetchLive, fetchHistory, fetchSummary } from "./api";
import { usePolling } from "./hooks/usePolling";

import StatusBar         from "./components/StatusBar";
import StatCard          from "./components/StatCard";
import GenderBar         from "./components/GenderBar";
import AgeChart          from "./components/AgeChart";
import HistoryChart      from "./components/HistoryChart";
import EngagementGauge   from "./components/EngagementGauge";
import AdRecommendation  from "./components/AdRecommendation";

export default function App() {
  const [connected,  setConnected]  = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // ── Poll /health every 10 seconds ────────────────────────────────────────
  useEffect(() => {
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
  }, []);

  // ── Poll /analytics/live every 5 seconds ─────────────────────────────────
  const liveFn = useCallback(() => fetchLive(), []);
  const { data: live } = usePolling(liveFn, 5_000);

  // ── Poll /analytics/history every 5 seconds ──────────────────────────────
  const histFn = useCallback(() => fetchHistory(40), []);
  const { data: history } = usePolling(histFn, 5_000);

  // ── Poll /analytics/summary every 10 seconds ─────────────────────────────
  const sumFn = useCallback(() => fetchSummary(30), []);
  const { data: summary } = usePolling(sumFn, 10_000);

  // Track last update time whenever live data changes
  useEffect(() => {
    if (live) setLastUpdate(new Date());
  }, [live]);

  // ── Derived display values ────────────────────────────────────────────────
  const viewers     = live?.viewer_count      ?? "—";
  const maleCount   = live?.male_count        ?? 0;
  const femaleCount = live?.female_count      ?? 0;
  const malePct     = live?.male_pct          ?? 0;
  const femalePct   = live?.female_pct        ?? 0;
  const engRate     = live?.engagement_rate   ?? 0;
  const ageGroup    = live?.dominant_age_group ?? "—";
  const adCategory  = live?.dominant_ad       ?? "—";

  const avgViewers    = summary?.avg_viewer_count    ?? "—";
  const avgEngagement = summary
    ? `${Math.round(summary.avg_engagement_rate * 100)}%`
    : "—";

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <StatusBar connected={connected} lastUpdate={lastUpdate} />

      <div className="p-6 space-y-5">

        {/* ── Row 1: Summary stat cards ─────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        </div>

        {/* ── Row 2: Gender bar + Engagement gauge ──────────────────── */}
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

        {/* ── Row 3: History line chart ──────────────────────────────── */}
        <HistoryChart history={history} />

        {/* ── Row 4: Age breakdown + Ad recommendation ──────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AgeChart data={live} />
          <AdRecommendation adCategory={adCategory} ageGroup={ageGroup} />
        </div>

      </div>
    </div>
  );
}
