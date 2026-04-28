/**
 * LandingPage.jsx — Professional startup-style landing page
 * Shown before the user enters the dashboard.
 */

import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, LineChart, Line,
  ResponsiveContainer, Tooltip
} from "recharts";
import BrowserCamera from "./BrowserCamera";
import VideoAnalysis from "./VideoAnalysis";

// ── Sparkline demo data ────────────────────────────────────────────────────────
const mkSparkline = (base, amp, n = 24) =>
  Array.from({ length: n }, (_, i) => ({
    i,
    v: Math.max(0, Math.min(100,
      base + Math.sin(i / 3.5) * amp + (Math.random() - 0.5) * amp * 0.4
    )),
  }));

const ENG_DATA  = mkSparkline(65, 20);
const ATT_DATA  = mkSparkline(72, 15);
const VIEW_DATA = mkSparkline(3,  2);

// ── Sub-components ─────────────────────────────────────────────────────────────

function Sparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone" dataKey="v"
          stroke={color} strokeWidth={2}
          fill={`url(#grad-${color})`}
          dot={false} isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MetricCard({ label, value, unit, color, data, sub }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">{label}</span>
        <span className="text-xs text-slate-600">{sub}</span>
      </div>
      <div className="text-3xl font-bold" style={{ color }}>
        {value}<span className="text-lg font-normal text-slate-500 ml-1">{unit}</span>
      </div>
      <Sparkline data={data} color={color} />
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/40 transition-colors duration-300">
      <div className="text-3xl mb-4">{icon}</div>
      <div className="text-white font-semibold mb-2">{title}</div>
      <div className="text-slate-400 text-sm leading-relaxed">{desc}</div>
    </div>
  );
}

