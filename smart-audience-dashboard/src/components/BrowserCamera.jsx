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
import { AD_LIBRARY, resolveAd } from "./adLibrary";
import AdRecommendation from "./AdRecommendation";

const MODEL_URL        = "/models";
const GENDER_THRESHOLD = 0.60;
const AGE_THRESHOLD    = 0.60;

const EXPR_LABEL = {
  happy: "Happy 😊", surprised: "Surprised 😮", neutral: "Neutral 😐",
  sad: "Sad 😢", angry: "Angry 😠", disgusted: "Disgusted 🤢", fearful: "Fearful 😨",
};

function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 24) return "youth";
  if (age <= 40) return "adult";
  if (age <= 60) return "middle_aged";
  return "senior";
}

function computeStats(detections) {
  const total = detections.length;
  if (total === 0) return null;

  const males       = detections.filter(d => d.gender === "male"   && d.genderProbability > 0.6).length;
  const females     = detections.filter(d => d.gender === "female" && d.genderProbability > 0.6).length;
  const genderKnown = males + females;
  const malePct     = genderKnown > 0 ? males   / genderKnown : 0;
  const femalePct   = genderKnown > 0 ? females / genderKnown : 0;
  const crowdGender = malePct >= GENDER_THRESHOLD ? "male" : femalePct >= GENDER_THRESHOLD ? "female" : "mixed";

  const ageCounts = {};
  detections.forEach(d => {
    const g = getAgeGroup(Math.round(d.age));
    ageCounts[g] = (ageCounts[g] || 0) + 1;
  });
  const dominantAge  = Object.entries(ageCounts).sort((a,b) => b[1]-a[1])[0][0];
  const ageConfident = ageCounts[dominantAge] / total >= AGE_THRESHOLD;

  const exprTotals = {};
  detections.forEach(d => {
    Object.entries(d.expressions).forEach(([k, v]) => { exprTotals[k] = (exprTotals[k] || 0) + v; });
  });
  const dominantExpr = Object.entries(exprTotals).sort((a,b) => b[1]-a[1])[0][0];
  const avgAge = Math.round(detections.reduce((s, d) => s + d.age, 0) / total);

  const { key: adKey, ad, moodOverride } = resolveAd(crowdGender, dominantAge, ageConfident, dominantExpr);

  return { total, males, females, malePct, femalePct, crowdGender, dominantAge, ageConfident, dominantExpr, avgAge, exprTotals, adKey, ad, moodOverride };
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

  const [phase,    setPhase]    = useState("loading");
  const [camError, setCamError] = useState("");
  const [stats,    setStats]    = useState(null);
  const [running,  setRunning]  = useState(false);
  // adPerf: { [adKey]: { ad, totalViewers, males, females, frames } }
  const [adPerf,   setAdPerf]   = useState({});

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

        // Label — canvas is CSS-flipped (scaleX -1), so counter-flip context
        // to draw readable text at the correct visual position
        const label = `${gender} · ${Math.round(d.age)}y`;
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.fillStyle = color;
        ctx.font      = "bold 13px sans-serif";
        // mirror x: visual left of box = canvas.width - x - width
        const textX = canvas.width - x - width;
        ctx.fillText(label, textX, y > 16 ? y - 6 : y + 16);
        ctx.restore();
      });

      const s = computeStats(detections);
      setStats(s);
      if (s) {
        setAdPerf(prev => {
          const p = prev[s.adKey] || { ad: s.ad, totalViewers: 0, males: 0, females: 0, frames: 0 };
          return {
            ...prev,
            [s.adKey]: {
              ad: s.ad,
              totalViewers: p.totalViewers + s.total,
              males:        p.males        + s.males,
              females:      p.females      + s.females,
              frames:       p.frames       + 1,
            },
          };
        });
      }

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

      {/* Body — 2 column: left=camera+ads, right=stats */}
      <div className="flex-1 flex flex-row overflow-hidden min-h-0">

        {/* ── LEFT: Camera feed + Ad banners ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Camera feed */}
          <div className="relative bg-black flex items-center justify-center" style={{ height: "45%" }}>
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
                <button onClick={() => window.location.reload()} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-5 py-2 rounded-lg transition-colors">Reload page</button>
              </div>
            )}
            {phase === "cam_error" && (
              <div className="text-center px-8 max-w-xs">
                <div className="text-4xl mb-3">📷</div>
                {camError === "permission" && <>
                  <div className="text-white font-semibold mb-2">Camera access blocked</div>
                  <div className="text-slate-400 text-sm mb-3">Your browser blocked the camera. To fix it:</div>
                  <ol className="text-slate-400 text-xs text-left space-y-1.5 mb-4 list-decimal list-inside">
                    <li>Click the <strong className="text-slate-300">camera icon</strong> in the address bar</li>
                    <li>Select <strong className="text-slate-300">Always allow</strong></li>
                    <li>Click the button below</li>
                  </ol>
                </>}
                {camError === "notfound" && <>
                  <div className="text-white font-semibold mb-2">No camera found</div>
                  <div className="text-slate-400 text-sm mb-4">No camera was detected. Plug in a webcam and try again.</div>
                </>}
                {camError === "inuse" && <>
                  <div className="text-white font-semibold mb-2">Camera is in use</div>
                  <div className="text-slate-400 text-sm mb-4">Another app is using the camera. Close it and try again.</div>
                </>}
                {camError === "unknown" && <>
                  <div className="text-white font-semibold mb-2">Camera error</div>
                  <div className="text-slate-400 text-sm mb-4">Could not start the camera. Make sure this page is served over HTTPS.</div>
                </>}
                <button onClick={startCamera} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-5 py-2 rounded-lg transition-colors">Try again</button>
              </div>
            )}
            <video
              ref={videoRef} autoPlay playsInline muted
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

          {/* Ad banners — full width of left column */}
          <div className="flex-1 overflow-y-auto bg-slate-950 p-4">
            {stats ? (
              <AdRecommendation
                ageGroup={stats.dominantAge}
                crowdGender={stats.crowdGender}
                ageConfident={stats.ageConfident}
                emotion={stats.dominantExpr}
                qualityScore={null}
                hero
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                {running ? "Looking for faces..." : "Starting camera..."}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Stats sidebar ── */}
        <div className="w-72 bg-slate-900 border-l border-slate-800 overflow-y-auto shrink-0">
          {!stats ? (
            <div className="flex items-center justify-center h-full text-slate-600 text-sm p-6 text-center">
              {running ? "Analysing..." : "Starting..."}
            </div>
          ) : (
            <div className="p-4 space-y-5">

              {/* Audience */}
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Audience</div>
                <StatRow label="Viewers"    value={stats.total}                          color="text-green-400" />
                <StatRow label="Avg age"    value={`${stats.avgAge} years`}              color="text-purple-400" />
                <StatRow label="Age group"  value={stats.dominantAge.replace("_", " ")} color="text-indigo-400" />
              </div>

              {/* Gender */}
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mb-2">Gender Split</div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-xs">Crowd</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    stats.crowdGender === "male"   ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                    stats.crowdGender === "female" ? "bg-pink-500/20 text-pink-300 border-pink-500/30" :
                                                     "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                  }`}>{stats.crowdGender === "mixed" ? "Mixed" : `${stats.crowdGender} majority`}</span>
                </div>
                <GenderBar malePct={stats.malePct} femalePct={stats.femalePct} />
              </div>

              {/* Expressions */}
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mb-2">
                  Expressions · <span className="text-slate-400 normal-case tracking-normal capitalize">{EXPR_LABEL[stats.dominantExpr] || stats.dominantExpr}</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { key: "happy",     color: "#34d399" },
                    { key: "surprised", color: "#60a5fa" },
                    { key: "neutral",   color: "#94a3b8" },
                    { key: "angry",     color: "#f87171" },
                    { key: "sad",       color: "#a78bfa" },
                    { key: "disgusted", color: "#fb923c" },
                    { key: "fearful",   color: "#facc15" },
                  ].map(({ key, color }) => (
                    <ExprBar key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} value={(stats.exprTotals[key] || 0) / stats.total} color={color} />
                  ))}
                </div>
              </div>

              {/* Ad performance this session */}
              {Object.keys(adPerf).length > 0 && (
                <div>
                  <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Ad Performance · Session</div>
                  <div className="space-y-2">
                    {Object.entries(adPerf)
                      .sort((a, b) => b[1].totalViewers - a[1].totalViewers)
                      .map(([key, p]) => {
                        const avgV    = p.frames > 0 ? (p.totalViewers / p.frames).toFixed(1) : 0;
                        const malePct = p.totalViewers > 0 ? Math.round((p.males / p.totalViewers) * 100) : 0;
                        return (
                          <div key={key} className="bg-slate-800 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-base">{p.ad.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-white text-xs font-semibold truncate">{p.ad.brand}</div>
                                <div className="text-slate-500 text-xs">{p.ad.category}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-green-400 text-xs font-bold">{p.totalViewers} views</div>
                                <div className="text-slate-500 text-xs">avg {avgV}/frame</div>
                              </div>
                            </div>
                            <div className="text-slate-600 text-xs">{malePct}% male · {100 - malePct}% female</div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

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
