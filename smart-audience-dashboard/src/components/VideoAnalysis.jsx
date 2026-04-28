/**
 * VideoAnalysis.jsx — Record or upload a video and analyse it with face-api.js
 *
 * Features:
 *   1. Record from camera or upload a video file
 *   2. AI processes frame-by-frame (1 fps) with progress bar
 *   3. Timeline chart — faces detected per second (audience flow)
 *   4. Age breakdown chart — distribution across age groups
 *   5. Download summary — exports a text report
 */

import { useState, useRef, useEffect, useCallback } from "react";
import * as faceapi from "face-api.js";
import {
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { AD_LIBRARY, resolveAd } from "./adLibrary";

const MODEL_URL    = "/models";
const AGE_ORDER    = ["child", "youth", "adult", "middle_aged", "senior"];
const AGE_COLORS   = { child: "#a78bfa", youth: "#60a5fa", adult: "#34d399", middle_aged: "#fb923c", senior: "#f87171" };
const GENDER_THRESHOLD = 0.60;
const AGE_THRESHOLD    = 0.60;

function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 24) return "youth";
  if (age <= 40) return "adult";
  if (age <= 60) return "middle_aged";
  return "senior";
}

function computeStats(allDetections) {
  const total = allDetections.length;
  if (total === 0) return null;

  const males       = allDetections.filter(d => d.gender === "male"   && d.genderProbability > 0.6).length;
  const females     = allDetections.filter(d => d.gender === "female" && d.genderProbability > 0.6).length;
  const genderKnown = males + females;
  const malePct     = genderKnown > 0 ? males   / genderKnown : 0;
  const femalePct   = genderKnown > 0 ? females / genderKnown : 0;
  const crowdGender = malePct >= GENDER_THRESHOLD ? "male" : femalePct >= GENDER_THRESHOLD ? "female" : "mixed";

  const ageCounts = {};
  allDetections.forEach(d => {
    const g = getAgeGroup(Math.round(d.age));
    ageCounts[g] = (ageCounts[g] || 0) + 1;
  });
  const dominantAge  = Object.entries(ageCounts).sort((a,b) => b[1]-a[1])[0][0];
  const ageConfident = ageCounts[dominantAge] / total >= AGE_THRESHOLD;

  const exprTotals = {};
  allDetections.forEach(d => {
    Object.entries(d.expressions).forEach(([k, v]) => { exprTotals[k] = (exprTotals[k] || 0) + v; });
  });
  const dominantExpr = Object.entries(exprTotals).sort((a,b) => b[1]-a[1])[0][0];
  const avgAge       = Math.round(allDetections.reduce((s, d) => s + d.age, 0) / total);

  const { key: adKey, ad, moodOverride } = resolveAd(crowdGender, dominantAge, ageConfident, dominantExpr);
  return { total, males, females, malePct, femalePct, crowdGender, dominantAge, ageConfident, dominantExpr, avgAge, exprTotals, ageCounts, adKey, ad, moodOverride };
}

// ── Compute per-ad performance from per-frame timeline ────────────────────────
function computeAdPerf(frameTimeline) {
  // frameTimeline: [{ t, count, males, females, adKey, ad }]
  const perf = {};
  frameTimeline.forEach(f => {
    if (!f.adKey || f.count === 0) return;
    if (!perf[f.adKey]) perf[f.adKey] = { ad: f.ad, totalViewers: 0, males: 0, females: 0, seconds: 0 };
    perf[f.adKey].totalViewers += f.count;
    perf[f.adKey].males        += f.males  || 0;
    perf[f.adKey].females      += f.females || 0;
    perf[f.adKey].seconds      += 1;
  });
  return perf;
}