function Step({ n, title, desc }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
        {n}
      </div>
      <div>
        <div className="text-white font-semibold mb-1">{title}</div>
        <div className="text-slate-400 text-sm leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LandingPage({ onEnterDashboard }) {
  const [scrolled,       setScrolled]       = useState(false);
  const [showCamera,     setShowCamera]     = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [recordings,     setRecordings]     = useState([]);
  const recordingsSectionRef = useRef(null);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  function handleRecordingComplete(rec) {
    setRecordings(prev => [...prev, rec]);
  }

  function handleVideoModalClose() {
    setShowVideoModal(false);
    // If there are recordings, scroll to the section after the modal closes
    if (recordings.length >= 0) {
      setTimeout(() => {
        recordingsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">

      {/* ── Overlays ───────────────────────────────────────────────────────── */}
      {showCamera && (
        <BrowserCamera onClose={() => setShowCamera(false)} />
      )}
      {showVideoModal && (
        <VideoAnalysis
          recordingIndex={recordings.length + 1}
          onClose={handleVideoModalClose}
          onRecordingComplete={handleRecordingComplete}
        />
      )}

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-slate-950/80 backdrop-blur-md border-b border-slate-800/60" : ""
      }`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-xs font-bold tracking-tight">
              SA
            </div>
            <span className="font-semibold text-white tracking-tight">SmartAudience</span>
          </div>

          {/* Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features"    className="text-slate-400 text-sm hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-slate-400 text-sm hover:text-white transition-colors">How it works</a>
            <a href="#metrics"     className="text-slate-400 text-sm hover:text-white transition-colors">Analytics</a>
            <a
              href="https://github.com/Aribashakil20/cohort-1"
              target="_blank" rel="noreferrer"
              className="text-slate-400 text-sm hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>

          <button
            onClick={onEnterDashboard}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Open Dashboard →
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-400 text-sm mb-8">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
            Real-time AI audience analytics
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6">
            Know your audience.<br />
            <span className="text-indigo-400">Show the right ad.</span>
          </h1>

          {/* Subtext */}
          <p className="text-slate-400 text-lg leading-relaxed max-w-xl mx-auto mb-10">
            SmartAudience uses computer vision to detect who is watching your display
            in real time — age, gender, emotion — and automatically recommends the
            most relevant ad to show.
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => setShowCamera(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm flex items-center gap-2"
            >
              <span>📷</span> Live camera
            </button>
            <button
              onClick={() => setShowVideoModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-6 py-3 rounded-xl border border-slate-700 hover:border-indigo-500/40 transition-colors text-sm flex items-center gap-2"
            >
              <span>🎥</span> Analyse a recording
            </button>
            <button
              onClick={onEnterDashboard}
              className="text-slate-400 hover:text-white text-sm px-6 py-3 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors"
            >
              Dashboard →
            </button>
          </div>
        </div>
      </section>

      {/* ── Live metrics ───────────────────────────────────────────────────── */}
      <section id="metrics" className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-slate-500 text-sm uppercase tracking-widest mb-2">Live analytics</div>
            <h2 className="text-2xl font-bold">Everything tracked. In real time.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="Engagement Rate"  value="67"  unit="%"
              color="#818cf8" data={ENG_DATA}
              sub="looking at screen"
            />
            <MetricCard
              label="Attention Score"  value="74"  unit="/100"
              color="#34d399" data={ATT_DATA}
              sub="gaze intensity"
            />
            <MetricCard
              label="Viewers Detected" value="3"   unit="people"
              color="#60a5fa" data={VIEW_DATA}
              sub="current snapshot"
            />
          </div>
          <p className="text-center text-slate-600 text-xs mt-4">
            Sample data shown — connect a camera to see live numbers
          </p>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-slate-500 text-sm uppercase tracking-widest mb-2">What it does</div>
            <h2 className="text-2xl font-bold">Built for digital displays</h2>
            <p className="text-slate-400 text-sm mt-2 max-w-lg mx-auto">
              Every metric that matters for understanding your audience — powered by AI, updated every 10 seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon="🎯"
              title="Smart Ad Targeting"
              desc="Matches ad categories to the dominant age and gender in frame. Only shows a targeted ad when one group is clearly 60%+ of the crowd — otherwise shows a neutral ad."
            />
            <FeatureCard
              icon="😊"
              title="Emotion Detection"
              desc="Detects 8 emotions per face using the FerPlus model. Angry or frustrated crowd? Automatically switches to a calmer wellness ad to protect brand perception."
            />
            <FeatureCard
              icon="👁️"
              title="Real Gaze Detection"
              desc="Uses head pose estimation (solvePnP) to compute yaw and pitch angles. Only counts someone as engaged if they're actually facing the screen — not just nearby."
            />
            <FeatureCard
              icon="🪪"
              title="Unique Visitor Tracking"
              desc="Each face gets a 512-dimensional ArcFace fingerprint. The same person standing for 5 minutes is counted once, not 30 times. Resets after 5 minutes of absence."
            />
            <FeatureCard
              icon="📊"
              title="Attention Score"
              desc="Continuous 0–100 score per face based on how directly they face the screen. Dead center = 100. Slightly turned = 60s. At the threshold angle = 0."
            />
            <FeatureCard
              icon="⚡"
              title="Real-time Dashboard"
              desc="WebSocket streaming pushes updates the instant data is saved. 5 tabs: Live View, Analytics, Ad Performance, Alerts, and Settings."
            />
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-slate-500 text-sm uppercase tracking-widest mb-2">How it works</div>
            <h2 className="text-2xl font-bold">Three steps. Zero setup friction.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            {/* Steps */}
            <div className="flex flex-col gap-8">
              <Step
                n="1" title="Point a camera at your display"
                desc="Works with any USB webcam or RTSP IP camera. The system opens the feed automatically — no manual configuration needed."
              />
              <Step
                n="2" title="AI detects the audience"
                desc="InsightFace runs every 15 frames detecting age, gender, emotion, gaze direction, and a unique face fingerprint for each person."
              />
              <Step
                n="3" title="Dashboard updates in real time"
                desc="Every 10 seconds a new analytics row is saved and pushed to the dashboard via WebSocket. The ad recommendation card updates automatically."
              />
            </div>

            {/* Ad decision card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="text-slate-400 text-xs uppercase tracking-widest mb-5">Ad decision logic</div>
              <div className="space-y-3">
                {[
                  { g: "≥60% Male",   a: "≥60% Adult",  ad: "Cars / Finance",        color: "text-blue-400"   },
                  { g: "≥60% Female", a: "≥60% Youth",  ad: "Fashion / Beauty",      color: "text-pink-400"   },
                  { g: "Mixed",       a: "≥60% Senior", ad: "Healthcare / Insurance", color: "text-green-400"  },
                  { g: "Mixed",       a: "Mixed",        ad: "General Ad",             color: "text-slate-400"  },
                ].map(({ g, a, ad, color }) => (
                  <div key={ad} className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-3 text-sm">
                    <div className="flex gap-3">
                      <span className="text-slate-400">{g}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400">{a}</span>
                    </div>
                    <span className={`font-semibold ${color}`}>{ad}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800 text-slate-500 text-xs">
                Emotion override: anger/disgust → calmer wellness ad regardless of demographics
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Recordings ─────────────────────────────────────────────────────── */}
      {recordings.length > 0 && (
        <section id="recordings" ref={recordingsSectionRef} className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <div className="text-slate-500 text-sm uppercase tracking-widest mb-2">Video analysis</div>
              <h2 className="text-2xl font-bold">Your recordings</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordings.map((rec, i) => (
                <div key={rec.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3 hover:border-indigo-500/30 transition-colors">
                  {/* Title row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-white font-semibold text-sm">Recording {i + 1}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-slate-500">📍</span>
                        <span className="text-indigo-400 text-xs font-medium">{rec.location}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-600 shrink-0 ml-2">{rec.duration}s</span>
                  </div>

                  {/* Stats row */}
                  {rec.stats ? (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-800 rounded-lg p-2 text-center">
                          <div className="text-green-400 font-bold text-lg">{rec.stats.total}</div>
                          <div className="text-slate-500 text-xs">Detections</div>
                        </div>
                        <div className="bg-slate-800 rounded-lg p-2 text-center">
                          <div className="text-purple-400 font-bold text-lg">{rec.stats.avgAge}</div>
                          <div className="text-slate-500 text-xs">Avg age</div>
                        </div>
                        <div className="bg-slate-800 rounded-lg p-2 text-center">
                          <div className={`font-bold text-sm leading-tight mt-1 ${
                            rec.stats.crowdGender === "male" ? "text-blue-400" :
                            rec.stats.crowdGender === "female" ? "text-pink-400" : "text-yellow-400"
                          }`}>{rec.stats.crowdGender}</div>
                          <div className="text-slate-500 text-xs">Gender</div>
                        </div>
                      </div>

                      {/* Gender bar */}
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden flex">
                        <div className="bg-blue-500 h-full" style={{ width: `${rec.stats.malePct * 100}%` }} />
                        <div className="bg-pink-500 h-full" style={{ width: `${rec.stats.femalePct * 100}%` }} />
                      </div>

                      {/* Ad recommendation */}
                      <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-xl px-3 py-2.5 flex items-center gap-2">
                        <span className="text-lg">{{"Toys / Boys Games":"🚀","Toys / Girls Games":"🎀","Gaming / Sports":"🎮","Fashion / Beauty":"👗","Cars / Finance":"🚗","Lifestyle / Travel":"✈️","Health / Home Appliances":"🏠","Skincare / Wellness":"💆","Healthcare / Insurance":"🏥","General Ad":"📢"}[rec.stats.adCategory] || "📢"}</span>
                        <div>
                          <div className="text-white text-xs font-semibold">{rec.stats.adCategory}</div>
                          <div className="text-slate-500 text-xs">{rec.stats.dominantAge.replace("_"," ")} · {rec.stats.dominantExpr}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-500 text-sm">No faces detected</div>
                  )}

                  <div className="text-slate-600 text-xs mt-auto">{rec.timestamp}</div>
                </div>
              ))}

              {/* Add another recording */}
              <button
                onClick={() => setShowVideoModal(true)}
                className="bg-slate-900/50 border border-dashed border-slate-700 hover:border-indigo-500/40 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-slate-300 transition-all min-h-[200px]"
              >
                <span className="text-3xl">＋</span>
                <span className="text-sm font-medium">Add recording</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── CTA banner ─────────────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto text-center bg-indigo-600/10 border border-indigo-500/20 rounded-3xl px-8 py-14">
          <h2 className="text-3xl font-bold mb-4">See it live</h2>
          <p className="text-slate-400 mb-8 max-w-md mx-auto text-sm leading-relaxed">
            Test right now with your device camera — no install, no signup.
            The AI runs entirely in your browser.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => setShowCamera(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-xl transition-colors flex items-center gap-2"
            >
              <span>📷</span> Test with your camera
            </button>
            <button
              onClick={onEnterDashboard}
              className="text-slate-300 hover:text-white text-sm font-medium px-8 py-3 rounded-xl border border-slate-600 hover:border-slate-400 transition-colors"
            >
              Open Dashboard →
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-xs font-bold">SA</div>
            <span className="text-slate-400 text-sm">SmartAudience</span>
          </div>
          <div className="text-slate-600 text-xs">
            Built with InsightFace · FerPlus · FastAPI · React · Recharts
          </div>
          <div className="flex gap-5">
            <a href="#features"    className="text-slate-500 text-sm hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-slate-500 text-sm hover:text-white transition-colors">How it works</a>
            <a
              href="https://github.com/Aribashakil20/cohort-1"
              target="_blank" rel="noreferrer"
              className="text-slate-500 text-sm hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
