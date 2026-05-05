/**
 * LandingPage.jsx — Professional startup-style landing page
 * Shown before the user enters the dashboard.
 */

import { useState, useEffect, useRef, useCallback } from "react";

function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0);
  const raf = useRef(null);
  const start = useRef(null);
  const run = useCallback(() => {
    const step = (ts) => {
      if (!start.current) start.current = ts;
      const pct = Math.min((ts - start.current) / duration, 1);
      setCount(Math.round(pct * target));
      if (pct < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [target, duration]);
  useEffect(() => {
    run();
    return () => cancelAnimationFrame(raf.current);
  }, [run]);
  return count;
}
import {
  AreaChart, Area, LineChart, Line,
  ResponsiveContainer, Tooltip
} from "recharts";

const AGE_ORDER  = ["child", "youth", "adult", "middle_aged", "senior"];
const AGE_COLORS = { child: "#a78bfa", youth: "#60a5fa", adult: "#34d399", middle_aged: "#fb923c", senior: "#f87171" };
const AD_ICONS   = {
  "Toys / Boys Games":"🚀","Toys / Girls Games":"🎀","Gaming / Sports":"🎮",
  "Fashion / Beauty":"👗","Cars / Finance":"🚗","Lifestyle / Travel":"✈️",
  "Health / Home Appliances":"🏠","Skincare / Wellness":"💆",
  "Healthcare / Insurance":"🏥","General Ad":"📢",
};
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
  const animated = useCountUp(Number(value) || 0, 1400);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">{label}</span>
        <span className="text-xs text-slate-600">{sub}</span>
      </div>
      <div className="text-3xl font-bold" style={{ color }}>
        {animated}<span className="text-lg font-normal text-slate-500 ml-1">{unit}</span>
      </div>
      <Sparkline data={data} color={color} />
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/40 transition-colors duration-300">
      <div className="text-3xl mb-4">{icon}</div>
      <div className="text-white font-semibold mb-2">{title}</div>
      <div className="text-slate-400 text-sm leading-relaxed">{desc}</div>
    </div>
  );
}

