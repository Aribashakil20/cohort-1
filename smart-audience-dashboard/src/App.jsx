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
import { fetchHealth, fetchLive, fetchHistory, fetchSummary, fetchDwell,
         fetchCameras, fetchAlerts, exportUrl, WS_BASE } from "./api";
import { usePolling }    from "./hooks/usePolling";
import { useWebSocket }  from "./hooks/useWebSocket";

import LandingPage      from "./components/LandingPage";
import DashboardCamera  from "./components/DashboardCamera";
import StatusBar        from "./components/StatusBar";
import TabBar           from "./components/TabBar";
import StatCard         from "./components/StatCard";
import GenderBar        from "./components/GenderBar";
import AgeChart         from "./components/AgeChart";
import HistoryChart     from "./components/HistoryChart";
import EngagementGauge  from "./components/EngagementGauge";
import AdRecommendation from "./components/AdRecommendation";
import DwellChart       from "./components/DwellChart";
import EmotionChart     from "./components/EmotionChart";
import AnalyticsPage    from "./components/AnalyticsPage";
import MultiCameraPage  from "./components/MultiCameraPage";
import AdPerformancePage from "./components/AdPerformancePage";
import AdDisplayScreen  from "./components/AdDisplayScreen";
import SettingsPage      from "./components/SettingsPage";
import AlertsPanel       from "./components/AlertsPanel";

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
  crowd_gender: "Male",
  age_confident: true,
  avg_attention_score: 74,
  dominant_emotion:        "happiness",
  emotion_happy_pct:       0.50,
  emotion_neutral_pct:     0.30,
  emotion_surprise_pct:    0.10,
  emotion_negative_pct:    0.10,
  engagement_quality:      0.82,
  new_visitors:            1,
  unique_visitors_session: 12,
};

const DEMO_SUMMARY = {
  row_count: 30,
  avg_viewer_count: 2.4,
  avg_engagement_rate: 0.61,
  avg_male_pct: 0.58, avg_female_pct: 0.42,
  dominant_age_group: "adult",
  dominant_ad: "Cars / Finance",
  dominant_emotion:     "happiness",
  avg_emotion_happy_pct:    0.45,
  avg_emotion_neutral_pct:  0.35,
  avg_emotion_surprise_pct: 0.10,
  avg_emotion_negative_pct: 0.10,
  avg_engagement_quality:   0.78,
};