// ── Process video frame-by-frame, return detections + rich timeline ───────────
async function analyzeVideoElement(videoEl, onProgress) {
  const duration = isFinite(videoEl.duration) ? videoEl.duration : 0;
  if (duration === 0) return { detections: [], timeline: [] };

  const STEP  = 1;
  const steps = Math.floor(duration / STEP);
  const allDetections = [];
  const timeline = [];

  for (let i = 0; i <= steps; i++) {
    videoEl.currentTime = i * STEP;
    await new Promise(res => { videoEl.onseeked = res; });

    const dets = await faceapi
      .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
      .withAgeAndGender()
      .withFaceExpressions();

    allDetections.push(...dets);

    // Per-frame demographics for ad attribution
    const males   = dets.filter(d => d.gender === "male"   && d.genderProbability > 0.6).length;
    const females = dets.filter(d => d.gender === "female" && d.genderProbability > 0.6).length;
    const gK      = males + females;
    const cg      = gK > 0 ? (males / gK >= 0.6 ? "male" : females / gK >= 0.6 ? "female" : "mixed") : "mixed";
    const agCounts = {};
    dets.forEach(d => { const g = getAgeGroup(Math.round(d.age)); agCounts[g] = (agCounts[g]||0)+1; });
    const domAge = dets.length > 0 ? Object.entries(agCounts).sort((a,b)=>b[1]-a[1])[0][0] : "adult";
    const ageC   = dets.length > 0 && agCounts[domAge] / dets.length >= 0.6;
    const exprT  = {};
    dets.forEach(d => Object.entries(d.expressions).forEach(([k,v]) => { exprT[k]=(exprT[k]||0)+v; }));
    const domExpr = dets.length > 0 ? Object.entries(exprT).sort((a,b)=>b[1]-a[1])[0][0] : "neutral";
    const { key: adKey, ad } = dets.length > 0 ? resolveAd(cg, domAge, ageC, domExpr) : { key: null, ad: null };

    timeline.push({ t: i, count: dets.length, label: `${i}s`, males, females, adKey, ad });
    onProgress(Math.round(((i + 1) / (steps + 1)) * 100));
  }
  return { detections: allDetections, timeline };
}