function Step({ n, title, desc }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">
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
            <img src="/logo-main.png" alt="SLS Logo" className="w-8 h-8 rounded-full" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-white tracking-tight text-sm">SmartAudience</span>
              <span className="text-[9px] text-blue-400 font-medium tracking-widest uppercase">Powered by SLS</span>
            </div>
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
            className="text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: "#1e6dd4" }}
          >
            Open Dashboard →
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-400 text-sm mb-8">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            Real-time AI audience analytics
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6">
            Know your audience.<br />
            <span className="text-blue-400">Show the right ad.</span>
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
              className="text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm flex items-center gap-2"
              style={{ backgroundColor: "#1e6dd4" }}
            >
              <span>📷</span> Live camera
            </button>
            <button
              onClick={() => setShowVideoModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-6 py-3 rounded-xl border border-slate-700 hover:border-blue-500/40 transition-colors text-sm flex items-center gap-2"
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {recordings.map((rec, i) => (
                <div key={rec.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-blue-500/30 transition-colors">

                  {/* Title */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-white font-semibold">Recording {i + 1}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-slate-500 text-xs">📍</span>
                        <span className="text-blue-400 text-xs font-medium">{rec.location}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-600">{rec.duration}s · {rec.timestamp}</span>
                  </div>

                  {rec.stats ? (<>

                    {/* Key numbers */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "Detections",   value: rec.stats.total,    color: "text-green-400"  },
                        { label: "Peak viewers", value: rec.peakViewers,    color: "text-yellow-400" },
                        { label: "Avg age",      value: rec.stats.avgAge,   color: "text-purple-400" },
                        { label: "Gender",       value: rec.stats.crowdGender,
                          color: rec.stats.crowdGender === "male" ? "text-blue-400" : rec.stats.crowdGender === "female" ? "text-pink-400" : "text-yellow-400" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-slate-800 rounded-lg p-2 text-center">
                          <div className={`font-bold text-base ${color}`}>{value}</div>
                          <div className="text-slate-500 text-xs leading-tight mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Timeline chart */}
                    {rec.timeline?.length > 0 && (
                      <div>
                        <div className="text-slate-500 text-xs uppercase tracking-widest mb-2">Audience flow</div>
                        <ResponsiveContainer width="100%" height={64}>
                          <AreaChart data={rec.timeline} margin={{ top: 2, right: 0, bottom: 0, left: -24 }}>
                            <defs>
                              <linearGradient id={`g-${rec.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="#818cf8" stopOpacity={0}   />
                              </linearGradient>
                            </defs>
                            <Tooltip
                              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11 }}
                              formatter={v => [`${v} faces`, ""]}
                              labelFormatter={l => `${l}`}
                            />
                            <Area type="monotone" dataKey="count" stroke="#818cf8" strokeWidth={2} fill={`url(#g-${rec.id})`} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Age breakdown */}
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-widest mb-2">Age breakdown</div>
                      <div className="space-y-1.5">
                        {AGE_ORDER.filter(g => rec.stats.ageCounts?.[g]).map(g => {
                          const pct = Math.round((rec.stats.ageCounts[g] / rec.stats.total) * 100);
                          return (
                            <div key={g} className="flex items-center gap-2">
                              <span className="text-slate-500 text-xs w-16 shrink-0 capitalize">{g.replace("_"," ")}</span>
                              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: AGE_COLORS[g] }} />
                              </div>
                              <span className="text-xs text-slate-400 w-7 text-right">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Gender bar */}
                    <div>
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden flex mb-1">
                        <div className="bg-blue-500 h-full" style={{ width: `${rec.stats.malePct * 100}%` }} />
                        <div className="bg-pink-500 h-full" style={{ width: `${rec.stats.femalePct * 100}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Male {Math.round(rec.stats.malePct * 100)}%</span>
                        <span>Female {Math.round(rec.stats.femalePct * 100)}%</span>
                      </div>
                    </div>

                    {/* Ad recommendation */}
                    <div className="rounded-xl px-3 py-2.5 flex items-center gap-2 border" style={{ background: "#1e6dd415", borderColor: "#1e6dd440" }}>
                      <span className="text-xl">{AD_ICONS[rec.stats.adCategory] || "📢"}</span>
                      <div>
                        <div className="text-white text-xs font-semibold">{rec.stats.adCategory}</div>
                        <div className="text-slate-500 text-xs">{rec.stats.dominantAge.replace("_"," ")} · {rec.stats.dominantExpr}</div>
                      </div>
                    </div>

                  </>) : (
                    <div className="text-slate-500 text-sm">No faces detected</div>
                  )}
                </div>
              ))}

              {/* Add another recording */}
              <button
                onClick={() => setShowVideoModal(true)}
                className="bg-slate-900/50 border border-dashed border-slate-700 hover:border-blue-500/40 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-slate-300 transition-all min-h-[200px]"
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
        <div className="max-w-3xl mx-auto text-center rounded-3xl px-8 py-14 border" style={{ background: "#1e6dd412", borderColor: "#1e6dd435" }}>
          <h2 className="text-3xl font-bold mb-4">See it live</h2>
          <p className="text-slate-400 mb-8 max-w-md mx-auto text-sm leading-relaxed">
            Test right now with your device camera — no install, no signup.
            The AI runs entirely in your browser.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => setShowCamera(true)}
              className="text-white font-semibold px-8 py-3 rounded-xl transition-colors flex items-center gap-2"
              style={{ backgroundColor: "#1e6dd4" }}
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
            <img src="/logo-main.png" alt="SLS Logo" className="w-6 h-6 rounded-full" />
            <div className="flex flex-col leading-tight">
              <span className="text-slate-400 text-sm">SmartAudience</span>
              <span className="text-[9px] text-blue-400 tracking-widest uppercase">Powered by SLS</span>
            </div>
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
