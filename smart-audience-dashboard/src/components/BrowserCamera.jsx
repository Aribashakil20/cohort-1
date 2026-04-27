/**
 * BrowserCamera.jsx — Runs full face analysis in the browser
 *
 * Uses face-api.js (TensorFlow.js under the hood) to:
 *   - Detect faces via TinyFaceDetector (fast, lightweight)
 *   - Estimate age + gender per face
 *   - Detect 7 facial expressions per face
 * No backend required. Works on any device with a camera.
 *
 * Models are loaded from jsDelivr CDN (~6MB total, cached after first load).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";

// ── Constants ──────────────────────────────────────────────────────────────────
// Models are bundled in public/models — served as static files, no CDN dependency
const MODEL_URL = "/models";
const GENDER_THRESHOLD = 0.60;
const AGE_THRESHOLD    = 0.60;

// ── Ad logic (mirrors pipeline.py) ────────────────────────────────────────────
function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 24) return "youth";
  if (age <= 40) return "adult";
  if (age <= 60) return "middle_aged";
  return "senior";
}

const AD_MAP = {
  "child-M":       "Toys / Boys Games",
  "child-F":       "Toys / Girls Games",
  "youth-M":       "Gaming / Sports",
  "youth-F":       "Fashion / Beauty",
  "adult-M":       "Cars / Finance",
  "adult-F":       "Lifestyle / Travel",
  "middle_aged-M": "Health / Home Appliances",
  "middle_aged-F": "Skincare / Wellness",
  "senior-M":      "Healthcare / Insurance",
  "senior-F":      "Healthcare / Insurance",
};

const MIXED_AGE_AD = {
  child: "Toys / Boys Games",
  youth: "Gaming / Sports",
  adult: "Lifestyle / Travel",
  middle_aged: "Health / Home Appliances",
  senior: "Healthcare / Insurance",
};

const NEGATIVE_OVERRIDE = {
  child: "Toys / Boys Games",
  youth: "Lifestyle / Travel",
  adult: "Health / Home Appliances",
  middle_aged: "Skincare / Wellness",
  senior: "Healthcare / Insurance",
};

const AD_ICONS = {
  "Toys / Boys Games":       "🚀",
  "Toys / Girls Games":      "🎀",
  "Gaming / Sports":         "🎮",
  "Fashion / Beauty":        "👗",
  "Cars / Finance":          "🚗",
  "Lifestyle / Travel":      "✈️",
  "Health / Home Appliances":"🏠",
  "Skincare / Wellness":     "💆",
  "Healthcare / Insurance":  "🏥",
  "General Ad":              "📢",
};

function getAdCategory(ageGroup, gender, dominantExpr) {
  const isNegative = ["angry", "disgusted", "fearful"].includes(dominantExpr);
  if (isNegative) return NEGATIVE_OVERRIDE[ageGroup] || "General Ad";
  const key = `${ageGroup}-${gender === "male" ? "M" : "F"}`;
  return AD_MAP[key] || "General Ad";
}

// face-api uses different expression keys
const EXPR_LABEL = {
  happy:     "Happy 😊",
  surprised: "Surprised 😮",
  neutral:   "Neutral 😐",
  sad:       "Sad 😢",
  angry:     "Angry 😠",
  disgusted: "Disgusted 🤢",
  fearful:   "Fearful 😨",
};

// ── Compute crowd stats from face-api detections ──────────────────────────────
function computeStats(detections) {
  const total = detections.length;
  if (total === 0) return null;

  const males   = detections.filter(d => d.gender === "male"   && d.genderProbability > 0.6).length;
  const females = detections.filter(d => d.gender === "female" && d.genderProbability > 0.6).length;
  const genderKnown = males + females;

  const malePct   = genderKnown > 0 ? males   / genderKnown : 0;
  const femalePct = genderKnown > 0 ? females / genderKnown : 0;

  const crowdGender =
    malePct   >= GENDER_THRESHOLD ? "male"   :
    femalePct >= GENDER_THRESHOLD ? "female" : "mixed";

  // Age groups
  const ageCounts = {};
  detections.forEach(d => {
    const g = getAgeGroup(Math.round(d.age));
    ageCounts[g] = (ageCounts[g] || 0) + 1;
  });
  const dominantAge    = Object.entries(ageCounts).sort((a,b) => b[1]-a[1])[0][0];
  const dominantAgePct = ageCounts[dominantAge] / total;
  const ageConfident   = dominantAgePct >= AGE_THRESHOLD;

  // Expressions
  const exprTotals = {};
  detections.forEach(d => {
    Object.entries(d.expressions).forEach(([k, v]) => {
      exprTotals[k] = (exprTotals[k] || 0) + v;
    });
  });
  const dominantExpr = Object.entries(exprTotals)
    .sort((a,b) => b[1]-a[1])[0][0];

  // Ad selection
  let adCategory;
  const isNegative = ["angry", "disgusted", "fearful"].includes(dominantExpr);
  if (crowdGender === "mixed" && !ageConfident) {
    adCategory = "General Ad";
  } else if (crowdGender === "mixed") {
    adCategory = isNegative
      ? NEGATIVE_OVERRIDE[dominantAge]
      : MIXED_AGE_AD[dominantAge] || "General Ad";
  } else if (!ageConfident) {
    adCategory = crowdGender === "female" ? "Lifestyle / Travel" : "Gaming / Sports";
  } else {
    adCategory = getAdCategory(dominantAge, crowdGender, dominantExpr);
  }

  const avgAge = Math.round(
    detections.reduce((s, d) => s + d.age, 0) / total
  );

  return {
    total, males, females, malePct, femalePct,
    crowdGender, dominantAge, ageConfident,
    dominantExpr, adCategory, avgAge,
    exprTotals,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatRow({ label, value, color = "text-white" }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`font-semibold text-sm ${color}`}>{value}</span>
    </div>
  );
}

function GenderBar({ malePct, femalePct }) {
  return (
    <div className="mt-1">
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden flex">
        <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${malePct * 100}%` }} />
        <div className="bg-pink-500 h-full transition-all duration-500" style={{ width: `${femalePct * 100}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>Male {Math.round(malePct * 100)}%</span>
        <span>Female {Math.round(femalePct * 100)}%</span>
      </div>
    </div>
  );
}

function ExprBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value * 100}%`, backgroundColor: color }} />
      </div>
      <span className="text-slate-400 w-8 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BrowserCamera({ onClose }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // phase: "loading" | "cam_permission" | "ready" | "model_error" | "cam_error"
  const [phase,    setPhase]    = useState("loading");
  const [camError, setCamError] = useState("");
  const [stats,    setStats]    = useState(null);
  const [running,  setRunning]  = useState(false);

  // ── Start camera (also called by "Try again" button) ─────────────────────
  const startCamera = useCallback(async () => {
    setCamError("");
    setPhase("cam_permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setPhase("ready");
          setRunning(true);
        };
      }
    } catch (err) {
      console.error("Camera error:", err.name, err.message);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCamError("permission");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCamError("notfound");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setCamError("inuse");
      } else {
        setCamError("unknown");
      }
      setPhase("cam_error");
    }
  }, []);

  // ── Load models then immediately start camera ─────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        // Models ready — now request camera
        await startCamera();
      } catch (err) {
        console.error("Model load error:", err);
        setPhase("model_error");
      }
    }
    init();
  }, [startCamera]);

  // ── Cleanup: stop stream on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ── Inference loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    let animId;

    async function detect() {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        animId = requestAnimationFrame(detect);
        return;
      }

      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      faceapi.matchDimensions(canvas, displaySize);

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withAgeAndGender()
        .withFaceExpressions();

      const resized = faceapi.resizeResults(detections, displaySize);

      // Clear and redraw
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      resized.forEach(d => {
        const { x, y, width, height } = d.detection.box;
        const gender = d.gender;
        const color  = gender === "male" ? "#60a5fa" : "#f472b6";

        // Box
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.strokeRect(x, y, width, height);

        // Label
        const label = `${gender} · ${Math.round(d.age)}y`;
        ctx.fillStyle = color;
        ctx.font      = "bold 13px sans-serif";
        ctx.fillText(label, x, y > 16 ? y - 6 : y + 16);
      });

      setStats(computeStats(detections));

      // Run every 800ms
      await new Promise(r => setTimeout(r, 800));
      animId = requestAnimationFrame(detect);
    }

    animId = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(animId);
  }, [running]);

  const handleClose = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    onClose();
  }, [onClose]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs font-bold">SA</div>
          <span className="font-semibold text-white">Live Camera Analysis</span>
          {running && (
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          className="text-slate-400 hover:text-white text-sm border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          ✕ Close
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Camera feed */}
        <div className="flex-1 relative bg-black flex items-center justify-center">
          {phase === "loading" && (
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-slate-400 text-sm">Loading AI models...</div>
              <div className="text-slate-600 text-xs mt-1">First time only — then instant</div>
            </div>
          )}
          {phase === "cam_permission" && (
            <div className="text-center px-8">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-slate-300 text-sm font-semibold mb-1">Waiting for camera permission</div>
              <div className="text-slate-500 text-xs">Click "Allow" when your browser asks</div>
            </div>
          )}
          {phase === "model_error" && (
            <div className="text-center px-8 max-w-xs">
              <div className="text-4xl mb-3">⚠️</div>
              <div className="text-white font-semibold mb-2">Could not load AI models</div>
              <div className="text-slate-400 text-sm mb-4">Check your internet connection and try again.</div>
              <button
                onClick={() => window.location.reload()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-5 py-2 rounded-lg transition-colors"
              >Reload page</button>
            </div>
          )}
          {phase === "cam_error" && (
            <div className="text-center px-8 max-w-xs">
              <div className="text-4xl mb-3">📷</div>
              {camError === "permission" && <>
                <div className="text-white font-semibold mb-2">Camera access blocked</div>
                <div className="text-slate-400 text-sm mb-3">
                  Your browser blocked the camera. To fix it:
                </div>
                <ol className="text-slate-400 text-xs text-left space-y-1.5 mb-4 list-decimal list-inside">
                  <li>Click the <strong className="text-slate-300">camera icon</strong> in the address bar</li>
                  <li>Select <strong className="text-slate-300">Always allow</strong></li>
                  <li>Click the button below</li>
                </ol>
              </>}
              {camError === "notfound" && <>
                <div className="text-white font-semibold mb-2">No camera found</div>
                <div className="text-slate-400 text-sm mb-4">No camera was detected on this device. Plug in a webcam and try again.</div>
              </>}
              {camError === "inuse" && <>
                <div className="text-white font-semibold mb-2">Camera is in use</div>
                <div className="text-slate-400 text-sm mb-4">Another app is using the camera. Close it (e.g. Zoom, Teams) and try again.</div>
              </>}
              {camError === "unknown" && <>
                <div className="text-white font-semibold mb-2">Camera error</div>
                <div className="text-slate-400 text-sm mb-4">Could not start the camera. Make sure this page is served over HTTPS and try again.</div>
              </>}
              <button
                onClick={startCamera}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-5 py-2 rounded-lg transition-colors"
              >Try again</button>
            </div>
          )}
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className={`w-full h-full object-cover ${running ? "" : "hidden"}`}
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {running && !stats && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-400 text-xs bg-slate-900/80 px-3 py-1 rounded-full">
              Position your face in the camera
            </div>
          )}
        </div>

        {/* Stats panel */}
        <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 overflow-y-auto shrink-0">
          {!stats ? (
            <div className="flex items-center justify-center h-full text-slate-600 text-sm p-8 text-center">
              {running ? "Looking for faces..." : "Starting camera..."}
            </div>
          ) : (
            <div className="p-5 space-y-5">

              {/* Viewers */}
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Audience</div>
                <StatRow label="Viewers detected" value={stats.total} color="text-green-400" />
                <StatRow label="Average age"      value={`${stats.avgAge} years`} color="text-purple-400" />
                <StatRow label="Age group"        value={stats.dominantAge.replace("_", " ")} color="text-indigo-400" />
              </div>

              {/* Gender */}
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Gender Split</div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">Crowd gender</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    stats.crowdGender === "male"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                      : stats.crowdGender === "female"
                      ? "bg-pink-500/20 text-pink-300 border-pink-500/30"
                      : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                  }`}>
                    {stats.crowdGender === "mixed" ? "Mixed crowd" : `${stats.crowdGender} majority`}
                  </span>
                </div>
                <GenderBar malePct={stats.malePct} femalePct={stats.femalePct} />
              </div>

              {/* Emotion */}
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Expressions</div>
                <div className="space-y-2">
                  {[
                    { key: "happy",     color: "#34d399" },
                    { key: "surprised", color: "#60a5fa" },
                    { key: "neutral",   color: "#94a3b8" },
                    { key: "angry",     color: "#f87171" },
                    { key: "sad",       color: "#a78bfa" },
                    { key: "disgusted", color: "#fb923c" },
                    { key: "fearful",   color: "#facc15" },
                  ].map(({ key, color }) => {
                    const val = (stats.exprTotals[key] || 0) / stats.total;
                    return (
                      <ExprBar
                        key={key}
                        label={key.charAt(0).toUpperCase() + key.slice(1)}
                        value={val}
                        color={color}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Dominant: <span className="text-slate-300 capitalize">{EXPR_LABEL[stats.dominantExpr] || stats.dominantExpr}</span>
                </div>
              </div>

              {/* Ad Recommendation */}
              <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-xl p-4">
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-3">Recommended Ad</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{AD_ICONS[stats.adCategory] || "📢"}</span>
                  <span className="text-white font-bold text-sm">{stats.adCategory}</span>
                </div>
                <div className="text-slate-500 text-xs">
                  Based on {stats.total} {stats.total === 1 ? "person" : "people"} · {stats.dominantAge.replace("_", " ")} · {stats.crowdGender}
                </div>
                {["angry", "disgusted", "fearful"].includes(stats.dominantExpr) && (
                  <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                    Mood override active
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div className="px-6 py-2 bg-slate-950 border-t border-slate-800 shrink-0">
        <p className="text-slate-600 text-xs text-center">
          Analysis runs entirely in your browser — no video or data is sent anywhere
        </p>
      </div>

    </div>
  );
}