// Generate 48 history points spread across today (every 30 min) with realistic variation
const _EMOTIONS   = ["happiness", "happiness", "neutral", "surprise", "neutral", "happiness"];
const _AD_CATS    = [
  "Cars / Finance", "Gaming / Sports", "Fashion / Beauty", "General Ad",
  "Lifestyle / Travel", "Healthcare / Insurance", "Skincare / Wellness",
  "Health / Home Appliances", "Gaming / Sports", "Fashion / Beauty",
  "General Ad", "Cars / Finance",
];
const _TODAY = new Date(); _TODAY.setHours(0, 0, 0, 0);
const DEMO_HISTORY = Array.from({ length: 48 }, (_, i) => {
  const hour       = Math.floor(i / 2);
  const minute     = (i % 2) * 30;
  const ts         = new Date(_TODAY); ts.setHours(hour, minute, 0, 0);
  // Viewer pattern: low morning, peak midday + evening, low night
  const peakFactor = hour >= 10 && hour <= 13 ? 1.4
                   : hour >= 17 && hour <= 20 ? 1.3
                   : hour >= 0  && hour <= 6  ? 0.3 : 1.0;
  const engRate    = Math.min(1, Math.max(0, 0.55 + Math.cos(i / 5) * 0.2 + (Math.random() - 0.5) * 0.1));
  const happyPct   = Math.min(1, Math.max(0, 0.40 + Math.sin(i / 4) * 0.15 + (Math.random() - 0.5) * 0.1));
  const qualScore  = Math.min(1, engRate * (0.8 + happyPct * 0.7));
  return {
    id: i + 1,
    camera_id: "cam_01",
    timestamp: ts.toISOString(),
    viewer_count:         Math.max(0, Math.round((2.5 + Math.sin(i / 4) * 1.5 + (Math.random() - 0.5)) * peakFactor)),
    engagement_rate:      engRate,
    dominant_ad:          _AD_CATS[i % _AD_CATS.length],
    dominant_emotion:     _EMOTIONS[i % _EMOTIONS.length],
    emotion_happy_pct:    happyPct,
    emotion_neutral_pct:  Math.max(0, 0.35 - happyPct * 0.3),
    emotion_surprise_pct: Math.max(0, 0.10 + (Math.random() - 0.5) * 0.05),
    emotion_negative_pct: Math.max(0, 0.10 + (Math.random() - 0.5) * 0.05),
    engagement_quality:   qualScore,
  };
});

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
  const [showLanding,      setShowLanding]      = useState(true);
  const [connected,        setConnected]        = useState(false);
  const [lastUpdate,       setLastUpdate]       = useState(null);
  const [demoMode,         setDemoMode]         = useState(true);
  const [browserCamActive, setBrowserCamActive] = useState(false);
  const [browserCamLive,   setBrowserCamLive]   = useState(null);
  const [activeTab,      setActiveTab]      = useState("live");
  const [screenName,     setScreenName]     = useState(
    () => localStorage.getItem("screenName") || "Screen 1"
  );
  const [pollInterval,   setPollInterval]   = useState(5_000);
  const [activeCameraId, setActiveCameraId] = useState(null); // null = all cameras
  const [cameras,        setCameras]        = useState([]);   // list from /api/v1/cameras
  const [alerts,         setAlerts]         = useState([]);

  const handleScreenName = (name) => {
    setScreenName(name);
    localStorage.setItem("screenName", name);
  };

  // ── WebSocket real-time connection ───────────────────────────────────────
  // Connects to /ws/live for instant push updates.
  // Falls back to polling when disconnected.
  const wsUrl = demoMode ? null : `${WS_BASE}/ws/live`;
  const { data: wsLive, connected: wsConnected } = useWebSocket(wsUrl);

  // ── Cameras list (fetched once) ──────────────────────────────────────────
  useEffect(() => {
    if (demoMode) return;
    fetchCameras()
      .then((list) => { if (list.length > 0) setCameras(list); })
      .catch(() => {});
  }, [demoMode]);

  // ── Alerts polling (30s) ─────────────────────────────────────────────────
  const alertsFn = useCallback(
    () => demoMode ? Promise.resolve([]) : fetchAlerts(50, activeCameraId),
    [demoMode, activeCameraId]
  );
  const { data: alertsData } = usePolling(alertsFn, 30_000);
  useEffect(() => { if (alertsData) setAlerts(alertsData); }, [alertsData]);

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

  // ── Data polling — also used as fallback when WebSocket is disconnected ──
  const liveFn = useCallback(
    () => demoMode ? Promise.resolve(DEMO_LIVE)    : fetchLive(activeCameraId),
    [demoMode, activeCameraId]
  );
  const histFn = useCallback(
    () => demoMode ? Promise.resolve(DEMO_HISTORY) : fetchHistory(40, activeCameraId),
    [demoMode, activeCameraId]
  );
  const sumFn  = useCallback(
    () => demoMode ? Promise.resolve(DEMO_SUMMARY) : fetchSummary(30, activeCameraId),
    [demoMode, activeCameraId]
  );
  const dwlFn  = useCallback(
    () => demoMode ? Promise.resolve(DEMO_DWELL)   : fetchDwell(20, activeCameraId),
    [demoMode, activeCameraId]
  );

  const { data: polledLive } = usePolling(liveFn, pollInterval);
  const { data: history    } = usePolling(histFn, pollInterval);
  const { data: summary    } = usePolling(sumFn,  Math.max(pollInterval, 10_000));
  const { data: dwell      } = usePolling(dwlFn,  Math.max(pollInterval, 15_000));

  // Browser cam overrides everything when active; otherwise prefer WebSocket, fall back to polling
  const live = browserCamActive && browserCamLive ? browserCamLive : (wsLive ?? polledLive);

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

  // Crowd gender — "Male" / "Female" / "mixed" (from backend confidence threshold)
  const crowdGender    = live?.crowd_gender  ?? "mixed";
  const ageConfident   = live?.age_confident ?? false;
  const dominantGender = crowdGender;

  // Previous window engagement rate — second-to-last row in history
  const prevRate = history && history.length >= 2
    ? history[history.length - 2].engagement_rate
    : null;

  const avgViewers    = summary?.avg_viewer_count != null
    ? summary.avg_viewer_count.toFixed(1) : "—";
  const avgEngagement = summary
    ? `${Math.round(summary.avg_engagement_rate * 100)}%` : "—";

  // Total impressions today — sum of all viewer_count values in history
  const impressionsToday = history && history.length > 0
    ? history.reduce((sum, row) => sum + (row.viewer_count ?? 0), 0)
    : "—";

  // Average dwell time across all recorded sessions
  const avgDwell = dwell && dwell.length > 0
    ? `${Math.round(dwell.reduce((s, d) => s + d.duration_seconds, 0) / dwell.length)}s`
    : "—";

  // Emotion + mood quality
  const dominantEmotion  = live?.dominant_emotion ?? "neutral";
  const engagementQuality = live?.engagement_quality ?? 0;
  const moodScore        = Math.round(engagementQuality * 100);
  const moodIcon = moodScore >= 70 ? "😊" : moodScore >= 40 ? "😐" : "😟";

  // Unique visitors
  const uniqueVisitors  = live?.unique_visitors_session ?? "—";

  // Attention score
  const attentionScore  = live?.avg_attention_score ?? null;
  const attentionColor  = attentionScore >= 70 ? "text-green-400"
                        : attentionScore >= 40 ? "text-yellow-400"
                        : "text-red-400";

  if (showLanding) {
    return <LandingPage onEnterDashboard={() => setShowLanding(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="bg-slate-950 border-b border-slate-800 px-4 py-1.5 flex items-center gap-3">
        <button
          onClick={() => setShowLanding(true)}
          className="text-slate-500 hover:text-white text-xs flex items-center gap-1 transition-colors"
        >
          ← SmartAudience
        </button>
        <span className="text-slate-700 text-xs">/</span>
        <span className="text-slate-400 text-xs">Dashboard</span>
      </div>
      <StatusBar
        connected={connected}
        wsConnected={wsConnected}
        lastUpdate={lastUpdate}
        cameraId={demoMode ? "cam_01 (demo)" : (activeCameraId ?? cameraId)}
        cameras={demoMode ? [] : cameras}
        onCameraChange={setActiveCameraId}
        screenName={screenName}
        demoMode={demoMode}
        onToggleDemo={() => setDemoMode(d => !d)}
      />

      {/* ── Tab navigation ──────────────────────────────────────────────── */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} alertCount={alerts.length} />

      <div className="p-4 md:p-6">

        {/* ══════════════ LIVE VIEW TAB ══════════════ */}
        {activeTab === "live" && (
          <div className="space-y-4">

            {/* Browser camera toggle banner */}
            {!browserCamActive ? (
              <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
                <div>
                  <span className="text-slate-300 text-sm font-medium">No backend connected?</span>
                  <span className="text-slate-500 text-xs ml-2">Use your device camera to drive the live view</span>
                </div>
                <button
                  onClick={() => setBrowserCamActive(true)}
                  className="text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shrink-0"
                  style={{ backgroundColor: "#1e6dd4" }}
                >
                  📷 Use Browser Camera
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-green-400 text-sm font-medium">Browser Camera Active</span>
                  <span className="text-slate-500 text-xs">— live view is updating from your camera</span>
                </div>
                <button
                  onClick={() => { setBrowserCamActive(false); setBrowserCamLive(null); }}
                  className="text-slate-400 hover:text-white text-xs border border-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Stop
                </button>
              </div>
            )}

            {/* Row 0: Ad Recommendation hero — full width, top of page */}
            <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-1 shadow-lg shadow-blue-500/5">
              <div className="rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-blue-400 text-xs font-semibold uppercase tracking-widest">Now Showing — AI-Selected Ad</span>
                </div>
                <AdRecommendation
                  ageGroup={ageGroup}
                  crowdGender={crowdGender}
                  ageConfident={ageConfident}
                  emotion={dominantEmotion}
                  qualityScore={moodScore}
                />
              </div>
            </div>

            {/* Row 1: 9 summary stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-3">
              <StatCard label="Viewers Now"       value={viewers}          icon="👥" highlight="text-green-400"  sub="current snapshot" />
              <StatCard label="Avg Viewers"       value={avgViewers}       icon="📊" highlight="text-blue-400"   sub="last 30 windows" />
              <StatCard label="Avg Engagement"    value={avgEngagement}    icon="🎯" highlight="text-yellow-400" sub="last 30 windows" />
              <StatCard
                label="Attention Score"
                value={attentionScore != null ? attentionScore : "—"}
                icon="🎯"
                highlight={attentionColor}
                sub="how intently watching"
              />
              <StatCard label="Dominant Age"      value={ageGroup}         icon="🎂" highlight="text-purple-400" sub="current audience" />
              <StatCard label="Avg Dwell Time"    value={avgDwell}         icon="⏱️" highlight="text-orange-400" sub={`${dwell?.length ?? 0} sessions`} />
              <StatCard label="Impressions Today" value={impressionsToday} icon="👁️" highlight="text-cyan-400"   sub="total viewers seen" />
              <StatCard
                label="Mood Score"
                value={live ? moodScore : "—"}
                icon={moodIcon}
                highlight={moodScore >= 70 ? "text-green-400" : moodScore >= 40 ? "text-yellow-400" : "text-red-400"}
                sub={live ? dominantEmotion : "no data"}
              />
              <StatCard
                label="Unique Visitors"
                value={uniqueVisitors}
                icon="🪪"
                highlight="text-blue-400"
                sub="since startup"
              />
            </div>

            {/* Row 2: Gender bar + Engagement gauge + Emotion chart */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <GenderBar malePct={malePct} femalePct={femalePct} maleCount={maleCount} femaleCount={femaleCount} crowdGender={crowdGender} />
              <EngagementGauge rate={engRate} prevRate={prevRate} />
              <EmotionChart data={live} dominant={dominantEmotion} />
            </div>

            {/* Row 3: History line chart */}
            <HistoryChart history={history} />

            {/* Row 4: Age breakdown + Dwell chart */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AgeChart data={live} />
              <DwellChart sessions={dwell} />
            </div>

          </div>
        )}

        {/* ══════════════ ALL CAMERAS TAB ══════════════ */}
        {activeTab === "cameras" && (
          <MultiCameraPage
            demoMode={demoMode}
            cameras={cameras}
            onSelectCamera={(id) => { setActiveCameraId(id); setActiveTab("live"); }}
          />
        )}

        {/* ══════════════ TODAY'S ANALYTICS TAB ══════════════ */}
        {activeTab === "analytics" && (
          <AnalyticsPage
            history={history}
            summary={summary}
            dwell={dwell}
            cameraId={activeCameraId}
            exportUrl={exportUrl}
            cameras={demoMode ? ["cam_01","cam_02","cam_03","cam_04"] : cameras}
            demoMode={demoMode}
          />
        )}

        {/* ══════════════ AD PERFORMANCE TAB ══════════════ */}
        {activeTab === "ads" && (
          <AdPerformancePage history={history} />
        )}

        {/* ══════════════ AD GALLERY TAB ══════════════ */}
        {activeTab === "adgallery" && (
          <AdDisplayScreen />
        )}

        {/* ══════════════ ALERTS TAB ══════════════ */}
        {activeTab === "alerts" && (
          <AlertsPanel alerts={alerts} threshold={0.25} />
        )}

        {/* ══════════════ SETTINGS TAB ══════════════ */}
        {activeTab === "settings" && (
          <SettingsPage
            screenName={screenName}
            onScreenName={handleScreenName}
            pollInterval={pollInterval}
            onPollInterval={setPollInterval}
            cameraId={activeCameraId ?? cameraId}
            connected={connected}
          />
        )}

      </div>

      {/* Floating browser camera widget — feeds live view when active */}
      {browserCamActive && (
        <DashboardCamera
          onStats={setBrowserCamLive}
          onStop={() => { setBrowserCamActive(false); setBrowserCamLive(null); }}
        />
      )}
    </div>
  );
}
