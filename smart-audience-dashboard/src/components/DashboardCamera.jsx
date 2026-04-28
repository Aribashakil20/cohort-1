/**
 * DashboardCamera.jsx — Floating mini camera that feeds face-api.js results
 * directly into the dashboard Live View tab.
 *
 * Appears as a small draggable-feel widget in the bottom-right of the screen.
 * Runs TinyFaceDetector + ageGender + expressions at ~1fps and calls
 * onStats(liveRow) on every detection cycle so App.jsx can override
 * the live data with browser camera results.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import { resolveAd } from "./adLibrary";

const MODEL_URL        = "/models";
const GENDER_THRESHOLD = 0.60;
const AGE_THRESHOLD    = 0.60;

function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 24) return "youth";
  if (age <= 40) return "adult";
  if (age <= 60) return "middle_aged";
  return "senior";
}

// Map face-api detections → the same shape App.jsx expects from the backend
function toLiveRow(detections) {
  const total = detections.length;
  if (total === 0) {
    return {
      id: Date.now(), camera_id: "browser_cam",
      timestamp: new Date().toISOString(),
      viewer_count: 0, male_count: 0, female_count: 0,
      male_pct: 0, female_pct: 0,
      age_child_pct: 0, age_youth_pct: 0, age_adult_pct: 0,
      age_middle_aged_pct: 0, age_senior_pct: 0,
      dominant_age_group: "adult",
      engagement_rate: 0, dominant_ad: "General Ad",
      crowd_gender: "mixed", age_confident: false,
      avg_attention_score: 0,
      dominant_emotion: "neutral",
      emotion_happy_pct: 0, emotion_neutral_pct: 1,
      emotion_surprise_pct: 0, emotion_negative_pct: 0,
      engagement_quality: 0, new_visitors: 0, unique_visitors_session: 0,
    };
  }

  const males   = detections.filter(d => d.gender === "male"   && d.genderProbability > 0.6).length;
  const females = detections.filter(d => d.gender === "female" && d.genderProbability > 0.6).length;
  const gK      = males + females;
  const malePct = gK > 0 ? males / gK : 0;
  const femPct  = gK > 0 ? females / gK : 0;
  const crowdGender = malePct >= GENDER_THRESHOLD ? "male" : femPct >= GENDER_THRESHOLD ? "female" : "mixed";

  const ageCounts = {};
  detections.forEach(d => {
    const g = getAgeGroup(Math.round(d.age));
    ageCounts[g] = (ageCounts[g] || 0) + 1;
  });
  const domAge     = Object.entries(ageCounts).sort((a,b) => b[1]-a[1])[0][0];
  const ageConfident = ageCounts[domAge] / total >= AGE_THRESHOLD;

  const exprTotals = {};
  detections.forEach(d => {
    Object.entries(d.expressions).forEach(([k,v]) => { exprTotals[k] = (exprTotals[k]||0)+v; });
  });
  const domExpr = Object.entries(exprTotals).sort((a,b)=>b[1]-a[1])[0][0];

  const { ad } = resolveAd(crowdGender, domAge, ageConfident, domExpr);
  const isNeg   = ["angry","disgusted","fearful"].includes(domExpr);
  const happyV  = (exprTotals.happy     || 0) / total;
  const neutralV= (exprTotals.neutral   || 0) / total;
  const surprV  = (exprTotals.surprised || 0) / total;
  const negV    = ((exprTotals.angry||0)+(exprTotals.disgusted||0)+(exprTotals.fearful||0)) / total;
  const engQ    = Math.min(1, (happyV * 1.2 + neutralV * 0.6 + surprV * 0.8 - negV * 0.5));

  return {
    id: Date.now(), camera_id: "browser_cam",
    timestamp: new Date().toISOString(),
    viewer_count: total, male_count: males, female_count: females,
    male_pct: malePct, female_pct: femPct,
    age_child_pct:       (ageCounts.child       || 0) / total,
    age_youth_pct:       (ageCounts.youth       || 0) / total,
    age_adult_pct:       (ageCounts.adult       || 0) / total,
    age_middle_aged_pct: (ageCounts.middle_aged || 0) / total,
    age_senior_pct:      (ageCounts.senior      || 0) / total,
    dominant_age_group: domAge,
    engagement_rate: total > 0 ? 0.65 + engQ * 0.25 : 0,
    dominant_ad: ad?.brand || "General Ad",
    crowd_gender: crowdGender,
    age_confident: ageConfident,
    avg_attention_score: total > 0 ? Math.round(60 + engQ * 35) : 0,
    dominant_emotion: domExpr,
    emotion_happy_pct:    happyV,
    emotion_neutral_pct:  neutralV,
    emotion_surprise_pct: surprV,
    emotion_negative_pct: negV,
    engagement_quality: Math.max(0, engQ),
    new_visitors: total,
    unique_visitors_session: total,
  };
}

export default function DashboardCamera({ onStats, onStop }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [phase,    setPhase]    = useState("loading"); // loading | running | error
  const [minimised,setMinimised]= useState(false);
  const [faceCount,setFaceCount]= useState(0);

  // ── Load models + start camera ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        if (cancelled) return;
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (cancelled) { stream.getTracks().forEach(t=>t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => { if (!cancelled) setPhase("running"); };
        }
      } catch { if (!cancelled) setPhase("error"); }
    }
    init();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Cleanup: stop stream on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  // ── Inference loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    let active = true;

    async function detect() {
      while (active) {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState >= 2) {
          const displaySize = { width: video.videoWidth, height: video.videoHeight };
          faceapi.matchDimensions(canvas, displaySize);

          const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
            .withAgeAndGender()
            .withFaceExpressions();

          const resized = faceapi.resizeResults(detections, displaySize);
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          resized.forEach(d => {
            const { x, y, width, height } = d.detection.box;
            const color = d.gender === "male" ? "#60a5fa" : "#f472b6";
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
            // counter-flip for readable labels
            ctx.save();
            ctx.scale(-1,1); ctx.translate(-canvas.width,0);
            ctx.fillStyle = color; ctx.font = "bold 11px sans-serif";
            ctx.fillText(`${d.gender[0].toUpperCase()} ${Math.round(d.age)}`, canvas.width - x - width, y > 14 ? y - 4 : y + 14);
            ctx.restore();
          });

          setFaceCount(detections.length);
          onStats(toLiveRow(detections));
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    detect();
    return () => { active = false; };
  }, [phase, onStats]);

  const handleStop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    onStop();
  }, [onStop]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-1">
      {/* Control bar */}
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
        <span className="flex items-center gap-1.5 text-xs text-green-400">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          Browser Camera
        </span>
        {phase === "running" && (
          <span className="text-xs text-slate-400">{faceCount} face{faceCount !== 1 ? "s" : ""}</span>
        )}
        <button
          onClick={() => setMinimised(m => !m)}
          className="text-slate-400 hover:text-white text-xs px-2 py-0.5 border border-slate-700 rounded-lg transition-colors"
        >
          {minimised ? "Show" : "Hide"}
        </button>
        <button
          onClick={handleStop}
          className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 border border-red-800 rounded-lg transition-colors"
        >
          Stop
        </button>
      </div>

      {/* Video feed */}
      {!minimised && (
        <div className="relative w-48 h-36 bg-black rounded-xl overflow-hidden border border-slate-700 shadow-xl">
          {phase === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-500 text-xs">Loading…</span>
            </div>
          )}
          {phase === "error" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-slate-500 text-xs text-center px-3">Camera unavailable</span>
            </div>
          )}
          <video
            ref={videoRef} autoPlay playsInline muted
            className={`w-full h-full object-cover ${phase === "running" ? "" : "hidden"}`}
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      )}
    </div>
  );
}
