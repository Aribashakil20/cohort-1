/**
 * MultiCameraPage.jsx — Grid of all camera feeds with live stats per camera.
 *
 * In demo mode: renders 4 realistic fake cameras.
 * In live mode: fetches per-camera live data from the backend.
 *
 * Props:
 *   demoMode       — bool
 *   cameras        — string[] from /api/v1/cameras
 *   onSelectCamera — called with camera_id when user clicks "View Live"
 */

import { useState, useEffect } from "react";
import { fetchLive } from "../api";
import { resolveAd } from "./adLibrary";

// ── Demo camera snapshots ─────────────────────────────────────────────────────
const DEMO_CAMERAS = [
  {
    camera_id: "cam_01", location: "Mall Entrance", status: "live",
    viewer_count: 8,  crowd_gender: "mixed",  dominant_age_group: "adult",
    male_pct: 0.52, female_pct: 0.48, engagement_rate: 0.72,
    avg_attention_score: 68, dominant_emotion: "happiness",
    age_confident: true, unique_visitors_session: 34,
  },
  {
    camera_id: "cam_02", location: "Food Court", status: "live",
    viewer_count: 14, crowd_gender: "male",   dominant_age_group: "youth",
    male_pct: 0.71, female_pct: 0.29, engagement_rate: 0.61,
    avg_attention_score: 55, dominant_emotion: "neutral",
    age_confident: true, unique_visitors_session: 58,
  },
  {
    camera_id: "cam_03", location: "Clothing Store", status: "live",
    viewer_count: 6,  crowd_gender: "female", dominant_age_group: "adult",
    male_pct: 0.22, female_pct: 0.78, engagement_rate: 0.84,
    avg_attention_score: 81, dominant_emotion: "happiness",
    age_confident: true, unique_visitors_session: 21,
  },
  {
    camera_id: "cam_04", location: "Electronics Zone", status: "idle",
    viewer_count: 2,  crowd_gender: "male",   dominant_age_group: "youth",
    male_pct: 0.80, female_pct: 0.20, engagement_rate: 0.45,
    avg_attention_score: 39, dominant_emotion: "neutral",
    age_confident: false, unique_visitors_session: 9,
  },
];

function statusDot(status, viewers) {
  if (viewers === 0) return { color: "bg-slate-600", label: "Empty" };
  if (status === "idle") return { color: "bg-yellow-400", label: "Idle" };
  return { color: "bg-green-400 animate-pulse", label: "Live" };
}

