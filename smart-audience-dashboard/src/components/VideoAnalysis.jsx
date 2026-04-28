/**
 * VideoAnalysis.jsx — Record or upload a video and analyse it with face-api.js
 *
 * Flow:
 *   1. User enters a location name (e.g. "Mall Entrance")
 *   2. Chooses "Record from camera" or "Upload video file"
 *   3. AI processes the video frame-by-frame (1 fps) with a progress bar
 *   4. Results are returned to the parent as a structured recording object
 *
 * All inference runs in the browser — no data leaves the device.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import * as faceapi from "face-api.js";

const MODEL_URL = "/models";
const GENDER_THRESHOLD = 0.60;
const AGE_THRESHOLD    = 0.60;

// ── Shared ad logic ────────────────────────────────────────────────────────────
function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 24) return "youth";
  if (age <= 40) return "adult";
  if (age <= 60) return "middle_aged";
  return "senior";
}
const AD_MAP = {
  "child-M": "Toys / Boys Games", "child-F": "Toys / Girls Games",
  "youth-M": "Gaming / Sports",   "youth-F": "Fashion / Beauty",
  "adult-M": "Cars / Finance",    "adult-F": "Lifestyle / Travel",
  "middle_aged-M": "Health / Home Appliances", "middle_aged-F": "Skincare / Wellness",
  "senior-M": "Healthcare / Insurance",        "senior-F": "Healthcare / Insurance",
};
const MIXED_AGE_AD = {
  child: "Toys / Boys Games", youth: "Gaming / Sports",
  adult: "Lifestyle / Travel", middle_aged: "Health / Home Appliances",
  senior: "Healthcare / Insurance",
};
const NEGATIVE_OVERRIDE = {
  child: "Toys / Boys Games", youth: "Lifestyle / Travel",
  adult: "Health / Home Appliances", middle_aged: "Skincare / Wellness",
  senior: "Healthcare / Insurance",
};
const AD_ICONS = {
  "Toys / Boys Games": "🚀", "Toys / Girls Games": "🎀",
  "Gaming / Sports": "🎮",  "Fashion / Beauty": "👗",
  "Cars / Finance": "🚗",   "Lifestyle / Travel": "✈️",
  "Health / Home Appliances": "🏠", "Skincare / Wellness": "💆",
  "Healthcare / Insurance": "🏥",  "General Ad": "📢",
};

function computeStats(allDetections) {
  const total = allDetections.length;
  if (total === 0) return null;

  const males      = allDetections.filter(d => d.gender === "male"   && d.genderProbability > 0.6).length;
  const females    = allDetections.filter(d => d.gender === "female" && d.genderProbability > 0.6).length;
  const genderKnown = males + females;
  const malePct    = genderKnown > 0 ? males   / genderKnown : 0;
  const femalePct  = genderKnown > 0 ? females / genderKnown : 0;
  const crowdGender = malePct >= GENDER_THRESHOLD ? "male" : femalePct >= GENDER_THRESHOLD ? "female" : "mixed";

  const ageCounts = {};
  allDetections.forEach(d => {
    const g = getAgeGroup(Math.round(d.age));
    ageCounts[g] = (ageCounts[g] || 0) + 1;
  });
  const dominantAge    = Object.entries(ageCounts).sort((a,b) => b[1]-a[1])[0][0];
  const ageConfident   = ageCounts[dominantAge] / total >= AGE_THRESHOLD;

  const exprTotals = {};
  allDetections.forEach(d => {
    Object.entries(d.expressions).forEach(([k, v]) => {
      exprTotals[k] = (exprTotals[k] || 0) + v;
    });
  });
  const dominantExpr = Object.entries(exprTotals).sort((a,b) => b[1]-a[1])[0][0];
  const isNegative   = ["angry", "disgusted", "fearful"].includes(dominantExpr);

  let adCategory;
  if (crowdGender === "mixed" && !ageConfident) adCategory = "General Ad";
  else if (crowdGender === "mixed") adCategory = isNegative ? NEGATIVE_OVERRIDE[dominantAge] : MIXED_AGE_AD[dominantAge] || "General Ad";
  else if (!ageConfident) adCategory = crowdGender === "female" ? "Lifestyle / Travel" : "Gaming / Sports";
  else {
    const key = `${dominantAge}-${crowdGender === "male" ? "M" : "F"}`;
    adCategory = isNegative ? NEGATIVE_OVERRIDE[dominantAge] : AD_MAP[key] || "General Ad";
  }

  const avgAge = Math.round(allDetections.reduce((s, d) => s + d.age, 0) / total);

  return { total, males, females, malePct, femalePct, crowdGender, dominantAge, ageConfident, dominantExpr, adCategory, avgAge, exprTotals, ageCounts };
}

// ── Process a video element frame-by-frame ────────────────────────────────────
async function analyzeVideoElement(videoEl, onProgress) {
  const duration = isFinite(videoEl.duration) ? videoEl.duration : 0;
  if (duration === 0) return [];

  const STEP = 1; // seconds between sampled frames
  const allDetections = [];
  const steps = Math.floor(duration / STEP);

  for (let i = 0; i <= steps; i++) {
    videoEl.currentTime = i * STEP;
    await new Promise(res => { videoEl.onseeked = res; });

    const dets = await faceapi
      .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
      .withAgeAndGender()
      .withFaceExpressions();

    allDetections.push(...dets);
    onProgress(Math.round(((i + 1) / (steps + 1)) * 100));
  }
  return allDetections;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VideoAnalysis({ onClose, onRecordingComplete, recordingIndex }) {
  const [modelsReady,   setModelsReady]   = useState(false);
  const [modelError,    setModelError]    = useState(false);
  const [location,      setLocation]      = useState("");
  // mode: idle | recording | stopping | processing | done | error
  const [mode,          setMode]          = useState("idle");
  const [progress,      setProgress]      = useState(0);
  const [recordingSec,  setRecordingSec]  = useState(0);
  const [result,        setResult]        = useState(null);

  const liveVideoRef    = useRef(null);
  const streamRef       = useRef(null);
  const recorderRef     = useRef(null);
  const chunksRef       = useRef([]);
  const timerRef        = useRef(null);
  const fileInputRef    = useRef(null);

  // ── Load models ────────────────────────────────────────────────────────────
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

  // ── Record from camera ─────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play();
      }
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(200);
      setMode("recording");
      setRecordingSec(0);
      timerRef.current = setInterval(() => setRecordingSec(s => s + 1), 1000);
    } catch {
      setMode("error");
    }
  }, []);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    setMode("stopping");
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());

    recorderRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      await processBlob(blob);
    };
  }, []); // eslint-disable-line

  // ── Upload handler ─────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMode("processing");
    setProgress(0);
    await processBlob(file);
  }, []); // eslint-disable-line

  // ── Core: process a Blob ───────────────────────────────────────────────────
  async function processBlob(blob) {
    setMode("processing");
    setProgress(0);

    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src   = url;
    video.muted = true;
    video.preload = "auto";

    try {
      await new Promise((res, rej) => {
        video.onloadedmetadata = res;
        video.onerror = rej;
      });

      const allDetections = await analyzeVideoElement(video, setProgress);
      URL.revokeObjectURL(url);

      const stats = computeStats(allDetections);
      const recording = {
        id:        Date.now(),
        index:     recordingIndex,
        location:  location.trim() || "Unknown location",
        timestamp: new Date().toLocaleString(),
        duration:  Math.round(video.duration),
        peakViewers: 0, // computed below
        stats,
      };
      setResult(recording);
      onRecordingComplete(recording);
      setMode("done");
    } catch {
      URL.revokeObjectURL(url);
      setMode("error");
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs font-bold">SA</div>
            <span className="font-semibold text-white">Recording {recordingIndex}</span>
            {mode === "recording" && (
              <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                REC {fmtSec(recordingSec)}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors">
            ✕ Close
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Model loading */}
          {!modelsReady && !modelError && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-slate-400 text-sm">Loading AI models...</div>
            </div>
          )}
          {modelError && (
            <div className="text-center py-8 text-slate-400 text-sm">
              Failed to load models. Check your connection and refresh.
            </div>
          )}

          {modelsReady && mode !== "done" && (
            <>
              {/* Location input */}
              <div>
                <label className="block text-slate-400 text-xs uppercase tracking-widest mb-2">Location label</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Mall Entrance, Food Court, Gate 3…"
                  disabled={mode !== "idle"}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              {/* Mode idle — two options */}
              {mode === "idle" && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={startRecording}
                    className="flex flex-col items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/40 rounded-xl p-5 transition-all"
                  >
                    <span className="text-3xl">🎥</span>
                    <div className="text-center">
                      <div className="text-white font-semibold text-sm">Record from camera</div>
                      <div className="text-slate-500 text-xs mt-0.5">Live recording via webcam</div>
                    </div>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/40 rounded-xl p-5 transition-all"
                  >
                    <span className="text-3xl">📁</span>
                    <div className="text-center">
                      <div className="text-white font-semibold text-sm">Upload video file</div>
                      <div className="text-slate-500 text-xs mt-0.5">MP4, WebM, MOV…</div>
                    </div>
                  </button>
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                </div>
              )}

              {/* Live camera preview while recording */}
              {mode === "recording" && (
                <div className="space-y-3">
                  <video
                    ref={liveVideoRef}
                    autoPlay playsInline muted
                    className="w-full rounded-xl bg-black"
                    style={{ transform: "scaleX(-1)", maxHeight: "240px", objectFit: "cover" }}
                  />
                  <button
                    onClick={stopRecording}
                    className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="w-3 h-3 bg-white rounded-sm" />
                    Stop & Analyse
                  </button>
                </div>
              )}

              {/* Processing / stopping */}
              {(mode === "stopping" || mode === "processing") && (
                <div className="py-6 space-y-4">
                  <div className="text-center text-slate-300 text-sm font-medium">
                    {mode === "stopping" ? "Preparing video…" : `Analysing frames… ${progress}%`}
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-center text-slate-500 text-xs">
                    Processing 1 frame per second — this may take a moment
                  </div>
                </div>
              )}

              {mode === "error" && (
                <div className="text-center text-slate-400 text-sm py-4">
                  Something went wrong. Make sure the file is a valid video and try again.
                </div>
              )}
            </>
          )}

          {/* Done — show summary */}
          {mode === "done" && result?.stats && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                <span>✓</span> Analysis complete
              </div>

              {/* Key numbers */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-green-400 font-bold text-2xl">{result.stats.total}</div>
                  <div className="text-slate-500 text-xs mt-0.5">Face detections</div>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-purple-400 font-bold text-2xl">{result.stats.avgAge}</div>
                  <div className="text-slate-500 text-xs mt-0.5">Avg age</div>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-indigo-400 font-bold text-lg leading-tight mt-1">{result.duration}s</div>
                  <div className="text-slate-500 text-xs mt-0.5">Duration</div>
                </div>
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

              {/* Ad recommendation */}
              <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-xl p-4">
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-2">Recommended Ad</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{AD_ICONS[result.stats.adCategory] || "📢"}</span>
                  <span className="text-white font-bold">{result.stats.adCategory}</span>
                </div>
                <div className="text-slate-500 text-xs mt-1">
                  {result.stats.dominantAge.replace("_"," ")} · {result.stats.crowdGender} · dominant mood: {result.stats.dominantExpr}
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
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