// ── Download summary as a text report ─────────────────────────────────────────
function downloadSummary(rec) {
  const s = rec.stats;
  const lines = [
    "SmartAudience — Recording Analysis Report",
    "==========================================",
    `Recording : ${rec.index}`,
    `Location  : ${rec.location}`,
    `Date      : ${rec.timestamp}`,
    `Duration  : ${rec.duration}s`,
    "",
    "AUDIENCE SUMMARY",
    "----------------",
    `Total face detections : ${s.total}`,
    `Average age           : ${s.avgAge} years`,
    `Dominant age group    : ${s.dominantAge.replace("_", " ")}`,
    `Peak viewers          : ${rec.peakViewers}`,
    "",
    "GENDER SPLIT",
    "------------",
    `Male              : ${Math.round(s.malePct * 100)}%`,
    `Female            : ${Math.round(s.femalePct * 100)}%`,
    `Classification    : ${s.crowdGender} crowd`,
    "",
    "AGE BREAKDOWN",
    "-------------",
    ...AGE_ORDER.filter(g => s.ageCounts[g]).map(g =>
      `${g.padEnd(12)}: ${s.ageCounts[g]} detections (${Math.round(s.ageCounts[g] / s.total * 100)}%)`
    ),
    "",
    "AD RECOMMENDATION",
    "-----------------",
    `Recommended ad : ${s.ad?.brand || "General"}`,
    `Tagline        : "${s.ad?.headline || ""}"`,
    `Reasoning      : ${s.dominantAge.replace("_"," ")} · ${s.crowdGender} crowd · mood: ${s.dominantExpr}`,
    `Target         : ${s.ad?.target || "General audience"}`,
    "",
    "AD PERFORMANCE BY SEGMENT",
    "-------------------------",
    ...Object.entries(rec.adPerf || {})
      .sort((a,b) => b[1].totalViewers - a[1].totalViewers)
      .map(([k, p]) => `${p.ad.brand.padEnd(20)}: ${p.totalViewers} views · ${p.seconds}s on screen · ${Math.round((p.males/p.totalViewers)*100)||0}% male`),
    "",
    "──────────────────────────────────────────",
    "Generated by SmartAudience",
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `smartaudience-${rec.index}-${rec.location.replace(/\s+/g, "-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Chart sub-components ───────────────────────────────────────────────────────
function TimelineChart({ timeline }) {
  if (!timeline?.length) return null;
  return (
    <div>
      <div className="text-slate-500 text-xs uppercase tracking-widest mb-2">
        Audience flow — faces per second
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={timeline} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="tl-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#818cf8" stopOpacity={0}   />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fill: "#475569", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#818cf8" }}
            formatter={v => [`${v} faces`, ""]}
          />
          <Area type="monotone" dataKey="count" stroke="#818cf8" strokeWidth={2} fill="url(#tl-grad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AgeBreakdown({ ageCounts, total }) {
  if (!ageCounts) return null;
  const groups = AGE_ORDER.filter(g => ageCounts[g]);
  if (!groups.length) return null;
  return (
    <div>
      <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Age breakdown</div>
      <div className="space-y-2">
        {groups.map(g => {
          const pct = Math.round((ageCounts[g] / total) * 100);
          return (
            <div key={g} className="flex items-center gap-3">
              <span className="text-slate-400 text-xs w-20 shrink-0 capitalize">{g.replace("_"," ")}</span>
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: AGE_COLORS[g] }}
                />
              </div>
              <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VideoAnalysis({ onClose, onRecordingComplete, recordingIndex }) {
  const [modelsReady,  setModelsReady]  = useState(false);
  const [modelError,   setModelError]   = useState(false);
  const [location,     setLocation]     = useState("");
  const [mode,         setMode]         = useState("idle"); // idle|recording|stopping|processing|done|error
  const [progress,     setProgress]     = useState(0);
  const [recordingSec, setRecordingSec] = useState(0);
  const [result,       setResult]       = useState(null);

  const liveVideoRef = useRef(null);
  const streamRef    = useRef(null);
  const recorderRef  = useRef(null);
  const chunksRef    = useRef([]);
  const timerRef     = useRef(null);
  const fileInputRef = useRef(null);

  // ── Load models ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsReady(true);
      } catch { setModelError(true); }
    }
    load();
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Record from camera ────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (liveVideoRef.current) { liveVideoRef.current.srcObject = stream; liveVideoRef.current.play(); }
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(200);
      setMode("recording");
      setRecordingSec(0);
      timerRef.current = setInterval(() => setRecordingSec(s => s + 1), 1000);
    } catch { setMode("error"); }
  }, []);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    setMode("stopping");
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    recorderRef.current.onstop = async () => {
      await processBlob(new Blob(chunksRef.current, { type: "video/webm" }));
    };
  }, []); // eslint-disable-line

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMode("processing");
    setProgress(0);
    await processBlob(file);
  }, []); // eslint-disable-line

  // ── Core processing ───────────────────────────────────────────────────────
  async function processBlob(blob) {
    setMode("processing");
    setProgress(0);
    const url   = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = url; video.muted = true; video.preload = "auto";
    try {
      await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = rej; });
      const { detections, timeline } = await analyzeVideoElement(video, setProgress);
      URL.revokeObjectURL(url);

      const stats       = computeStats(detections);
      const adPerf      = computeAdPerf(timeline);
      const peakViewers = timeline.length ? Math.max(...timeline.map(t => t.count)) : 0;
      const recording   = {
        id: Date.now(), index: recordingIndex,
        location:  location.trim() || "Unknown location",
        timestamp: new Date().toLocaleString(),
        duration:  Math.round(video.duration),
        peakViewers, timeline, adPerf, stats,
      };
      setResult(recording);
      onRecordingComplete(recording);
      setMode("done");
    } catch {
      URL.revokeObjectURL(url);
      setMode("error");
    }
  }

  const fmtSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs font-bold">SA</div>
            <span className="font-semibold text-white">Recording {recordingIndex}</span>
            {mode === "recording" && (
              <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" /> REC {fmtSec(recordingSec)}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors">
            ✕ Close
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Model loading / error */}
          {!modelsReady && !modelError && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-slate-400 text-sm">Loading AI models...</div>
            </div>
          )}
          {modelError && <div className="text-center py-8 text-slate-400 text-sm">Failed to load models. Check your connection and refresh.</div>}

          {modelsReady && mode !== "done" && (
            <>
              {/* Location */}
              <div>
                <label className="block text-slate-400 text-xs uppercase tracking-widest mb-2">Location label</label>
                <input
                  type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Mall Entrance, Food Court, Gate 3…"
                  disabled={mode !== "idle"}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              {/* Idle — pick mode */}
              {mode === "idle" && (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={startRecording} className="flex flex-col items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/40 rounded-xl p-5 transition-all">
                    <span className="text-3xl">🎥</span>
                    <div className="text-center">
                      <div className="text-white font-semibold text-sm">Record from camera</div>
                      <div className="text-slate-500 text-xs mt-0.5">Live recording via webcam</div>
                    </div>
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/40 rounded-xl p-5 transition-all">
                    <span className="text-3xl">📁</span>
                    <div className="text-center">
                      <div className="text-white font-semibold text-sm">Upload video file</div>
                      <div className="text-slate-500 text-xs mt-0.5">MP4, WebM, MOV…</div>
                    </div>
                  </button>
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                </div>
              )}

              {/* Recording — live preview */}
              {mode === "recording" && (
                <div className="space-y-3">
                  <video ref={liveVideoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black" style={{ transform: "scaleX(-1)", maxHeight: "220px", objectFit: "cover" }} />
                  <button onClick={stopRecording} className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                    <span className="w-3 h-3 bg-white rounded-sm" /> Stop & Analyse
                  </button>
                </div>
              )}

              {/* Processing */}
              {(mode === "stopping" || mode === "processing") && (
                <div className="py-6 space-y-4">
                  <div className="text-center text-slate-300 text-sm font-medium">
                    {mode === "stopping" ? "Preparing video…" : `Analysing frames… ${progress}%`}
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-center text-slate-500 text-xs">Processing 1 frame per second — this may take a moment</div>
                </div>
              )}

              {mode === "error" && <div className="text-center text-slate-400 text-sm py-4">Something went wrong. Make sure the file is a valid video and try again.</div>}
            </>
          )}

          {/* Done — full results */}
          {mode === "done" && result?.stats && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                  <span>✓</span> Analysis complete — {result.location}
                </div>
                <button
                  onClick={() => downloadSummary(result)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
                >
                  ⬇ Download report
                </button>
              </div>

              {/* Key numbers */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Detections", value: result.stats.total,    color: "text-green-400"  },
                  { label: "Peak viewers", value: result.peakViewers,  color: "text-yellow-400" },
                  { label: "Avg age",     value: result.stats.avgAge,  color: "text-purple-400" },
                  { label: "Duration",    value: `${result.duration}s`,color: "text-indigo-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-800 rounded-xl p-3 text-center">
                    <div className={`font-bold text-xl ${color}`}>{value}</div>
                    <div className="text-slate-500 text-xs mt-0.5 leading-tight">{label}</div>
                  </div>
                ))}
              </div>

              {/* Timeline chart */}
              <div className="bg-slate-800 rounded-xl p-4">
                <TimelineChart timeline={result.timeline} />
              </div>

              {/* Age breakdown */}
              <div className="bg-slate-800 rounded-xl p-4">
                <AgeBreakdown ageCounts={result.stats.ageCounts} total={result.stats.total} />
              </div>

              {/* Gender */}
              <div className="bg-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-400 text-sm">Gender split</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    result.stats.crowdGender === "male"   ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                    result.stats.crowdGender === "female" ? "bg-pink-500/20 text-pink-300 border-pink-500/30" :
                    "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                  }`}>
                    {result.stats.crowdGender === "mixed" ? "Mixed crowd" : `${result.stats.crowdGender} majority`}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden flex">
                  <div className="bg-blue-500 h-full" style={{ width: `${result.stats.malePct * 100}%` }} />
                  <div className="bg-pink-500 h-full" style={{ width: `${result.stats.femalePct * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Male {Math.round(result.stats.malePct * 100)}%</span>
                  <span>Female {Math.round(result.stats.femalePct * 100)}%</span>
                </div>
              </div>

              {/* Overall ad recommendation */}
              {result.stats?.ad && (
                <div className="rounded-xl p-4 border" style={{ background: `${result.stats.ad.color}12`, borderColor: `${result.stats.ad.color}30` }}>
                  <div className="text-xs uppercase tracking-widest mb-2" style={{ color: result.stats.ad.color }}>Overall Ad Recommendation</div>
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{result.stats.ad.icon}</span>
                    <div>
                      <div className="text-white font-bold">{result.stats.ad.brand}</div>
                      <div className="text-slate-300 text-xs italic mt-0.5">"{result.stats.ad.headline}"</div>
                      <div className="text-slate-500 text-xs mt-1">{result.stats.ad.description}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    Targeting <span className="text-slate-200 font-medium">{result.stats.ad.target}</span>
                    {result.stats.moodOverride && <span className="ml-2 text-amber-400">⚡ mood override</span>}
                  </div>
                </div>
              )}

              {/* Per-ad performance breakdown */}
              {result.adPerf && Object.keys(result.adPerf).length > 0 && (
                <div>
                  <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Ad performance · by audience segment</div>
                  <div className="space-y-3">
                    {Object.entries(result.adPerf)
                      .sort((a, b) => b[1].totalViewers - a[1].totalViewers)
                      .map(([key, p]) => {
                        const malePct = p.totalViewers > 0 ? Math.round((p.males / p.totalViewers) * 100) : 0;
                        const avgV    = p.seconds > 0 ? (p.totalViewers / p.seconds).toFixed(1) : 0;
                        return (
                          <div key={key} className="bg-slate-800 rounded-xl p-3">
                            <div className="flex items-start gap-3 mb-2">
                              <span className="text-2xl">{p.ad.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-bold text-sm">{p.ad.brand}</div>
                                <div className="text-slate-400 text-xs italic">"{p.ad.headline}"</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              <div className="text-center">
                                <div className="text-green-400 font-bold text-sm">{p.totalViewers}</div>
                                <div className="text-slate-600 text-xs">total views</div>
                              </div>
                              <div className="text-center">
                                <div className="text-blue-400 font-bold text-sm">{p.seconds}s</div>
                                <div className="text-slate-600 text-xs">on screen</div>
                              </div>
                              <div className="text-center">
                                <div className="text-yellow-400 font-bold text-sm">{avgV}</div>
                                <div className="text-slate-600 text-xs">avg viewers</div>
                              </div>
                            </div>
                            <div className="text-xs text-slate-500">
                              Reached <span className="text-slate-300">{p.totalViewers} {p.ad.reachDesc}</span> · {malePct}% male · {100 - malePct}% female
                            </div>
                            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden flex mt-2">
                              <div className="bg-blue-500 h-full" style={{ width: `${malePct}%` }} />
                              <div className="bg-pink-500 h-full" style={{ width: `${100 - malePct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                View recording card ↓
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 border-t border-slate-800 shrink-0">
          <p className="text-slate-600 text-xs text-center">No video or data is sent anywhere — analysis runs entirely in your browser</p>
        </div>
      </div>
    </div>
  );
}