function attentionColor(score) {
  if (score >= 70) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

function CameraCard({ cam, onSelect }) {
  const { ad } = resolveAd(cam.crowd_gender, cam.dominant_age_group, cam.age_confident, cam.dominant_emotion);
  const dot = statusDot(cam.status, cam.viewer_count);
  const engPct = Math.round((cam.engagement_rate ?? 0) * 100);
  const malePct = Math.round((cam.male_pct ?? 0) * 100);
  const femPct  = Math.round((cam.female_pct ?? 0) * 100);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-4 hover:border-slate-500 transition-colors">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`w-2 h-2 rounded-full ${dot.color}`} />
            <span className="text-white font-semibold text-sm">{cam.location ?? cam.camera_id}</span>
          </div>
          <div className="text-slate-500 text-xs">{cam.camera_id} · {dot.label}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{cam.viewer_count}</div>
          <div className="text-slate-500 text-xs">viewers</div>
        </div>
      </div>

      {/* Gender bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Male {malePct}%</span>
          <span>Female {femPct}%</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-slate-700">
          <div className="bg-blue-500 h-full transition-all" style={{ width: `${malePct}%` }} />
          <div className="bg-pink-500 h-full transition-all" style={{ width: `${femPct}%` }} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-700/50 rounded-lg px-2 py-2 text-center">
          <div className="text-green-400 font-bold text-sm">{engPct}%</div>
          <div className="text-slate-500 text-[10px]">Engagement</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg px-2 py-2 text-center">
          <div className={`font-bold text-sm ${attentionColor(cam.avg_attention_score)}`}>{cam.avg_attention_score}</div>
          <div className="text-slate-500 text-[10px]">Attention</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg px-2 py-2 text-center">
          <div className="text-indigo-400 font-bold text-sm">{cam.unique_visitors_session}</div>
          <div className="text-slate-500 text-[10px]">Unique</div>
        </div>
      </div>

      {/* Age + emotion */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="capitalize bg-slate-700 px-2 py-0.5 rounded-full">{cam.dominant_age_group}</span>
        <span className="capitalize bg-slate-700 px-2 py-0.5 rounded-full">{cam.dominant_emotion}</span>
      </div>

      {/* Ad recommendation */}
      <div
        className="rounded-lg px-3 py-2 flex items-center gap-2 border"
        style={{ background: `${ad?.color ?? "#64748b"}11`, borderColor: `${ad?.color ?? "#64748b"}33` }}
      >
        <span className="text-xl">{ad?.icon ?? "📢"}</span>
        <div className="min-w-0">
          <div className="text-white text-xs font-semibold truncate">{ad?.brand ?? "General Ad"}</div>
          <div className="text-slate-400 text-[10px] truncate">"{ad?.headline}"</div>
        </div>
      </div>

      {/* View live button */}
      <button
        onClick={() => onSelect(cam.camera_id)}
        className="w-full text-xs font-semibold py-2 rounded-lg border transition-colors"
        style={{ background: "#1e6dd420", color: "#60a5fa", borderColor: "#1e6dd440" }}
      >
        View Live →
      </button>
    </div>
  );
}

export default function MultiCameraPage({ demoMode, cameras = [], onSelectCamera }) {
  const [liveCams, setLiveCams] = useState([]);
  const [loading,  setLoading]  = useState(false);

  // ── In live mode: fetch latest snapshot per camera ────────────────────────
  useEffect(() => {
    if (demoMode || cameras.length === 0) return;
    setLoading(true);
    Promise.all(cameras.map((id) => fetchLive(id).catch(() => null)))
      .then((results) => {
        setLiveCams(results.filter(Boolean));
        setLoading(false);
      });
  }, [demoMode, cameras]);

  const displayCams = demoMode ? DEMO_CAMERAS : liveCams;

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalViewers  = displayCams.reduce((s, c) => s + (c.viewer_count ?? 0), 0);
  const totalUnique   = displayCams.reduce((s, c) => s + (c.unique_visitors_session ?? 0), 0);
  const avgEngagement = displayCams.length > 0
    ? Math.round(displayCams.reduce((s, c) => s + (c.engagement_rate ?? 0), 0) / displayCams.length * 100)
    : 0;
  const activeCams    = displayCams.filter((c) => (c.viewer_count ?? 0) > 0).length;

  return (
    <div className="space-y-5">

      {/* ── Summary bar ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Cameras",    value: activeCams,    sub: `of ${displayCams.length} total`,     color: "text-green-400" },
          { label: "Total Viewers Now", value: totalViewers,  sub: "across all screens",                  color: "text-cyan-400"  },
          { label: "Total Unique",      value: totalUnique,   sub: "since session start",                 color: "text-blue-400"},
          { label: "Avg Engagement",    value: `${avgEngagement}%`, sub: "across all cameras",            color: "text-yellow-400"},
        ].map((t) => (
          <div key={t.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-slate-400 text-xs mb-1">{t.label}</div>
            <div className={`text-2xl font-bold ${t.color}`}>{t.value}</div>
            <div className="text-slate-500 text-xs mt-1">{t.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Camera grid ───────────────────────────────────────────── */}
      {loading && (
        <div className="text-slate-500 text-sm text-center py-10">Loading camera data…</div>
      )}

      {!loading && displayCams.length === 0 && (
        <div className="text-slate-500 text-sm text-center py-10">
          No camera data available. Start the backend to see live feeds.
        </div>
      )}

      {!loading && displayCams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {displayCams.map((cam) => (
            <CameraCard key={cam.camera_id} cam={cam} onSelect={onSelectCamera} />
          ))}
        </div>
      )}

    </div>
  );
}
